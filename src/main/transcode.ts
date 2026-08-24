/**
 * transcode.ts — 局域网串流转码流水线
 *
 * 三档策略（配合 video-probe 探测结果）：
 *  1. direct   — 容器+编码浏览器原生可播，直接直出
 *  2. remux    — 容器不行但编码可播（mkv+H.264 等）：ffmpeg -c copy 转封装，
 *               秒级完成且不损失画质
 *  3. transcode— 编码不兼容（HEVC/AV1/AC3 等）：ffmpeg 重编码 libx264/aac
 *
 * 引擎：仅使用 ffmpeg（实测本机 mpv 构建无 --ovc=copy 编码支持）。
 *   查找顺序：resources / 便携根目录 / userData/ffmpeg / 开发根目录 / PATH，
 *   都没有则自动下载 ffmpeg 静态版（BtbN → gyan.dev 镜像回退）到 userData/ffmpeg。
 *
 * 产物落盘 userData/stream-cache/<hash>_<mtime>.mp4，命中缓存直接复用。
 * 单文件单任务（single-flight），重复请求等待同一任务完成。
 */
import { spawn, spawnSync } from 'child_process'
import { existsSync, mkdirSync, statSync, createWriteStream } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { app } from 'electron'
import { probeFile, getMpvPath, ProbeResult } from './video-probe'

export type StreamMode = 'auto' | 'remux' | 'transcode'

export interface StreamJob {
  state: 'working' | 'done' | 'error'
  progress: number // 0-1（下载阶段占 0~0.5，转码阶段 0.5~1）
  cachePath: string
  error?: string
  promise: Promise<string>
}

export interface PlayableResult {
  kind: 'direct' | 'cache' | 'live' | 'working' | 'error'
  /** 实际采用的模式：direct / remux / transcode（网页按它轮询 stream-status） */
  mode?: 'direct' | 'remux' | 'transcode'
  path?: string
  progress?: number
  message?: string
  probe?: ProbeResult | null
}

/** 产物达到该大小即可开始实时播放（fragmented mp4 的 ftyp+moov 在文件头，几百 KB 即可解析） */
const LIVE_MIN_BYTES = 512 * 1024

const jobs = new Map<string, StreamJob>()

// ---------- ffmpeg 查找 / 自动下载 ----------

/** 查找 ffmpeg.exe：resources / 便携根目录 / userData / 开发根目录 / PATH */
export function findFfmpeg(): string | null {
  const candidates: string[] = []
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'ffmpeg.exe'))
    candidates.push(join(dirname(process.resourcesPath), 'ffmpeg.exe'))
  }
  try {
    candidates.push(join(app.getPath('userData'), 'ffmpeg', 'ffmpeg.exe'))
  } catch {
    /* ok */
  }
  candidates.push(join(__dirname, '../../ffmpeg.exe'))
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {
      /* ok */
    }
  }
  return 'ffmpeg' // 兜底 PATH（spawn 自动解析）
}

// PATH 兜底可能名不副实（未安装），实测一次并缓存结果
let pathChecked = false
let pathOk = false
function checkPathFfmpeg(): boolean {
  if (pathChecked) return pathOk
  pathChecked = true
  try {
    const r = spawnSync('ffmpeg', ['-version'], { timeout: 5000, stdio: 'ignore' })
    pathOk = r.status === 0
  } catch {
    pathOk = false
  }
  return pathOk
}

export function hasFfmpeg(): boolean {
  const f = findFfmpeg()
  if (f === 'ffmpeg') return checkPathFfmpeg()
  return !!f && existsSync(f)
}

export interface FfmpegDownloadInfo {
  state: 'idle' | 'downloading' | 'done' | 'error'
  progress: number // 0-1
  bytes?: number
  total?: number
  message?: string
}

let downloadInfo: FfmpegDownloadInfo = { state: 'idle', progress: 0 }
let ffmpegReady: Promise<string | null> | null = null

