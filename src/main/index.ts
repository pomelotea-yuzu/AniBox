// 修复 Electron-in-Electron 嵌套问题：WorkBuddy/VSCode 终端继承 ELECTRON_RUN_AS_NODE=1
// 导致 require('electron') 返回 exe 路径而非 API 模块
delete process.env.ELECTRON_RUN_AS_NODE
delete (process.env as any).ELECTRON_RUN_AS_NODE

import { app, BrowserWindow, protocol, ipcMain, dialog, Menu } from 'electron'
import { join, dirname } from 'path'
import { createReadStream, statSync, existsSync, writeFileSync, readFileSync } from 'fs'
import { spawn, ChildProcess } from 'child_process'
import { createConnection, Socket } from 'net'
import { Readable } from 'stream'
import { scanSeries, discoverAnimeRoots } from './scanner'
import * as store from './store'
import { flushStore } from './store'
import { fetchCoversBatch, fetchCoverManual } from './cover-fetcher'
import { readSubtitleAsVtt, findSubtitles } from './subtitle'
import {
  searchOnlineSubtitles,
  downloadSubtitle,
  getOpenSubtitlesStatus,
  setOpenSubtitlesConfig,
} from './online-subtitle'
import { parseMP4Meta, detectAudioCodec } from './video-info'
import {
  fetchMetadataForSeries,
  fetchMetadataBatch,
  validateBatchTitles,
  searchBangumiMeta,
} from './metadata-fetcher'
import {
  loadModel,
  getTranslateStatus,
  loadJaModel,
  translateJaToZh,
  translateEnToZh,
} from './local-translate'
import { configureAI, translateWithAI, getAIKey } from './ai-translate'
import { translateLocal } from './anime-dict'
import {
  setWhisperConfig,
  getWhisperStatus,
  getDefaultWhisperPaths,
  transcribeWithWhisper,
  setTranslationConfig,
  translateText,
  translateSubtitleSegments,
  lookupWord,
  analyzeJapaneseText,
  getTranslationStatus,
} from './whisper-translate'
import {
  fetchDanmakuForEpisode,
  cleanTitleForSearch,
  parseDanmakuFromFile,
  exportDanmakuToXML,
} from './danmaku-fetcher'
import { startWatching, stopWatching, getWatcherStatus } from './file-watcher'
import { LibmpvBridge, findLibmpvDll } from './libmpv-bridge'
import {
  searchAnimeGarden,
  listTeams,
  getQbConfig,
  setQbConfig,
  qbTestConnection,
  qbAddTorrent,
  qbAddRssFeed,
  qbAddRssRule,
  qbRemoveRssRule,
  createRssFeed,
  listRssFeeds,
  deleteRssFeed,
  startRssServer,
} from './animegarden'
import {
  startStreamServer,
  stopStreamServer,
  getStreamServerState,
} from './stream-server'
import { cleanStreamCache, getStreamCacheSizeMB, getEngineInfo, resetFfmpegDownload } from './transcode'

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

import { hashPath } from './utils'

const isDev = !app.isPackaged

