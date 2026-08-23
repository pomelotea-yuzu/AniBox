/**
 * video-probe.ts — 用 mpv JSON IPC 探测视频容器/编码（局域网串流决策用）
 *
 * 复用 detectSubtitlesViaMpv 的管道模式：spawn mpv --idle + named pipe，
 * loadfile 后读 track-list / demuxer-lavf-type / duration。
 * 探测结果按 (path, mtime, size) 缓存，避免重复起进程（番剧库大时开销明显）。
 */
import { spawn } from 'child_process'
import { createConnection, Socket } from 'net'
import { existsSync, statSync } from 'fs'
import { join, dirname } from 'path'

export interface ProbeResult {
  /** 容器 lavf 名称，如 'mp4' / 'matroska,webm' */
  container: string
  /** 视频编码，如 'h264' / 'hevc' / 'vp9' */
  videoCodec: string
  videoWidth: number
  videoHeight: number
  /** 音频编码列表 */
  audioCodecs: string[]
  /** 时长（秒） */
  duration: number
}

const cache = new Map<string, ProbeResult>()

/** 与 index.ts getMpvPath 一致的查找策略（打包/便携/开发布局） */
export function getMpvPath(): string {
  if (process.resourcesPath) {
    const standard = join(process.resourcesPath, 'mpv.exe')
    if (existsSync(standard)) return standard
    const portable = join(dirname(process.resourcesPath), 'mpv.exe')
    if (existsSync(portable)) return portable
    return standard
  }
  return join(__dirname, '../../mpv.exe')
}

/** 带缓存的文件探测；失败返回 null */
export async function probeFile(filePath: string): Promise<ProbeResult | null> {
  try {
    const st = statSync(filePath)
    const key = `${filePath}|${st.mtimeMs}|${st.size}`
    const hit = cache.get(key)
    if (hit) return hit
    const r = await probeViaMpv(filePath)
    if (r) {
      cache.set(key, r)
      if (cache.size > 300) cache.clear()
    }
    return r
  } catch {
    return null
  }
}

/** 强制清除探测缓存（扫描更新后调用） */
export function clearProbeCache(): void {
  cache.clear()
}

function probeViaMpv(filePath: string): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    const exe = getMpvPath()
    if (!existsSync(exe)) {
      resolve(null)
      return
    }
    const pipeName = `\\\\.\\pipe\\anibox-probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    let sock: Socket | null = null
    let buf = ''
    let resolved = false
    let trackList: any[] | null = null
    let lavfType = ''
    let duration = 0

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
    const finish = (r: ProbeResult | null) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(r)
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
    proc.on('error', () => finish(null))

    setTimeout(() => {
      if (resolved) return
      sock = createConnection(pipeName)
      sock.once('connect', () => {
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
              sock!.write(JSON.stringify({ command: ['get_property', 'track-list'], request_id: 1 }) + '\n')
              sock!.write(JSON.stringify({ command: ['get_property', 'demuxer-lavf-type'], request_id: 2 }) + '\n')
              sock!.write(JSON.stringify({ command: ['get_property', 'duration'], request_id: 3 }) + '\n')
            } else if (msg.request_id === 1 && msg.data !== undefined) {
              trackList = msg.data || []
              tryDone()
            } else if (msg.request_id === 2 && msg.data !== undefined) {
              lavfType = String(msg.data || '')
              tryDone()
            } else if (msg.request_id === 3 && msg.data !== undefined) {
              duration = Number(msg.data) || 0
              tryDone()
            }
          } catch {
            /* ignore malformed JSON */
          }
        }
      })
      sock.on('error', () => finish(null))
      sock.on('close', () => {
        if (trackList) finish(buildResult(trackList, lavfType, duration))
        else finish(null)
      })
    }, 400)

    // 三个属性都拿齐（或轨道列表拿到后短等 lavf/duration 回包）即收工
    let doneCalled = false
    function tryDone(): void {
      if (doneCalled) return
      if (trackList === null) return
      // 轨道列表已到手，lavf/duration 可能稍慢，给 300ms 窗口
      doneCalled = true
      const tracks = trackList
      setTimeout(() => {
        finish(buildResult(tracks, lavfType, duration))
      }, 300)
    }

    const timeout = setTimeout(() => finish(null), 10000)
  })
}

function buildResult(trackList: any[], lavfType: string, duration: number): ProbeResult | null {
  const video = trackList.find((t: any) => t.type === 'video')
  const audioTracks = trackList.filter((t: any) => t.type === 'audio')
  if (!video) return null
  const vp = video['video-params'] || {}
  return {
    container: lavfType || '',
    videoCodec: String(video.codec || '').toLowerCase(),
    videoWidth: Number(video['demux-w'] || vp.w || 0),
    videoHeight: Number(video['demux-h'] || vp.h || 0),
    audioCodecs: audioTracks.map((t: any) => String(t.codec || '').toLowerCase()),
    duration,
  }
}