const FFMPEG_URLS = [
  'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip',
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
]

/** 确保 ffmpeg 可用：已存在直接返回路径；否则自动下载（单飞，重复调用复用同一任务） */
export function ensureFfmpeg(): Promise<string | null> {
  if (hasFfmpeg()) return Promise.resolve(findFfmpeg())
  if (ffmpegReady) return ffmpegReady
  ffmpegReady = downloadFfmpeg().catch((e) => {
    downloadInfo = { state: 'error', progress: 0, message: (e as Error).message }
    return null
  })
  return ffmpegReady
}

/** 下载失败后重置，允许重新尝试（设置页「重试下载」按钮调用） */
export function resetFfmpegDownload(): void {
  ffmpegReady = null
  if (downloadInfo.state === 'error' || downloadInfo.state === 'done') {
    downloadInfo = { state: 'idle', progress: 0 }
  }
}

async function downloadFfmpeg(): Promise<string | null> {
  const dir = join(app.getPath('userData'), 'ffmpeg')
  const dlDir = join(dir, 'download')
  try {
    mkdirSync(dlDir, { recursive: true })
  } catch {
    /* ok */
  }
  const zipPath = join(dlDir, 'ffmpeg.zip')

  for (const url of FFMPEG_URLS) {
    downloadInfo = { state: 'downloading', progress: 0, message: url.includes('BtbN') ? '下载 ffmpeg（BtbN 镜像）…' : '下载 ffmpeg（gyan.dev 镜像）…' }
    try {
      await downloadFile(url, zipPath)
      downloadInfo = { state: 'downloading', progress: 1, message: '解压 ffmpeg…' }
      const exe = await extractFfmpegZip(zipPath, dlDir, dir)
      if (exe && existsSync(exe)) {
        try {
          const { unlinkSync } = require('fs') as typeof import('fs')
          unlinkSync(zipPath)
        } catch {
          /* ok */
        }
        downloadInfo = { state: 'done', progress: 1 }
        return exe
      }
    } catch (e) {
      downloadInfo.message = `下载失败: ${(e as Error).message}，尝试下一个镜像`
    }
  }
  downloadInfo = { state: 'error', progress: 0, message: 'ffmpeg 下载失败（BtbN/gyan.dev 均不可用）' }
  return null
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const req = require('https').get(url, (res: any) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy()
        downloadFile(res.headers.location, dest).then(resolvePromise, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const total = Number(res.headers['content-length']) || 0
      let got = 0
      const out = createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        got += chunk.length
        if (total > 0) downloadInfo.progress = Math.min(0.95, got / total)
      })
      res.pipe(out)
      out.on('finish', () => resolvePromise())
      out.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(120000, () => {
      req.destroy(new Error('下载超时'))
    })
  })
}

