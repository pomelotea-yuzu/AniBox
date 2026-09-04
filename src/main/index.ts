// 修复 Electron-in-Electron 嵌套问题：WorkBuddy/VSCode 终端继承 ELECTRON_RUN_AS_NODE=1
// 导致 require('electron') 返回 exe 路径而非 API 模块
delete process.env.ELECTRON_RUN_AS_NODE
delete (process.env as any).ELECTRON_RUN_AS_NODE

// 便携版数据重定向：必须在任何 userData 访问前执行（首个 import）
import './bootstrap'

import { app, BrowserWindow, protocol, Menu } from 'electron'
import { join } from 'path'
import * as store from './store'
import { flushStore } from './store'
import { stopWatching } from './file-watcher'
import {
  startStreamServer,
  stopStreamServer,
} from './stream-server'
import { startRssServer } from './animegarden'
import { setMpvWindowGetter, libmpvQuit, mpvKill } from './mpv-backend'
import { registerProtocol } from './protocol'
import { registerVideoIpc } from './ipc/video'
import { registerLibraryIpc } from './ipc/library'
import { registerPlayerIpc } from './ipc/player'
import { registerSubtitleIpc } from './ipc/subtitle'
import { registerTranslateIpc } from './ipc/translate'
import { registerDanmakuIpc } from './ipc/danmaku'
import { registerStreamIpc } from './ipc/stream'
import { registerCoverIpc } from './ipc/cover'
import { registerWatcherIpc } from './ipc/watcher'
import { registerAnilistIpc } from './ipc/anilist'
import { registerAnimegardenIpc } from './ipc/animegarden'

// === 硬件加速 & GPU 配置 ===
// Windows 系统级 HEVC 硬解码（Media Foundation）
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport')
// 启用视频硬件解码加速
// 注册 anibox:// 协议权限（CORS / fetch / 标准 URL 解析）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'anibox',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

app.commandLine.appendSwitch('enable-accelerated-video-decode')
// 启用零拷贝（减少 GPU→RAM 传输开销）
app.commandLine.appendSwitch('enable-zero-copy')
// 跳过 GPU 黑名单，信任现代硬件
app.commandLine.appendSwitch('ignore-gpu-blocklist')
// 启用 GPU 光栅化加速
app.commandLine.appendSwitch('enable-gpu-rasterization')

let mainWindow: BrowserWindow | null = null

const getWin = (): BrowserWindow | null => mainWindow

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'AniBox',
    show: false,
    backgroundColor: '#F5F0E8',
    icon: join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 页面就绪后再显示窗口，避免白屏/黑屏闪现
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.on('enter-full-screen', () =>
    mainWindow?.webContents.send('window:fullscreen-changed', true),
  )
  mainWindow.on('leave-full-screen', () =>
    mainWindow?.webContents.send('window:fullscreen-changed', false),
  )

  // 允许 F12 / Ctrl+Shift+I 打开 DevTools
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === 'F12' || (input.key === 'I' && input.control && input.shift))
    ) {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// === 全局异常处理 ===
// 防止未捕获异常导致静默崩溃，记录错误并尝试通知渲染进程

process.on('uncaughtException', (error: Error) => {
  console.error('[AniBox] Uncaught exception:', error.message)
  console.error('[AniBox] Stack:', error.stack)
  try {
    mainWindow?.webContents.send('app:error', {
      type: 'uncaughtException',
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n') || '',
    })
  } catch {
    /* 渲染进程可能还未就绪 */
  }
  // GPU 相关崩溃不退出（可能是驱动问题），其他保底退出
  if (
    error.message.includes('GPU') ||
    error.message.includes('gpu') ||
    error.message.includes('WebGL')
  ) {
    console.warn('[AniBox] GPU-related error, keeping app alive')
  } else {
    console.error('[AniBox] Fatal error, app will exit. Details written to log.')
  }
})

process.on('unhandledRejection', (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  console.error('[AniBox] Unhandled rejection:', msg)
  if (reason instanceof Error && reason.stack) {
    console.error('[AniBox] Stack:', reason.stack)
  }
  try {
    mainWindow?.webContents.send('app:error', {
      type: 'unhandledRejection',
      message: msg,
    })
  } catch {
    /* ok */
  }
})

// === 应用生命周期 ===

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  // GPU 信息日志（调试硬件加速状态）
  try {
    const gpuInfo = await app.getGPUInfo('basic')
    console.log('[AniBox] GPU Info:', JSON.stringify(gpuInfo, null, 2))
    const gpuFeatures = app.getGPUFeatureStatus()
    console.log('[AniBox] GPU Features:', JSON.stringify(gpuFeatures, null, 2))
  } catch (err) {
    console.warn('[AniBox] GPU info unavailable:', err)
  }

  setMpvWindowGetter(getWin)
  registerProtocol()
  registerVideoIpc(getWin)
  registerLibraryIpc(getWin)
  registerPlayerIpc(getWin)
  registerSubtitleIpc(getWin)
  registerTranslateIpc(getWin)
  registerDanmakuIpc(getWin)
  registerStreamIpc(getWin)
  registerCoverIpc(getWin)
  registerWatcherIpc(getWin)
  registerAnilistIpc(getWin)
  registerAnimegardenIpc()
  startRssServer()
  // 局域网串流：设置页开启过则随应用自启（异步启动，不阻塞窗口创建）
  if (store.getStreamSettings().enabled) {
    startStreamServer({ port: store.getStreamSettings().port }).catch(() => {})
  }
  createWindow()

  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow()
  })
})

app.on('window-all-closed', () => {
  libmpvQuit()
  mpvKill()
  stopWatching()
  stopStreamServer()
  flushStore()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  libmpvQuit()
  stopWatching()
  stopStreamServer()
  flushStore()
})
