// === 播放后端：libmpv 内嵌（方案 A）+ mpv.exe Named Pipe 兜底 ===
// 优先 libmpv 内嵌（单窗口，帧走 IPC → Canvas）；失败自动回退旧 mpv.exe 独立窗口
import { app, type BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import { createConnection, type Socket } from 'net'
import { LibmpvBridge, findLibmpvDll } from './libmpv-bridge'

let getWindow: () => BrowserWindow | null = () => null

/** 由 index.ts 注入主窗口 getter（窗口可重建，引用会变） */
export function setMpvWindowGetter(fn: () => BrowserWindow | null): void {
  getWindow = fn
}

let libmpvBridge: LibmpvBridge | null = null
let libmpvFailed = false // 一次加载失败后不再尝试（防重复启动旧链路）

export function libmpvQuit(): void {
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
          getWindow()?.webContents.send('mpv:preview-frame', frame.buffer, frame.width, frame.height)
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
export async function libmpvPreviewAt(filePath: string, t: number): Promise<boolean> {
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
      getWindow()?.webContents.send('mpv:frame', frame.buffer, frame.width, frame.height)
    },
    onFileLoaded: ({ width, height }) => {
      console.log('[libmpv] 文件加载完成:', width, 'x', height)
      getWindow()?.webContents.send('mpv:event', { event: 'file-loaded' })
    },
    onStartFile: () => {
      getWindow()?.webContents.send('mpv:event', { event: 'start-file' })
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
      getWindow()?.webContents.send('mpv:event', { event: 'end-file', reason: reasonStr })
    },
    onEofReached: (reached) => {
      // keep-open=yes 时播放完不发 END_FILE，靠 eof-reached 属性变化触发连播
      if (reached) {
        console.log('[libmpv] eof-reached → 触发连播')
        getWindow()?.webContents.send('mpv:event', { event: 'eof-reached' })
      }
    },
    onTracks: (tracks) => {
      getWindow()?.webContents.send('mpv:event', { event: 'tracks', data: tracks })
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

export function mpvKill(): void {
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

export function mpvLaunch(fp: string): Promise<void> {
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
        getWindow()?.webContents.send('mpv:event', { event: 'end' })
        getWindow()?.focus()
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
                getWindow()?.webContents.send('mpv:event', msg)
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
                getWindow()?.webContents.send('mpv:event', {
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
    getWindow()?.webContents.send('mpv:event', { event: 'ready' })
  })
}

/** mpv:play 完整策略：libmpv 优先，失败置 libmpvFailed 并回退 mpv.exe */
export function playWithMpv(p: string): void | Promise<void> {
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
    getWindow()?.webContents.send('mpv:event', { event: 'libmpv-fallback' })
  }
  console.log('[AniBox] 回退 mpv.exe 独立窗口播放:', p)
  return mpvLaunch(p)
}

/** 向运行中的播放后端发送命令（libmpv 优先，其次 mpv.exe JSON IPC） */
export function sendMpvCommand(cmd: any[]): boolean {
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
}

/** 播放状态轮询（渲染进程进度条用） */
export function getMpvState(): Record<string, unknown> | null {
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
}

// === 通过 mpv 检测内封字幕轨道（解决 Chromium 不暴露 ASS/SSA/PGS 字幕的问题）===
interface EmbeddedSubTrack {
  label: string
  language: string
  codec: string
  index: number
}

export function detectSubtitlesViaMpv(filePath: string): Promise<EmbeddedSubTrack[]> {
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