const MIME: Record<string, string> = {
  // 视频格式
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.flv': 'video/x-flv',
  '.f4v': 'video/mp4',
  '.ts': 'video/mp2t',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.ogm': 'video/ogg',
  '.wmv': 'video/x-ms-wmv',
  '.asf': 'video/x-ms-asf',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.mpe': 'video/mpeg',
  '.vob': 'video/mpeg',
  '.evo': 'video/mpeg',
  '.divx': 'video/x-msvideo',
  '.rmvb': 'application/vnd.rn-realmedia',
  '.rm': 'application/vnd.rn-realmedia',
  '.qt': 'video/quicktime',
  '.mxf': 'application/mxf',
  // 图片格式
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

/** 所有支持的视频扩展名（供 dialog 过滤和格式检测使用） */
const ALL_VIDEO_EXTS = [
  'mp4',
  'mkv',
  'webm',
  'avi',
  'mov',
  'flv',
  'ts',
  'm2ts',
  'rmvb',
  'wmv',
  'm4v',
  '3gp',
  '3g2',
  'asf',
  'divx',
  'f4v',
  'mpeg',
  'mpg',
  'mpe',
  'ogv',
  'ogm',
  'qt',
  'vob',
  'evo',
  'mts',
  'mxf',
  'rm',
  'ogg',
]

function fileStream(path: string): ReadableStream {
  const ns = createReadStream(path)
  return Readable.toWeb(ns) as ReadableStream
}

function rangeStream(path: string, start: number, end: number): ReadableStream {
  const ns = createReadStream(path, { start, end })
  return Readable.toWeb(ns) as ReadableStream
}

function registerProtocol(): void {
  protocol.handle('anibox', (req) => {
    try {
      const url = new URL(req.url)
      const fp = url.searchParams.get('path') || ''
      if (isDev)
        console.log('[AniBox] Protocol request:', {
          url: req.url,
          method: req.method,
          path: fp,
          exists: fp ? existsSync(fp) : false,
          hasRange: req.headers.get('range') ? true : false,
        })
      if (!fp || !existsSync(fp)) {
        console.warn('[AniBox] Protocol 404:', fp)
        return new Response('Not Found', { status: 404 })
      }

      const st = statSync(fp)
      const mime =
        MIME['.' + (fp.split('.').pop()?.toLowerCase() || '')] || 'application/octet-stream'
      const isImage = mime.startsWith('image/')

      // 图片不需要 Range 请求，直接返回
      if (isImage) {
        if (isDev) console.log('[AniBox] Protocol serving image:', fp, st.size, 'bytes')
        return new Response(fileStream(fp), {
          status: 200,
          headers: {
            'Content-Length': String(st.size),
            'Content-Type': mime,
            'Cache-Control': 'max-age=86400',
          },
        })
      }

      const range = req.headers.get('range')

      if (range) {
        const [s, e] = range
          .replace(/bytes=/, '')
          .split('-')
          .map(Number)
        const end = e || st.size - 1
        if (isDev)
          console.log('[AniBox] Protocol range response:', fp, `bytes ${s}-${end}/${st.size}`)
        const body = rangeStream(fp, s, end)
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${s}-${end}/${st.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - s + 1),
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      if (isDev) console.log('[AniBox] Protocol full response:', fp, st.size, 'bytes, type:', mime)
      return new Response(fileStream(fp), {
        status: 200,
        headers: {
          'Content-Length': String(st.size),
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (err) {
      console.error('[AniBox] Protocol handler error:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  })
}

// === mpv 兜底播放 ===
// 方案 A：优先 libmpv 内嵌（单窗口，帧走 IPC → Canvas）；失败自动回退旧 mpv.exe 独立窗口
let libmpvBridge: LibmpvBridge | null = null
let libmpvFailed = false // 一次加载失败后不再尝试（防重复启动旧链路）

function libmpvQuit(): void {
  if (libmpvBridge) {
    console.log('[libmpv] libmpvQuit → destroy bridge')
    libmpvBridge.destroy()
    libmpvBridge = null
  } else {
    console.log('[libmpv] libmpvQuit: bridge 不存在（跳过）')
  }
  // 主 bridge 销毁时顺带销毁预览实例
  if (previewBridge) {
    previewBridge.destroy()
    previewBridge = null
    previewBridgeFile = ''
  }
}

// 悬浮预览：独立静音小尺寸 libmpv 实例，seek 取帧（不打断主播放）
let previewBridge: LibmpvBridge | null = null
let previewBridgeFile = ''
let previewBridgePromise: Promise<boolean> | null = null

/**
 * 确保预览实例已加载 filePath。返回 true 表示已就绪（可 seek 取帧）。
 * 预览实例：ao=null 静音、SW 渲染最大 480 宽（省 CPU）、无 timer（手动驱动）
 * 并发调用共享同一个加载 promise，避免快速 hover 时反复重建
 */
function ensurePreviewBridge(filePath: string): Promise<boolean> {
  if (
    previewBridge &&
    previewBridge.isActive &&
    previewBridgeFile === filePath &&
    previewBridge.isLoaded
  ) {
    return Promise.resolve(true)
  }
  if (previewBridgePromise) return previewBridgePromise
  previewBridgePromise = (async () => {
    const dll = findLibmpvDll()
    if (!dll) return false
    // 换文件或未加载：重建实例
    try {
      previewBridge?.destroy()
    } catch {
      /* ok */
    }
    previewBridge = null
    previewBridgeFile = filePath
    const bridge = new LibmpvBridge(
      {
        onFrame: (frame) => {
          mainWindow?.webContents.send('mpv:preview-frame', frame.buffer, frame.width, frame.height)
        },
        onLog: (level, text) => {
          if (level === 'error' || level === 'warn')
            console.log('[libmpv-preview]', level + ':', text)
        },
      },
      { renderMax: 480, noTimer: true, ao: 'null' },
    )
    if (!bridge.init(dll)) {
      bridge.destroy()
      previewBridge = null
      previewBridgeFile = ''
      return false
    }
    previewBridge = bridge
    bridge.loadFile(filePath)
    // 等待 FILE_LOADED（手动 drain 事件，最多 5s）
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      bridge.drainOnce()
      if (bridge.isLoaded) return true
      await new Promise((r) => setTimeout(r, 20))
    }
    console.warn('[libmpv-preview] 等待文件加载超时:', filePath)
    return false
  })().finally(() => {
    previewBridgePromise = null
  })
  return previewBridgePromise
}

/** 预览：seek 到 t 秒并渲染一帧回传渲染进程 */
async function libmpvPreviewAt(filePath: string, t: number): Promise<boolean> {
  if (!previewBridge || !previewBridge.isActive || previewBridgeFile !== filePath) {
    const ok = await ensurePreviewBridge(filePath)
    if (!ok) return false
  }
  const bridge = previewBridge!
  try {
    bridge.setProperty('pause', 'yes')
    bridge.seek(t)
    // 手动渲染直到取到帧（seek 后 mpv 需要解码若干帧才出画面）
    const deadline = Date.now() + 1500
    while (Date.now() < deadline) {
      bridge.drainOnce()
      if (bridge.renderManualOnce()) return true
      await new Promise((r) => setTimeout(r, 15))
    }
  } catch (err) {
    console.warn('[libmpv-preview] 取帧异常:', (err as Error).message)
  }
  return false
}

// libmpv 链路命令适配：
// - 'set_property' 是 mpv.exe JSON IPC 语法，libmpv 的 mpv_command 不认（返回 false），改用 setProperty API
// - 'cycle pause' 在 SW 渲染激活时调用会崩溃（实测 2026-08-12），改为显式设置（查当前状态取反）
function libmpvCommand(cmd: any[]): boolean {
  if (!libmpvBridge) return false
  const c0 = String(cmd[0] || '')
  if (c0 === 'set_property' && cmd.length >= 3) {
    return libmpvBridge.setProperty(String(cmd[1]), String(cmd[2]))
  }
  if (c0 === 'cycle' && String(cmd[1]) === 'pause') {
    const target = String(cmd[2] || '')
    if (target === 'yes' || target === 'no') return libmpvBridge.setProperty('pause', target)
    return libmpvBridge.setProperty('pause', libmpvBridge.isPaused() ? 'no' : 'yes')
  }
  return libmpvBridge.command(cmd as (string | number)[])
}

function libmpvPlay(fp: string): boolean {
  if (libmpvBridge && libmpvBridge.isActive) {
    libmpvBridge.loadFile(fp)
    return true
  }
  const dll = findLibmpvDll()
  if (!dll) {
    console.warn('[AniBox] libmpv-2.dll 未找到')
    return false
  }
  const bridge = new LibmpvBridge({
    onFrame: (frame) => {
      mainWindow?.webContents.send('mpv:frame', frame.buffer, frame.width, frame.height)
    },
    onFileLoaded: ({ width, height }) => {
      console.log('[libmpv] 文件加载完成:', width, 'x', height)
      mainWindow?.webContents.send('mpv:event', { event: 'file-loaded' })
    },
    onStartFile: () => {
      mainWindow?.webContents.send('mpv:event', { event: 'start-file' })
    },
    onEndFile: (reason) => {
      const reasonStr =
        reason === 0
          ? 'eof'
          : reason === 1
            ? 'stop'
            : reason === 2
              ? 'quit'
              : reason === 3
                ? 'error'
                : String(reason)
      mainWindow?.webContents.send('mpv:event', { event: 'end-file', reason: reasonStr })
    },
    onEofReached: (reached) => {
      // keep-open=yes 时播放完不发 END_FILE，靠 eof-reached 属性变化触发连播
      if (reached) {
        console.log('[libmpv] eof-reached → 触发连播')
        mainWindow?.webContents.send('mpv:event', { event: 'eof-reached' })
      }
    },
    onTracks: (tracks) => {
      mainWindow?.webContents.send('mpv:event', { event: 'tracks', data: tracks })
    },
    onLog: (level, text) => {
      console.log('[libmpv]', level + ':', text)
    },
  })
  try {
    if (!bridge.init(dll)) {
      bridge.destroy()
      return false
    }
  } catch (err) {
    console.warn('[AniBox] libmpv init 异常:', err)
    bridge.destroy()
    return false
  }
  libmpvBridge = bridge
  bridge.loadFile(fp)
  return true
}

let mpvProcess: ChildProcess | null = null
let mpvSock: Socket | null = null
let mpvBuf = ''
const PIPE = '\\\\.\\pipe\\anibox-mpv'

function mpvKill(): void {
  const proc = mpvProcess
  mpvProcess = null
  if (mpvSock) {
    try {
      mpvSock.write(JSON.stringify({ command: ['quit'] }) + '\n')
    } catch {
      /* ok */
    }
    try {
      mpvSock.destroy()
    } catch {
      /* ok */
    }
    mpvSock = null
  }
  mpvBuf = ''
  if (proc && !proc.killed) {
    try {
      proc.kill()
    } catch {
      /* ok */
    }
  }
}

function getMpvPath(): string {
  if (app.isPackaged) {
    // 标准布局：resources/mpv.exe（electron-builder extraResources from: mpv.exe, to: .）
    const standard = join(process.resourcesPath, 'mpv.exe')
    if (existsSync(standard)) return standard
    // 便携版布局：mpv.exe 在应用根目录（与 AniBox.exe 同级）
    const portable = join(dirname(process.resourcesPath), 'mpv.exe')
    if (existsSync(portable)) return portable
    // 兜底返回标准路径，让 spawn 报明确错误
    return standard
  }
  // 开发时在项目根目录
  return join(__dirname, '../../mpv.exe')
}

function mpvLaunch(fp: string): Promise<void> {
  mpvKill()
  return new Promise<void>((resolve, reject) => {
    const exe = getMpvPath()
    const proc = spawn(
      exe,
      [`--input-ipc-server=${PIPE}`, '--keep-open=yes', '--osc=yes', '--cursor-autohide=2000', fp],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    mpvProcess = proc

    proc.on('error', (err) => {
      mpvKill()
      reject(err)
    })

    proc.on('exit', () => {
      // 仅当退出的是当前最新 mpv 进程时才广播 end（主动 mpvKill 的退出不广播，
      // 否则连播切集时旧进程的 end 事件会误关新播放器）
      if (mpvProcess === proc) {
        mpvProcess = null
        mainWindow?.webContents.send('mpv:event', { event: 'end' })
        mainWindow?.focus()
      }
    })

    let tries = 0
    const tryConnect = () => {
      tries++
      const sock = createConnection(PIPE)

      sock.once('connect', () => {
        mpvSock = sock
        sock.on('data', (d: Buffer) => {
          mpvBuf += d.toString()
          const lines = mpvBuf.split('\n')
          mpvBuf = lines.pop() || ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const msg = JSON.parse(line)
              if (msg.event) {
                mainWindow?.webContents.send('mpv:event', msg)
                // 文件加载完成后查询字幕/音轨列表
                if (msg.event === 'file-loaded') {
                  sock.write(
                    JSON.stringify({ command: ['get_property', 'track-list'], request_id: 9999 }) +
                      '\n',
                  )
                }
              }
              // track-list 查询结果
              if (msg.request_id === 9999 && msg.data !== undefined) {
                const tracks = (msg.data || []) as any[]
                mainWindow?.webContents.send('mpv:event', {
                  event: 'tracks',
                  data: tracks.map((t: any) => ({
                    id: t.id,
                    type: t.type,
                    lang: t.lang || '',
                    title: t.title || '',
                    codec: t.codec || '',
                    selected: !!t.selected,
                  })),
                })
              }
            } catch {
              /* ignore malformed */
            }
          }
        })
        sock.on('close', () => {
          mpvSock = null
        })
        resolve()
      })

      sock.once('error', () => {
        sock.destroy()
        if (tries < 20) {
          setTimeout(tryConnect, 200)
        } else {
          reject(new Error('mpv IPC pipe timeout'))
        }
      })
    }

    setTimeout(tryConnect, 800)
  }).then(() => {
    mainWindow?.webContents.send('mpv:event', { event: 'ready' })
  })
}

// === 通过 mpv 检测内封字幕轨道（解决 Chromium 不暴露 ASS/SSA/PGS 字幕的问题）===
interface EmbeddedSubTrack {
  label: string
  language: string
  codec: string
  index: number
}

function detectSubtitlesViaMpv(filePath: string): Promise<EmbeddedSubTrack[]> {
  return new Promise((resolve) => {
    const exe = getMpvPath()
    console.log('[AniBox] detectSubtitlesViaMpv: exe path =', exe)
    if (!existsSync(exe)) {
      console.warn('[AniBox] mpv.exe not found at', exe, ', skip embedded subtitle detection')
      resolve([])
      return
    }

    const pipeName = `\\\\.\\pipe\\anibox-detect-${Date.now()}`
    let sock: Socket | null = null
    let buf = ''
    let trackList: any[] | null = null
    let resolved = false

    const cleanup = () => {
      clearTimeout(timeout)
      if (sock) {
        try {
          sock.destroy()
        } catch {
          /* ok */
        }
        sock = null
      }
      if (!proc.killed) {
        try {
          proc.kill()
        } catch {
          /* ok */
        }
      }
    }

    const finish = (result: EmbeddedSubTrack[]) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(result)
    }

    const proc = spawn(
      exe,
      [
        `--input-ipc-server=${pipeName}`,
        '--idle=yes',
        '--vo=null',
        '--ao=null',
        '--no-config',
        '--no-video',
      ],
      { stdio: 'ignore' },
    )

    proc.on('error', () => finish([]))

    // 给 mpv 启动和创建管道的时间
    setTimeout(() => {
      if (resolved) return
      sock = createConnection(pipeName)

      sock.once('connect', () => {
        // 加载文件，track-list 在文件加载后填充
        sock!.write(JSON.stringify({ command: ['loadfile', filePath, 'replace'] }) + '\n')
      })

      sock.on('data', (d: Buffer) => {
        if (resolved) return
        buf += d.toString()
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)

            if (msg.event === 'file-loaded' && trackList === null) {
              // 文件加载完毕，查询轨道列表
              sock!.write(
                JSON.stringify({
                  command: ['get_property', 'track-list'],
                  request_id: 1,
                }) + '\n',
              )
            } else if (msg.request_id === 1 && msg.data !== undefined) {
              // 收到轨道列表
              trackList = msg.data || []
              sock!.write(JSON.stringify({ command: ['quit'] }) + '\n')
            }
          } catch {
            /* ignore malformed JSON */
          }
        }
      })

      sock.on('error', () => finish([]))

      sock.on('close', () => {
        if (trackList) {
          const subs = trackList
            .filter((t: any) => t.type === 'sub')
            .map((t: any, i: number) => ({
              label: t.title || t.lang || `内封字幕 ${i + 1}`,
              language: t.lang || '',
              codec: t.codec || '',
              index: i,
            }))
          console.log(
            '[AniBox] detectSubtitlesViaMpv: found',
            subs.length,
            'embedded subtitle tracks',
          )
          finish(subs)
        } else {
          console.log(
            '[AniBox] detectSubtitlesViaMpv: no track-list received (timeout or mpv failed)',
          )
          finish([])
        }
      })
    }, 500)

    const timeout = setTimeout(() => finish([]), 10000)
  })
}

// === IPC Handlers ===

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openFile', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择视频',
      filters: [
        { name: '视频', extensions: ALL_VIDEO_EXTS },
        { name: '所有', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (r.canceled || !r.filePaths.length) return null
    const filePath = r.filePaths[0]
    const saved = store.loadProgress(filePath)
    return { filePath, savedPosition: saved?.position ?? 0 }
  })

  ipcMain.handle('progress:getRecent', () => {
    return store.getRecentProgress(10)
  })

  ipcMain.handle('video:load', (_e, p: string) => {
    const saved = store.loadProgress(p)
    return { filePath: p, savedPosition: saved?.position ?? 0 }
  })

  ipcMain.handle('video:getInfo', (_e, p: string) => {
    try {
      const st = statSync(p)
      // 尝试容器解析拿精确视频码率
      let videoMeta: { width: number; height: number; codec: string; exactBitrate: number } | null =
        null
      if (p.toLowerCase().endsWith('.mp4')) {
        videoMeta = parseMP4Meta(p)
      }
      return {
        size: st.size,
        mtime: st.mtimeMs,
        ctime: st.ctimeMs,
        videoMeta,
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('video:checkAudio', (_e, p: string) => {
    try {
      if (!p.toLowerCase().endsWith('.mp4')) return { codec: 'unknown', supported: true }
      const info = detectAudioCodec(p)
      return info || { codec: 'unknown', supported: true }
    } catch {
      return { codec: 'unknown', supported: true }
    }
  })

  // 批量检测音频编码（连播时一次性检测整部番，避免逐集重复检测导致的「跳一下」）
  ipcMain.handle('video:checkAudioBatch', (_e, paths: string[]) => {
    const result: Record<string, { codec: string; supported: boolean }> = {}
    for (const p of paths) {
      try {
        if (!p.toLowerCase().endsWith('.mp4')) {
          result[p] = { codec: 'unknown', supported: true }
          continue
        }
        const info = detectAudioCodec(p)
        result[p] = info || { codec: 'unknown', supported: true }
      } catch {
        result[p] = { codec: 'unknown', supported: true }
      }
    }
    return result
  })

  // 通过 mpv 检测内封字幕（解决 Chromium 不暴露 ASS/SSA/PGS 字幕轨道的问题）
  ipcMain.handle('video:detectEmbeddedSubtitles', (_e, p: string) => {
    return detectSubtitlesViaMpv(p)
  })

  ipcMain.handle('playback:savePosition', (_e, filePath: string, position: number) => {
    store.saveProgress(filePath, position)
  })

  ipcMain.handle('playback:getPosition', (_e, filePath: string) => {
    const saved = store.loadProgress(filePath)
    return saved?.position ?? 0
  })

  ipcMain.handle('dialog:openFolder', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '选择番剧目录',
      properties: ['openDirectory'],
    })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })

  ipcMain.handle('scanner:scan', (_e, root: string) => {
    try {
      store.clearAllSeriesAndEpisodes()
      const result = scanSeries(root)
      for (const s of result) {
        const seriesId = hashPath(s.folderPath)
        store.upsertSeries(seriesId, s.title, s.folderPath, s.season, s.seriesType, s.coverPath)
        store.clearEpisodesForSeries(seriesId)
        for (const ep of s.episodes) {
          const episodeId = hashPath(ep.filePath)
          store.upsertEpisode(episodeId, seriesId, ep.epNumber, ep.filePath, ep.fileName)
        }
        store.updateSeriesTotalEps(seriesId, s.episodes.length)
      }
      return result
    } catch (err) {
      console.error('[AniBox] Scanner error:', err)
      return []
    }
  })

  // === 多根扫描 ===
  ipcMain.handle('scanRoots:get', () => store.getScanRoots())

  ipcMain.handle('scanRoots:add', (_e, root: string) => {
    store.addScanRoot(root)
    return store.getScanRoots()
  })

  ipcMain.handle('scanRoots:remove', (_e, root: string) => {
    store.removeScanRoot(root)
    return store.getScanRoots()
  })

  ipcMain.handle('scanRoots:setAll', (_e, roots: string[]) => {
    store.setScanRoots(roots)
    return roots
  })

  // 扫描所有根目录，合并结果（先全部扫描完成，再统一替换旧数据）
  ipcMain.handle('scanRoots:scanAll', async () => {
    const roots = store.getScanRoots()
    const allResults: any[] = []
    const seenFolderPaths = new Set<string>()

    // 第一阶段：扫描所有根目录，收集结果（不触碰旧数据）
    for (const root of roots) {
      try {
        const result = scanSeries(root)
        for (const s of result) {
          if (seenFolderPaths.has(s.folderPath)) continue
          seenFolderPaths.add(s.folderPath)
          allResults.push(s)
        }
      } catch (err) {
        console.error(
          '[AniBox] Scan root error:',
          root,
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    // 第二阶段：确认收集完毕后再清除旧数据并写入新数据
    store.clearAllSeriesAndEpisodes()
    for (const s of allResults) {
      const seriesId = hashPath(s.folderPath)
      store.upsertSeries(seriesId, s.title, s.folderPath, s.season, s.seriesType, s.coverPath)
      store.clearEpisodesForSeries(seriesId)
      for (const ep of s.episodes) {
        const episodeId = hashPath(ep.filePath)
        store.upsertEpisode(episodeId, seriesId, ep.epNumber, ep.filePath, ep.fileName)
      }
      store.updateSeriesTotalEps(seriesId, s.episodes.length)
    }

    return allResults
  })

  // 智能发现番剧目录
  ipcMain.handle('discover:scan', (_e, basePath: string) => {
    try {
      return discoverAnimeRoots(basePath)
    } catch (err) {
      console.error('[AniBox] Discover error:', err)
      return []
    }
  })

  // 手动修正番剧标题
  ipcMain.handle('series:updateTitle', (_e, folderPath: string, newTitle: string) => {
    const seriesId = hashPath(folderPath)
    const s = store.getSeriesById(seriesId)
    if (s) {
      store.upsertSeries(
        seriesId,
        newTitle,
        folderPath,
        s.season,
        s.seriesType || 'tv',
        s.coverPath,
      )
    }
  })

  ipcMain.handle('series:getProgress', (_e, folderPath: string) => {
    return store.getSeriesProgress(hashPath(folderPath))
  })

  ipcMain.handle('series:setStatus', (_e, folderPath: string, status: string) => {
    store.updateSeriesStatus(hashPath(folderPath), status)
  })

  // 封面爬取
  ipcMain.handle(
    'cover:fetchBatch',
    async (_e, series: Array<{ title: string; folderPath: string }>) => {
      const result = await fetchCoversBatch(series, (cur, total, title, ok, status) => {
        mainWindow?.webContents.send('cover:progress', { current: cur, total, title, ok, status })
      })
      return result
    },
  )

  // 手动搜索封面
  ipcMain.handle('cover:fetchManual', async (_e, folderPath: string, searchQuery: string) => {
    const result = await fetchCoverManual(folderPath, searchQuery)
    return result ? true : false
  })

  // 方案 A：优先 libmpv 内嵌（单窗口）；失败自动回退 mpv.exe 独立窗口
  ipcMain.handle('mpv:play', (_e, p: string) => {
    if (!libmpvFailed && findLibmpvDll()) {
      try {
        if (libmpvPlay(p)) {
          console.log('[AniBox] libmpv 内嵌播放:', p)
          return
        }
      } catch (err) {
        console.warn('[AniBox] libmpv 播放失败:', err)
      }
      libmpvFailed = true
      libmpvQuit()
      mainWindow?.webContents.send('mpv:event', { event: 'libmpv-fallback' })
    }
    console.log('[AniBox] 回退 mpv.exe 独立窗口播放:', p)
    return mpvLaunch(p)
  })

  ipcMain.handle('mpv:quit', () => {
    console.log('[AniBox] mpv:quit 收到')
    libmpvQuit()
    mpvKill()
    mainWindow?.focus()
  })

  // 向运行中的 mpv 发送命令（libmpv 或 mpv.exe JSON IPC；字幕/音轨切换、seek 等）
  ipcMain.handle('mpv:command', (_e, cmd: any[]) => {
    if (libmpvBridge && libmpvBridge.isActive) {
      return libmpvCommand(cmd)
    }
    if (!mpvSock) return false
    try {
      mpvSock.write(JSON.stringify({ command: cmd }) + '\n')
      return true
    } catch {
      return false
    }
  })

  // 播放状态轮询（渲染进程进度条用）
  ipcMain.handle('mpv:getState', () => {
    const b = libmpvBridge
    if (!b || !b.isActive) return null
    return {
      timePos: b.getTimePos(),
      duration: b.getDuration(),
      paused: b.isPaused(),
      loaded: b.isLoaded,
      width: b.size.width,
      height: b.size.height,
      volume: b.getVolume(),
      muted: b.isMuted(),
    }
  })

  // 悬浮预览：seek 指定位置取一帧（独立静音实例，不打断播放）
  ipcMain.handle('mpv:preview', (_e, filePath: string, t: number) => {
    return libmpvPreviewAt(filePath, t)
  })

  ipcMain.handle('window:toggleFullscreen', () => {
    mainWindow?.setFullScreen(!mainWindow?.isFullScreen())
  })

  ipcMain.handle('window:exitFullscreen', () => {
    if (mainWindow?.isFullScreen()) mainWindow?.setFullScreen(false)
  })

  ipcMain.handle('window:isFullscreen', () => mainWindow?.isFullScreen() ?? false)

  // 字幕：读取并转换为 VTT
  ipcMain.handle('subtitle:readVtt', (_e, filePath: string) => {
    try {
      return readSubtitleAsVtt(filePath)
    } catch (err) {
      console.error('[AniBox] subtitle read error:', err)
      return ''
    }
  })

  // 字幕：重新扫描当前视频的字幕
  ipcMain.handle('subtitle:rescan', (_e, videoPath: string) => {
    try {
      return findSubtitles(videoPath)
    } catch (err) {
      console.error('[AniBox] subtitle rescan error:', err)
      return []
    }
  })

  // 在线字幕搜索
  ipcMain.handle(
    'subtitle:searchOnline',
    async (
      _e,
      query: {
        title: string
        episode?: number
        videoPath?: string
        preferredLanguages?: string[]
      },
    ) => {
      try {
        return await searchOnlineSubtitles(query)
      } catch (err) {
        console.error('[AniBox] online subtitle search error:', err)
        return []
      }
    },
  )

  // 在线字幕下载
  ipcMain.handle('subtitle:download', async (_e, result: any, videoPath: string) => {
    try {
      return await downloadSubtitle(result, videoPath)
    } catch (err) {
      console.error('[AniBox] subtitle download error:', err)
      return null
    }
  })

  // OpenSubtitles 配置
  ipcMain.handle('subtitle:getOSStatus', () => {
    return getOpenSubtitlesStatus()
  })

  ipcMain.handle('subtitle:setOSConfig', (_e, apiKey: string, userAgent?: string) => {
    setOpenSubtitlesConfig(apiKey, userAgent)
  })

  // 音轨偏好
  ipcMain.handle('audio:getPrefs', (_e, seriesId: string) => {
    return store.getAudioPrefs(seriesId)
  })

  ipcMain.handle(
    'audio:setPrefs',
    (
      _e,
      seriesId: string,
      prefs: {
        audioIndex: number
        audioDelay: number
        language?: string
      },
    ) => {
      store.setAudioPrefs(seriesId, prefs)
    },
  )

  ipcMain.handle('audio:getGlobalPrefs', () => {
    return store.getGlobalAudioPrefs()
  })

  // 字幕样式
  ipcMain.handle('subtitle:getStyle', () => {
    return store.getSubtitleStyle()
  })

  ipcMain.handle('subtitle:setStyle', (_e, style: any) => {
    store.setSubtitleStyle(style)
  })

  // 全局播放偏好（设置页「播放」tab）
  ipcMain.handle('settings:getPlayback', () => {
    return store.getPlaybackSettings()
  })

  ipcMain.handle('settings:setPlayback', (_e, settings: any) => {
    store.setPlaybackSettings(settings)
  })

  // ===== 局域网串流 =====
  ipcMain.handle('stream:getSettings', () => {
    const s = store.getStreamSettings()
    return { ...s, state: getStreamServerState() }
  })

  ipcMain.handle('stream:setSettings', (_e, patch: any) => {
    const prev = store.getStreamSettings()
    store.setStreamSettings(patch)
    const cur = store.getStreamSettings()
    // 端口/开关变化时重启服务器（token 变化无需重启，校验实时读 store）
    const restartNeeded = patch.port !== undefined || patch.enabled !== undefined
    if (restartNeeded) {
      stopStreamServer()
      if (cur.enabled) startStreamServer({ port: cur.port })
    }
    return { ...cur, state: getStreamServerState(), changed: prev.port !== cur.port || prev.enabled !== cur.enabled }
  })

  ipcMain.handle('stream:getState', () => getStreamServerState())

  ipcMain.handle('stream:cacheInfo', () => {
    return { cacheMB: getStreamCacheSizeMB() }
  })

  ipcMain.handle('stream:cacheClean', (_e, maxMB: number) => {
    return cleanStreamCache(maxMB || 2048)
  })

  ipcMain.handle('stream:engineInfo', () => {
    return getEngineInfo()
  })

  ipcMain.handle('stream:ffmpegRetry', () => {
    resetFfmpegDownload()
    return getEngineInfo()
  })

  // 应用版本信息（关于页显示；与 package.json version 同步）
  ipcMain.handle('app:getVersion', () => {
    return { version: app.getVersion(), electron: process.versions.electron }
  })

  // ===== Whisper 语音识别 =====
  ipcMain.handle('whisper:status', () => {
    return { ...getWhisperStatus(), defaultPaths: getDefaultWhisperPaths() }
  })

  ipcMain.handle('whisper:configure', (_e, config: { binaryPath: string; modelPath: string }) => {
    setWhisperConfig({
      binaryPath: config.binaryPath,
      modelPath: config.modelPath,
      modelSize: 'small',
    })
  })

  ipcMain.handle('whisper:transcribe', async (_e, videoPath: string) => {
    try {
      const result = await transcribeWithWhisper(videoPath, (msg) => {
        mainWindow?.webContents.send('whisper:progress', { message: msg })
      })
      if (result) {
        mainWindow?.webContents.send('whisper:progress', { message: '完成', result })
      }
      return result
    } catch (err: any) {
      mainWindow?.webContents.send('whisper:progress', { message: '失败', error: err.message })
      throw err
    }
  })

  // ===== AI 翻译 =====
  ipcMain.handle('translate:status', () => getTranslationStatus())

  ipcMain.handle(
    'translate:configure',
    (_e, config: { engine?: string; apiKey?: string; apiUrl?: string }) => {
      setTranslationConfig(config as Parameters<typeof setTranslationConfig>[0])
    },
  )

  ipcMain.handle('translate:text', async (_e, text: string, fromLang?: string, toLang?: string) => {
    return await translateText(text, fromLang || 'ja', toLang || 'zh-CN')
  })

  ipcMain.handle(
    'translate:segments',
    async (_e, segments: any[], fromLang?: string, toLang?: string) => {
      return await translateSubtitleSegments(
        segments,
        fromLang || 'ja',
        toLang || 'zh-CN',
        (cur, total) => {
          mainWindow?.webContents.send('translate:progress', { current: cur, total })
        },
      )
    },
  )

  // ===== 日语词典 =====
  ipcMain.handle('dict:lookup', (_e, word: string) => {
    return lookupWord(word)
  })

  ipcMain.handle('dict:analyze', (_e, text: string) => {
    return analyzeJapaneseText(text)
  })

  // ===== 弹幕 =====
  ipcMain.handle('danmaku:fetch', async (_e, animeTitle: string, episodeNumber: number) => {
    try {
      const items = await fetchDanmakuForEpisode(animeTitle, episodeNumber, (msg) => {
        mainWindow?.webContents.send('danmaku:progress', { message: msg })
      })
      mainWindow?.webContents.send('danmaku:progress', { message: '完成', count: items.length })
      return items
    } catch (err: any) {
      mainWindow?.webContents.send('danmaku:progress', { message: '失败', error: err.message })
      return []
    }
  })

  ipcMain.handle('danmaku:cleanTitle', (_e, title: string) => {
    return cleanTitleForSearch(title)
  })

  ipcMain.handle('danmaku:import', (_e, filePath: string) => {
    return parseDanmakuFromFile(filePath)
  })

  ipcMain.handle('danmaku:export', async (_e, items: any[]) => {
    if (!mainWindow) return false
    const now = new Date()
    const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`
    const r = await dialog.showSaveDialog(mainWindow, {
      title: '导出弹幕',
      defaultPath: `danmaku_${ts}.xml`,
      filters: [{ name: '弹幕XML', extensions: ['xml'] }],
    })
    if (r.canceled || !r.filePath) return false
    try {
      const xml = exportDanmakuToXML(items)
      writeFileSync(r.filePath, xml, 'utf-8')
      return true
    } catch {
      return false
    }
  })

  // ===== 文件监控 =====
  ipcMain.handle('watcher:start', (_e, rootPath: string) => {
    startWatching(rootPath, (event, payload) => {
      mainWindow?.webContents.send('watcher:event', { event, ...payload })
    })
  })

  ipcMain.handle('watcher:stop', () => {
    stopWatching()
  })

  ipcMain.handle('watcher:status', () => {
    return getWatcherStatus()
  })

  // ===== 收藏 =====
  ipcMain.handle('favorites:getAll', () => store.getFavorites())
  ipcMain.handle('favorites:toggle', (_e, seriesId: string) => store.toggleFavorite(seriesId))
  ipcMain.handle('favorites:isFavorited', (_e, seriesId: string) => store.isFavorited(seriesId))

  // ===== 播放列表 =====
  ipcMain.handle('playlists:getAll', () => store.getPlaylists())
  ipcMain.handle('playlists:create', (_e, name: string) => store.createPlaylist(name))
  ipcMain.handle('playlists:delete', (_e, id: string) => store.deletePlaylist(id))
  ipcMain.handle('playlists:addSeries', (_e, listId: string, seriesId: string) => {
    store.addToPlaylist(listId, seriesId)
  })
  ipcMain.handle('playlists:removeSeries', (_e, listId: string, seriesId: string) => {
    store.removeFromPlaylist(listId, seriesId)
  })

  // ===== 追番同步 =====
  ipcMain.handle(
    'tracking:sync',
    async (_e, anilistId: number, bangumiId: number, status: string, watchedEpisodes: number) => {
      try {
        // 同步到 AniList（需要 OAuth token，此处为框架）
        if (anilistId > 0) {
          // TODO: 实现 AniList OAuth 流程
          console.log('[AniBox] Would sync to AniList:', anilistId, status, watchedEpisodes)
        }
        // 同步到 Bangumi
        if (bangumiId > 0) {
          // TODO: 实现 Bangumi OAuth 流程
          console.log('[AniBox] Would sync to Bangumi:', bangumiId, status, watchedEpisodes)
        }
        return true
      } catch {
        return false
      }
    },
  )

  // 截图保存
  ipcMain.handle('screenshot:save', async (_e, dataUrl: string) => {
    if (!mainWindow) return false
    const now = new Date()
    const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
    const r = await dialog.showSaveDialog(mainWindow, {
      title: '保存截图',
      defaultPath: `AniBox_${ts}.png`,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })
    if (r.canceled || !r.filePath) return false
    try {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      writeFileSync(r.filePath, Buffer.from(base64, 'base64'))
      return true
    } catch (err) {
      console.error('[AniBox] screenshot save error:', err)
      return false
    }
  })

  // OP/ED 跳过时间（双点区间）
  ipcMain.handle('series:getSkipTimes', (_e, folderPath: string) => {
    return store.getSkipTimes(hashPath(folderPath))
  })

  ipcMain.handle(
    'series:setSkipTimes',
    (
      _e,
      folderPath: string,
      times: { opStart: number; opEnd: number; edStart: number; edEnd: number },
    ) => {
      store.setSkipTimes(hashPath(folderPath), times)
    },
  )

  // 元数据
  ipcMain.handle('metadata:fetch', async (_e, title: string, folderPath: string) => {
    try {
      const result = await fetchMetadataForSeries(title, folderPath)
      if (result?.metadata) {
        store.setSeriesMetadata(hashPath(folderPath), result.metadata)
      }
      return result
    } catch (err) {
      console.error('[AniBox] metadata fetch error:', err)
      return null
    }
  })

  ipcMain.handle(
    'metadata:fetchBatch',
    async (_e, series: Array<{ title: string; folderPath: string; season?: number }>) => {
      try {
        const result = await fetchMetadataBatch(series, (cur, total, title, ok, status) => {
          mainWindow?.webContents.send('metadata:progress', {
            current: cur,
            total,
            title,
            ok,
            status,
          })
        })
        for (const r of result.results) {
          if (r.metadata) store.setSeriesMetadata(hashPath(r.folderPath), r.metadata)
        }
        return result
      } catch (err) {
        console.error('[AniBox] metadata batch error:', err)
        return []
      }
    },
  )

  ipcMain.handle('metadata:get', (_e, folderPath: string) => {
    const stored = store.getSeriesMetadata(hashPath(folderPath))
    if (stored) return stored
    // 回退到磁盘文件
    return store.loadDiskMetadata(folderPath)
  })

  ipcMain.handle('metadata:getAll', () => {
    return store.getAllMetadata()
  })

  // 本地翻译模型 (opus-mt-en-zh)
  ipcMain.handle('translate:localLoadModel', async () => {
    try {
      return await loadModel((msg) => {
        mainWindow?.webContents.send('translate:localProgress', msg)
      })
    } catch {
      return false
    }
  })

  ipcMain.handle('translate:localStatus', () => {
    return getTranslateStatus()
  })

  ipcMain.handle('translate:jaModelLoad', async () => {
    const onProgress = (msg: string) => {
      mainWindow?.webContents.send('translate:localProgress', msg)
    }
    return await loadJaModel(onProgress)
  })

  ipcMain.handle('translate:jaToZh', async (_e, text: string) => {
    return await translateJaToZh(text)
  })

  ipcMain.handle('translate:enToZh', async (_e, text: string) => {
    return await translateEnToZh(text)
  })

  // AI 翻译
  ipcMain.handle('ai:configure', (_e, key: string) => {
    configureAI(key)
    return true
  })
  ipcMain.handle('ai:getKey', () => getAIKey())

  // AnimeGarden 资源搜索
  ipcMain.handle('animegarden:search', (_e, params: any) => searchAnimeGarden(params || {}))

  // 字幕组列表（GET /teams，1h 缓存）
  ipcMain.handle('animegarden:teams', () => listTeams())

  // 本地 RSS 订阅代理
  ipcMain.handle('animegarden:createFeed', (_e, cfg: any) => createRssFeed(cfg || {}))
  ipcMain.handle('animegarden:listFeeds', () => listRssFeeds())
  ipcMain.handle('animegarden:deleteFeed', (_e, id: string) => {
    deleteRssFeed(id)
    return true
  })

  // qBittorrent 联动
  ipcMain.handle('qb:getConfig', () => getQbConfig())
  ipcMain.handle('qb:setConfig', (_e, cfg: any) => {
    setQbConfig(cfg)
    return true
  })
  ipcMain.handle('qb:test', (_e, cfg?: any) => qbTestConnection(cfg || {}))
  ipcMain.handle('qb:addTorrent', (_e, magnet: string, savepath?: string) =>
    qbAddTorrent(magnet, savepath),
  )
  ipcMain.handle('qb:addRss', (_e, feedUrl: string, path?: string) => qbAddRssFeed(feedUrl, path))
  ipcMain.handle('qb:addRule', (_e, ruleName: string, opts: any) =>
    qbAddRssRule(ruleName, opts || {}),
  )
  ipcMain.handle('qb:removeRule', (_e, ruleName: string) => qbRemoveRssRule(ruleName))
  ipcMain.handle('ai:translate', async (_e, text: string, from: string, to: string) => {
    try {
      return await translateWithAI(text, from, to)
    } catch {
      return text
    }
  })

  // AniList 番剧详情
  ipcMain.handle('season:fetchDetail', async (_e, anilistId: number) => {
    try {
      const query = `
        query ($id: Int!) {
          Media(id: $id) {
            id
            title { native romaji english }
            coverImage { large extraLarge }
            bannerImage
            description
            episodes duration averageScore popularity
            genres
            studios { nodes { name } }
            startDate { year month day }
            endDate { year month day }
            season seasonYear format status
            nextAiringEpisode { airingAt episode timeUntilAiring }
          }
        }`
      const resp = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { id: anilistId } }),
      })
      const data = await resp.json()
      return { ok: true, detail: data?.data?.Media || null }
    } catch (err: any) {
      return { ok: false, error: err.message, detail: null }
    }
  })

  // AniList 番剧搜索（搜索番剧功能：搜番 → 详情 → 获取资源下载）
  ipcMain.handle('anime:search', async (_e, query: string, pageSize?: number) => {
    const q = (query || '').trim()
    if (!q) return { ok: false, error: '请输入搜索关键词', anime: [] }
    try {
      const searchQuery = `
        query ($search: String, $page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(search: $search, type: ANIME, format_not: MUSIC, sort: SEARCH_MATCH) {
              id
              title { native romaji english }
              coverImage { large extraLarge }
              bannerImage
              description
              episodes duration averageScore popularity
              genres
              studios { nodes { name } }
              startDate { year month day }
              endDate { year month day }
              season seasonYear format status
            }
          }
        }`
      const searchAniList = async (kw: string) => {
        const resp = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            variables: { search: kw, page: 1, perPage: pageSize || 24 },
          }),
        })
        const data = await resp.json()
        return data?.data?.Page?.media || []
      }

      let media = await searchAniList(q)

      // 中文关键词兜底：AniList 对中文支持差，经 Bangumi 查到日文原名再搜
      if (!media.length) {
        try {
          const bg = await searchBangumiMeta(q)
          const jpName = bg?.[0]?.name
          if (jpName && jpName !== q) {
            console.log(`[AniBox] AniList 中文搜索为空，经 Bangumi 转原名 "${jpName}" 重试`)
            media = await searchAniList(jpName)
          }
        } catch {
          /* Bangumi 兜底失败则保持空结果 */
        }
      }
      if (!media.length) return { ok: true, anime: [] }

      const anime = media.map((m: any) => ({
        id: m.id,
        title: m.title?.native || m.title?.romaji || '',
        titleRomaji: m.title?.romaji || '',
        titleEnglish: m.title?.english || '',
        titleZh: '',
        cover: m.coverImage?.large || '',
        coverExtra: m.coverImage?.extraLarge || '',
        bannerImage: m.bannerImage || '',
        description: (m.description || '').replace(/<[^>]+>/g, '').substring(0, 1000),
        descriptionZh: '',
        episodes: m.episodes ?? null,
        duration: m.duration ?? null,
        score: m.averageScore ?? null,
        popularity: m.popularity ?? null,
        genres: (m.genres || []).map((g: string) => translateLocal(g) || g),
        studios: (m.studios?.nodes || []).map((s: any) => s.name),
        startDate: m.startDate || null,
        endDate: m.endDate || null,
        season: m.season || '',
        seasonYear: m.seasonYear || 0,
        format: m.format,
        status: m.status,
        nextAiring: null,
      }))

      // AI 标题翻译（有 Key 时并发批量，让中文用户一眼认出番名）
      if (getAIKey()) {
        console.log('[AniBox] Starting AI title translation for search results:', anime.length)
        const BATCH = 8
        await Promise.all(
          Array.from({ length: Math.ceil(anime.length / BATCH) }, (_, i) =>
            Promise.all(
              anime.slice(i * BATCH, (i + 1) * BATCH).map(async (a: any) => {
                try {
                  const zh = await translateWithAI(a.title, 'ja', 'zh')
                  if (zh && zh !== a.title) a.titleZh = zh
                } catch {
                  a.titleZh = a.titleRomaji || a.titleEnglish || a.title
                }
              }),
            ),
          ),
        )
        console.log('[AniBox] AI title translation done')
      }

      return { ok: true, anime }
    } catch (err: any) {
      console.error('[AniBox] anime:search error:', err)
      return { ok: false, error: err.message || '搜索失败', anime: [] }
    }
  })

  // AniList 新番时间表
  // 策略：有缓存且缓存季度 = 当前季度 → 直接复用；换季或强制刷新 → 重新抓取翻译
  ipcMain.handle('season:fetchTimeline', async (_e, forceRefresh?: boolean) => {
    const cachePath = join(app.getPath('userData'), 'season-cache.json')
    const now = new Date()
    const m = now.getMonth() + 1
    let se = 'WINTER'
    if (m >= 4 && m <= 6) se = 'SPRING'
    else if (m >= 7 && m <= 9) se = 'SUMMER'
    else if (m >= 10 && m <= 12) se = 'FALL'
    const currentSeason = `${se} ${now.getFullYear()}`

    if (!forceRefresh) {
      try {
        const cacheRaw = readFileSync(cachePath, 'utf-8')
        const cache = JSON.parse(cacheRaw)
        if (cache.data?.season && cache.data?.anime?.length) {
          if (cache.data.season === currentSeason) {
            console.log('[AniBox] 缓存命中，季度匹配，直接复用')
            return { ok: true, fromCache: true, season: cache.data.season, anime: cache.data.anime }
          }
          console.log(
            `[AniBox] 缓存季度(${cache.data.season})与当前(${currentSeason})不匹配，重新抓取`,
          )
        }
      } catch (e: any) {
        console.log('[AniBox] 缓存读取失败:', e.message)
      }
    }

    try {
      const query = `
        query ($season: MediaSeason!, $year: Int!) {
          Page(page: 1, perPage: 70) {
            media(season: $season, seasonYear: $year, type: ANIME, format: TV, sort: POPULARITY_DESC) {
              id
              title { native romaji english }
              coverImage { large extraLarge }
              bannerImage
              description
              episodes duration averageScore popularity
              genres
              studios { nodes { name } }
              startDate { year month day }
              endDate { year month day }
              season seasonYear format status
              nextAiringEpisode { airingAt episode timeUntilAiring }
            }
          }
        }`
      const variables = { season: se, year: now.getFullYear() }
      const resp = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      })
      const data = await resp.json()
      if (!data?.data?.Page?.media) {
        return { ok: false, error: 'API 返回异常', anime: [] }
      }
      const anime = data.data.Page.media.map((m: any) => ({
        id: m.id,
        title: m.title?.native || m.title?.romaji || '',
        titleRomaji: m.title?.romaji || '',
        titleEnglish: m.title?.english || '',
        titleZh: '',
        cover: m.coverImage?.large || '',
        coverExtra: m.coverImage?.extraLarge || '',
        bannerImage: m.bannerImage || '',
        description: (m.description || '').replace(/<[^>]+>/g, '').substring(0, 1000),
        descriptionZh: '',
        episodes: m.episodes ?? null,
        duration: m.duration ?? null,
        score: m.averageScore ?? null,
        popularity: m.popularity ?? null,
        genres: (m.genres || []).map((g: string) => translateLocal(g) || g),
        studios: (m.studios?.nodes || []).map((s: any) => s.name),
        startDate: m.startDate || null,
        endDate: m.endDate || null,
        season: m.season || '',
        seasonYear: m.seasonYear || 0,
        format: m.format,
        status: m.status,
        nextAiring: m.nextAiringEpisode
          ? {
              episode: m.nextAiringEpisode.episode,
              airingAt: m.nextAiringEpisode.airingAt,
              timeUntilAiring: m.nextAiringEpisode.timeUntilAiring,
            }
          : null,
      }))

      // AI 标题翻译（并发批量，有 Key 时用 DeepSeek）
      if (getAIKey()) {
        console.log('[AniBox] Starting AI title translation for', anime.length, 'titles')
        const BATCH = 10 // 并发数
        let done = 0
        for (let i = 0; i < anime.length; i += BATCH) {
          const batch = anime.slice(i, i + BATCH)
          await Promise.all(
            batch.map(async (a: any) => {
              try {
                const zh = await translateWithAI(a.title, 'ja', 'zh')
                if (zh && zh !== a.title) {
                  a.titleZh = zh
                }
              } catch {
                a.titleZh = a.titleRomaji || a.titleEnglish || a.title
              }
            }),
          )
          done += batch.length
          console.log(`[AniBox] AI translate progress: ${done}/${anime.length}`)
        }
        console.log('[AniBox] AI title translation done')

        // AI 简介翻译
        const withDesc = anime.filter((a: any) => a.description && a.description.length > 10)
        if (withDesc.length > 0) {
          console.log('[AniBox] Starting AI description translation for', withDesc.length, 'anime')
          let descDone = 0
          for (let i = 0; i < withDesc.length; i += BATCH) {
            const batch = withDesc.slice(i, i + BATCH)
            await Promise.all(
              batch.map(async (a: any) => {
                try {
                  const zh = await translateWithAI(a.description, 'auto', 'zh')
                  if (zh && zh !== a.description) {
                    a.descriptionZh = zh
                  }
                } catch {
                  a.descriptionZh = a.description
                }
              }),
            )
            descDone += batch.length
            console.log(`[AniBox] AI desc translate progress: ${descDone}/${withDesc.length}`)
          }
          console.log('[AniBox] AI description translation done')
        }
      }

      const payload = { season: currentSeason, anime }
      try {
        writeFileSync(
          cachePath,
          JSON.stringify({ timestamp: Date.now(), data: payload }, null, 2),
          'utf-8',
        )
      } catch {
        /* ok */
      }
      return { ok: true, fromCache: false, ...payload }
    } catch (err: any) {
      console.error('[AniBox] season:fetchTimeline error:', err)
      try {
        const fb = JSON.parse(
          readFileSync(join(app.getPath('userData'), 'season-cache.json'), 'utf-8'),
        )
        return { ok: true, fromCache: true, stale: true, ...fb.data }
      } catch {
        /* ok */
      }
      return { ok: false, error: err.message || '网络请求失败', anime: [] }
    }
  })

  // AniList 标题校验
  ipcMain.handle(
    'metadata:validateTitles',
    async (_e, series: Array<{ folderPath: string; title: string }>) => {
      try {
        return await validateBatchTitles(series)
      } catch (err) {
        console.error('[AniBox] Title validation error:', err)
        return []
      }
    },
  )

  // 系列列表（含 metadata）
  ipcMain.handle('series:getAll', () => {
    const series = store.getAllSeries()
    const metadata = store.getAllMetadata()
    return series.map((s) => ({
      ...s,
      metadata: metadata[s.id] || null,
    }))
  })
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

  registerProtocol()
  registerIpcHandlers()
  startRssServer()
  // 局域网串流：设置页开启过则随应用自启
  if (store.getStreamSettings().enabled) {
    startStreamServer({ port: store.getStreamSettings().port })
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
