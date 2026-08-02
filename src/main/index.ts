// 修复 Electron-in-Electron 嵌套问题：WorkBuddy/VSCode 终端继承 ELECTRON_RUN_AS_NODE=1
// 导致 require('electron') 返回 exe 路径而非 API 模块
delete process.env.ELECTRON_RUN_AS_NODE
delete (process.env as any).ELECTRON_RUN_AS_NODE

import { app, BrowserWindow, protocol, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { createReadStream, statSync, existsSync, writeFileSync } from 'fs'
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
import { fetchMetadataForSeries, fetchMetadataBatch, validateBatchTitles } from './metadata-fetcher'
import { loadModel, getTranslateStatus, loadJaModel, translateJaToZh, translateEnToZh } from './local-translate'
import {
  setWhisperConfig,
  isWhisperAvailable,
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
  // 打包后 mpv.exe 在 extraResources 中，通过 process.resourcesPath 访问
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mpv.exe')
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
      if (mpvProcess === proc) mpvProcess = null
      mainWindow?.webContents.send('mpv:event', { event: 'end' })
      mainWindow?.focus()
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
              if (msg.event) mainWindow?.webContents.send('mpv:event', msg)
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

  ipcMain.handle('mpv:play', (_e, p: string) => mpvLaunch(p))
  ipcMain.handle('mpv:quit', () => {
    mpvKill()
    mainWindow?.focus()
  })

  ipcMain.handle('window:toggleFullscreen', () => {
    mainWindow?.setFullScreen(!mainWindow?.isFullScreen())
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

  // AniList 新番时间表
  ipcMain.handle('season:fetchTimeline', async (_e, forceRefresh?: boolean) => {
    const cachePath = join(app.getPath('userData'), 'season-cache.json')
    const CACHE_TTL = 3600000

    if (!forceRefresh) {
      try {
        const cacheRaw = readFileSync(cachePath, 'utf-8')
        const cache = JSON.parse(cacheRaw)
        if (cache.timestamp && Date.now() - cache.timestamp < CACHE_TTL) {
          return { ok: true, fromCache: true, season: cache.data.season, anime: cache.data.anime }
        }
      } catch {}
    }

    try {
      const query = `
        query ($season: MediaSeason!, $year: Int!) {
          Page(page: 1, perPage: 70) {
            media(season: $season, seasonYear: $year, type: ANIME, format: TV, sort: POPULARITY_DESC) {
              id
              title { native romaji english }
              coverImage { large }
              episodes averageScore
              nextAiringEpisode { airingAt episode timeUntilAiring }
              format status genres
            }
          }
        }`
      const now = new Date()
      const m = now.getMonth() + 1
      let se = 'WINTER'; if (m >= 4 && m <= 6) se = 'SPRING'; else if (m >= 7 && m <= 9) se = 'SUMMER'; else if (m >= 10 && m <= 12) se = 'FALL'
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
      const seasonLabel = `${se} ${now.getFullYear()}`
      const anime = data.data.Page.media.map((m: any) => ({
        id: m.id,
        title: m.title?.native || m.title?.romaji || '',
        titleRomaji: m.title?.romaji || '',
        titleEnglish: m.title?.english || '',
        titleZh: '',
        cover: m.coverImage?.large || '',
        episodes: m.episodes ?? null,
        score: m.averageScore ?? null,
        genres: m.genres || [],
        format: m.format,
        status: m.status,
        nextAiring: m.nextAiringEpisode ? {
          episode: m.nextAiringEpisode.episode,
          airingAt: m.nextAiringEpisode.airingAt,
          timeUntilAiring: m.nextAiringEpisode.timeUntilAiring,
        } : null,
      }))

      // 同步翻译标题（主进程内完成，避免 N 次 IPC 往返）
      try { await loadModel() } catch {}
      try { await loadJaModel() } catch {}
      for (const a of anime) {
        // 先试 EN→ZH
        if (a.titleEnglish) {
          try {
            const zh = await translateEnToZh(a.titleEnglish)
            if (zh && zh !== a.titleEnglish) { a.titleZh = zh; continue }
          } catch {}
        }
        // 再试 JA→ZH
        try {
          const zh = await translateJaToZh(a.title)
          if (zh && zh !== a.title) { a.titleZh = zh; continue }
        } catch {}
        // 兜底
        a.titleZh = a.titleRomaji || a.titleEnglish || a.title
      }

      const payload = { season: seasonLabel, anime }
      try {
        writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), data: payload }, null, 2), 'utf-8')
      } catch {}
      return { ok: true, fromCache: false, ...payload }
    } catch (err: any) {
      console.error('[AniBox] season:fetchTimeline error:', err)
      try {
        const fb = JSON.parse(readFileSync(join(app.getPath('userData'), 'season-cache.json'), 'utf-8'))
        return { ok: true, fromCache: true, stale: true, ...fb.data }
      } catch {}
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
  createWindow()

  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow()
  })
})

app.on('window-all-closed', () => {
  mpvKill()
  stopWatching()
  flushStore()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopWatching()
  flushStore()
})