/** 解压 zip 并定位 ffmpeg.exe（PowerShell Expand-Archive 优先，tar 兜底；最后递归查找并复制到 userData/ffmpeg/ffmpeg.exe） */
function extractFfmpegZip(zipPath: string, dlDir: string, targetDir: string): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const extractDir = join(dlDir, 'x')
    const run = (cmd: string, args: string[]) =>
      new Promise<boolean>((r) => {
        const p = spawn(cmd, args, { stdio: 'ignore' })
        p.on('error', () => r(false))
        p.on('close', (code) => r(code === 0))
      })

    run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`,
    ]).then(async (ok) => {
      if (!ok) {
        // tar 兜底（Win10+ 自带 bsdtar，可解 zip）
        await run('tar', ['-xf', zipPath, '-C', dlDir])
      }
      // 递归查找 ffmpeg.exe
      const found = findFile(extractDir, 'ffmpeg.exe')
      if (found) {
        try {
          const { copyFileSync } = require('fs') as typeof import('fs')
          const dest = join(targetDir, 'ffmpeg.exe')
          copyFileSync(found, dest)
          resolvePromise(dest)
          return
        } catch {
          resolvePromise(found) // 复制失败则直接用原始位置
          return
        }
      }
      resolvePromise(null)
    })
  })
}

function findFile(dir: string, name: string): string | null {
  try {
    const { readdirSync } = require('fs') as typeof import('fs')
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        const r = findFile(p, name)
        if (r) return r
      } else if (e.name.toLowerCase() === name.toLowerCase()) {
        return p
      }
    }
  } catch {
    /* ok */
  }
  return null
}

export function getEngineInfo() {
  const f = findFfmpeg()
  return {
    ffmpeg: hasFfmpeg(),
    ffmpegPath: f && f !== 'ffmpeg' ? f : null,
    mpv: existsSync(getMpvPath()),
    download: { ...downloadInfo },
  }
}

// ---------- 缓存 ----------

function cacheDir(): string {
  const dir = join(app.getPath('userData'), 'stream-cache')
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  } catch {
    /* ok */
  }
  return dir
}

function cacheKey(filePath: string, mode: string): string {
  let mtime = 0
  try {
    mtime = statSync(filePath).mtimeMs
  } catch {
    /* ok */
  }
  const h = createHash('md5').update(filePath).digest('hex').substring(0, 12)
  // v2：fragmented mp4 参数（frag_keyframe+empty_moov），旧 faststart 缓存失效重转
  return `${h}_${Math.floor(mtime)}_${mode}_v2.mp4`
}

/** 浏览器原生支持直出的扩展名（probe 失败时按扩展名保守直出，播不了网页会 error 降级转码） */
const DIRECT_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', '3gp'])

/** 判断浏览器（手机 Safari/Chrome 保守交集）能否原生直出 */
function isDirectPlayable(p: ProbeResult | null, ext: string): boolean {
  if (!p) return false
  const container = p.container.toLowerCase()
  const goodContainer =
    container.includes('mp4') || container.includes('webm') || container.includes('ogg') || container.includes('mov')
  const goodCodec = ['h264', 'avc1', 'vp8', 'vp9', 'av01', 'av1'].includes(p.videoCodec)
  const goodAudio = p.audioCodecs.every((c) => ['aac', 'mp3', 'opus', 'vorbis', 'mp4a'].includes(c))
  return goodContainer && goodCodec && goodAudio && ext !== 'mkv'
}

/**
 * 需要转码（remux copy 无法保证浏览器可播）：
 * 仅 h264 走 remux copy；HEVC（尤其 10bit，Safari 不支持 → 有声音没画面）、
 * AV1/VP9 等一律转码 libx264（iOS Safari/Android Chrome 均兼容 8bit h264）
 */
function needsTranscode(p: ProbeResult): boolean {
  const vc = (p.videoCodec || '').toLowerCase()
  return !(vc.includes('h264') || vc.includes('avc'))
}

// ---------- 任务 ----------

/**
 * 获取可播放版本。返回 direct（原文件直出）/ cache（缓存产物）即时可用，
 * 或 working（下载/转码中，需轮询 /api/stream-status）。
 */
export async function ensurePlayable(
  filePath: string,
  mode: StreamMode = 'auto',
): Promise<PlayableResult> {
  const ext = (filePath.split('.').pop() || '').toLowerCase()
  let probe: ProbeResult | null = null

  if (mode === 'transcode') {
    // 强制重编码：不需要探测，直接跑 transcode 任务
  } else if (DIRECT_EXT.has(ext)) {
    // mp4/webm 等浏览器原生容器：probe 判断编码（h264 直出 / HEVC 转码）
    probe = await probeFile(filePath)
    if (isDirectPlayable(probe, ext) || !probe) {
      // 可直出，或探测失败（保守直出试播，播不了网页会 error 降级）
      return { kind: 'direct', mode: 'direct', path: filePath, probe }
    }
  }

  // 决定产物模式：auto 时非原生容器先探测视频编码——
  // HEVC/AV1/VP9 等 Safari/Android 解不了（remux copy 后"有声音没画面"），
  // 一律走 libx264 转码保证兼容；仅 h264 走 remux copy（快、无损）
  let effMode: 'remux' | 'transcode'
  if (mode === 'transcode') effMode = 'transcode'
  else if (mode === 'remux') effMode = 'remux'
  else {
    if (!DIRECT_EXT.has(ext)) {
      probe = probe || (await probeFile(filePath).catch(() => null))
      effMode = probe && needsTranscode(probe) ? 'transcode' : 'remux'
    } else {
      effMode = 'remux'
    }
  }

  const out = join(cacheDir(), cacheKey(filePath, effMode))
  if (existsSync(out) && statSync(out).size > 1024) {
    return { kind: 'cache', mode: effMode, path: out, probe }
  }

  const key = `${filePath}|${effMode}`
  let job = jobs.get(key)
  if (job) {
    if (job.state === 'done') return { kind: 'cache', mode: effMode, path: job.cachePath, probe }
    if (job.state === 'error') return { kind: 'error', mode: effMode, message: job.error || '转码失败', probe }
    // 任务进行中：产物已可读 → 实时播放（边转边播），否则等网页轮询
    if (isLiveReady(job.cachePath)) {
      return { kind: 'live', mode: effMode, path: job.cachePath, probe, progress: job.progress }
    }
    return { kind: 'working', mode: effMode, progress: job.progress, probe }
  }

  const promise = runJob(filePath, out, effMode, probe)
  // 不 await 完成（后台继续跑，状态经 jobs/getStreamStatus 查询）
  promise.catch(() => {})
  job = { state: 'working', progress: 0, cachePath: out, promise }
  jobs.set(key, job)

  // 等产物写入到可播大小（fragmented mp4 头部写完即可解析），最多 6s
  const deadline = Date.now() + 6000
  while (Date.now() < deadline) {
    if (isLiveReady(out)) {
      return { kind: 'live', mode: effMode, path: out, probe, progress: job.progress }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return { kind: 'working', mode: effMode, progress: job.progress, probe }
}

function isLiveReady(out: string): boolean {
  try {
    return existsSync(out) && statSync(out).size >= LIVE_MIN_BYTES
  } catch {
    return false
  }
}

/** 查询任务状态（网页端轮询用）。state: idle/working/live/done/error（live=产物可读，可实时播放） */
export function getStreamStatus(filePath: string, mode: StreamMode = 'auto'): {
  state: 'idle' | 'working' | 'live' | 'done' | 'error'
  progress: number
  cachePath?: string
  error?: string
} {
  const modes: ('remux' | 'transcode')[] = mode === 'transcode' ? ['transcode'] : mode === 'remux' ? ['remux'] : ['remux', 'transcode']
  for (const m of modes) {
    const job = jobs.get(`${filePath}|${m}`)
    if (job) {
      if (job.state === 'done') return { state: 'done', progress: 1, cachePath: job.cachePath }
      if (job.state === 'error') return { state: 'error', progress: job.progress, error: job.error }
      if (isLiveReady(job.cachePath)) {
        return { state: 'live', progress: job.progress, cachePath: job.cachePath }
      }
      return { state: 'working', progress: job.progress }
    }
    const out = join(cacheDir(), cacheKey(filePath, m))
    if (existsSync(out) && statSync(out).size > 1024) {
      return { state: 'done', progress: 1, cachePath: out }
    }
  }
  return { state: 'idle', progress: 0 }
}

function setJobDone(key: string): void {
  const j = jobs.get(key)
  if (j) {
    j.state = 'done'
    j.progress = 1
  }
}

function setJobError(key: string, err: string): void {
  const j = jobs.get(key)
  if (j) {
    j.state = 'error'
    j.error = err
  }
}

async function runJob(filePath: string, out: string, mode: 'remux' | 'transcode', probe: ProbeResult | null): Promise<string> {
  const key = `${filePath}|${mode}`

  // 先把 job.progress 挂到下载进度上（下载占 0~0.5）
  const dlTimer = setInterval(() => {
    const job = jobs.get(key)
    if (!job) return
    if (downloadInfo.state === 'downloading') job.progress = downloadInfo.progress * 0.5
    else if (downloadInfo.state === 'done' || downloadInfo.state === 'idle') job.progress = 0.5
  }, 500)

  try {
    const ffmpeg = await ensureFfmpeg()
    clearInterval(dlTimer)
    if (!ffmpeg) {
      setJobError(key, downloadInfo.message || '未找到 ffmpeg 且自动下载失败（请手动放置 ffmpeg.exe 到应用目录）')
      return ''
    }

    const args =
      mode === 'remux'
        ? [
            '-y',
            '-i', filePath,
            '-map', '0:v:0',
            '-map', '0:a?',
            '-map_metadata', '0',
            '-c', 'copy',
            // fragmented mp4：Safari 流式播放兼容性最佳（faststart 对 iPad Safari 不友好，实测黑屏）
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            out,
          ]
        : [
            '-y',
            '-i', filePath,
            '-map', '0:v:0',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            out,
          ]

    return await new Promise<string>((resolve) => {
      const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderrTail = ''
      proc.stderr.on('data', (d: Buffer) => {
        const s = d.toString()
        stderrTail = (stderrTail + s).slice(-600)
        if (mode === 'transcode' && probe && probe.duration > 0) {
          const m = s.match(/time=(\d+):(\d+):(\d+)/)
          if (m) {
            const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
            const job = jobs.get(key)
            if (job) job.progress = Math.min(0.99, 0.5 + (0.5 * t) / probe.duration)
          }
        }
      })
      proc.on('error', (e) => {
        setJobError(key, '无法启动 ffmpeg: ' + e.message)
        resolve('')
      })
      proc.on('close', (code, signal) => {
        if (code === 0 && existsSync(out) && statSync(out).size > 1024) {
          setJobDone(key)
          resolve(out)
        } else {
          setJobError(key, `ffmpeg 退出 (code=${code ?? signal ?? '?'})${stderrTail ? ': ' + stderrTail.trim().split('\n').pop() : ''}`)
          resolve('')
        }
      })
    })
  } catch (e) {
    clearInterval(dlTimer)
    setJobError(key, (e as Error).message)
    return ''
  }
}

// ---------- 缓存管理 ----------

/** 清点缓存文件并清理超过 maxMB 的旧产物（设置页按钮调用） */
export function cleanStreamCache(maxMB = 2048): { removed: number; freedMB: number } {
  const dir = cacheDir()
  let removed = 0
  let freedMB = 0
  try {
    const { readdirSync, unlinkSync } = require('fs') as typeof import('fs')
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => {
        const p = join(dir, f)
        let mtime = 0
        let size = 0
        try {
          const st = statSync(p)
          mtime = st.mtimeMs
          size = st.size
        } catch {
          /* ok */
        }
        return { p, mtime, size }
      })
      .sort((a, b) => a.mtime - b.mtime)
    let total = files.reduce((s, f) => s + f.size, 0)
    const limit = maxMB * 1024 * 1024
    for (const f of files) {
      if (total <= limit) break
      try {
        unlinkSync(f.p)
        total -= f.size
        removed++
        freedMB += f.size / 1024 / 1024
      } catch {
        /* ok */
      }
    }
  } catch {
    /* ok */
  }
  return { removed, freedMB: Math.round(freedMB) }
}

export function getStreamCacheSizeMB(): number {
  const dir = cacheDir()
  try {
    const { readdirSync } = require('fs') as typeof import('fs')
    let total = 0
    for (const f of readdirSync(dir)) {
      try {
        total += statSync(join(dir, f)).size
      } catch {
        /* ok */
      }
    }
    return Math.round(total / 1024 / 1024)
  } catch {
    return 0
  }
}
