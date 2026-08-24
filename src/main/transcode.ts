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

export type StreamMode =
  | 'auto'
  | 'remux'
  | 'remux-hvc1' // 8bit HEVC copy + hvc1 标记（Safari 可播）
  | 'transcode'
  | 'transcode-hvc1' // 任意 → 8bit HEVC（硬件优先）
  | 'transcode-h264' // 任意 → 8bit h264（全兼容）

export interface StreamJob {
  state: 'working' | 'done' | 'error'
  progress: number // 0-1（下载阶段占 0~0.5，转码阶段 0.5~1）
  cachePath: string
  error?: string
  promise: Promise<string>
}

export interface PlayableResult {
  kind: 'direct' | 'cache' | 'live' | 'working' | 'error'
  /** 实际采用的模式（网页按它轮询 stream-status） */
  mode?: StreamMode | 'direct'
  path?: string
  progress?: number
  message?: string
  probe?: ProbeResult | null
}

/** 产物达到该大小即可开始实时播放（fragmented mp4 的 ftyp+moov 在文件头，几百 KB 即可解析） */
const LIVE_MIN_BYTES = 512 * 1024

// ---------- 硬件编码器探测 ----------

export interface EncodersInfo {
  hevc: string | null // hevc_nvenc / hevc_qsv / hevc_amf / null
  h264: string | null
}

let encodersCache: EncodersInfo | null = null

/** 探测可用硬件编码器（ffmpeg -encoders 解析，优先级 nvenc > qsv > amf；结果缓存） */
export async function detectEncoders(): Promise<EncodersInfo> {
  if (encodersCache) return encodersCache
  const r: EncodersInfo = { hevc: null, h264: null }
  try {
    const f = findFfmpeg()
    if (!f) return r
    const { execFileSync } = require('child_process') as typeof import('child_process')
    const out = execFileSync(f, ['-hide_banner', '-encoders'], {
      timeout: 8000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }) as string
    for (const line of out.split('\n')) {
      const m = line.match(/^V\S*\s+(\S+)/)
      if (!m) continue
      const name = m[1]
      const prio = (enc: string): number => (enc.includes('nvenc') ? 3 : enc.includes('qsv') ? 2 : enc.includes('amf') ? 1 : 0)
      if (name.startsWith('hevc_') && prio(name) > 0 && prio(name) > prio(r.hevc || '')) r.hevc = name
      if (name.startsWith('h264_') && prio(name) > 0 && prio(name) > prio(r.h264 || '')) r.h264 = name
    }
  } catch {
    /* 无 ffmpeg 或解析失败 → 全 null（回退软件编码） */
  }
  encodersCache = r
  return r
}

/** 清空编码器探测缓存（ffmpeg 重装后调用） */
export function resetEncodersCache(): void {
  encodersCache = null
}

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
    encoders: encodersCache, // 硬件编码器（null = 尚未探测）
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

// ---------- 任务 ----------

/**
 * 获取可播放版本。返回 direct（原文件直出）/ cache（缓存产物）即时可用，
 * live（边转边播）/ working（需轮询 /api/stream-status）。
 * @param cap 设备解码能力（网页 canPlayType 探测）：'hvc1' = 支持 HEVC 解码
 */
export async function ensurePlayable(
  filePath: string,
  mode: StreamMode = 'auto',
  cap = '',
): Promise<PlayableResult> {
  const ext = (filePath.split('.').pop() || '').toLowerCase()
  let probe: ProbeResult | null = null

  if (mode === 'transcode') {
    // 强制重编码（网页 error 降级）：输出 h264 最稳
  } else if (DIRECT_EXT.has(ext)) {
    // mp4/webm 等浏览器原生容器：probe 判断编码（h264 直出 / HEVC 转码）
    probe = await probeFile(filePath)
    if (isDirectPlayable(probe, ext) || !probe) {
      // 可直出，或探测失败（保守直出试播，播不了网页会 error 降级）
      return { kind: 'direct', mode: 'direct', path: filePath, probe }
    }
  }

  // ---- 决策产物模式 ----
  // remux（h264 原样 copy）/ remux-hvc1（8bit HEVC copy+hvc1，秒开）/
  // transcode-hvc1（转 8bit HEVC）/ transcode-h264（转 8bit h264）
  let eff: StreamMode
  if (mode === 'transcode') {
    eff = 'transcode-h264'
  } else if (mode === 'remux') {
    eff = 'remux'
  } else {
    // auto：非原生容器先探测编码
    if (!DIRECT_EXT.has(ext)) probe = probe || (await probeFile(filePath).catch(() => null))
    if (!probe) {
      eff = 'remux' // 探测失败保守 remux（网页 error 降级兜底）
    } else if (isH264(probe)) {
      eff = 'remux'
    } else if (isHevc(probe) && !is10bit(probe) && probe.pixFmt) {
      // 确认 8bit HEVC：copy + hvc1 标记，免转码秒开（iOS Safari 原生支持）
      eff = 'remux-hvc1'
    } else {
      // 10bit HEVC / 位深未知（保守转码防黑屏）/ AV1 / VP9 / 其他：转码。
      // 设备支持 HEVC 且有硬件 HEVC 编码器 → 8bit HEVC 产物（快+小）；否则 h264
      const enc = await detectEncoders()
      eff = cap === 'hvc1' && enc.hevc ? 'transcode-hvc1' : 'transcode-h264'
    }
  }

  const out = join(cacheDir(), cacheKey(filePath, eff))
  if (existsSync(out) && statSync(out).size > 1024) {
    return { kind: 'cache', mode: eff, path: out, probe }
  }

  const key = `${filePath}|${eff}`
  let job = jobs.get(key)
  if (job) {
    if (job.state === 'done') return { kind: 'cache', mode: eff, path: job.cachePath, probe }
    if (job.state === 'error') return { kind: 'error', mode: eff, message: job.error || '转码失败', probe }
    // 任务进行中：产物已可读 → 实时播放（边转边播），否则等网页轮询
    if (isLiveReady(job.cachePath)) {
      return { kind: 'live', mode: eff, path: job.cachePath, probe, progress: job.progress }
    }
    return { kind: 'working', mode: eff, progress: job.progress, probe }
  }

  const promise = runJob(filePath, out, eff, probe)
  // 不 await 完成（后台继续跑，状态经 jobs/getStreamStatus 查询）
  promise.catch(() => {})
  job = { state: 'working', progress: 0, cachePath: out, promise }
  jobs.set(key, job)

  // 等产物写入到可播大小（fragmented mp4 头部写完即可解析），最多 6s
  const deadline = Date.now() + 6000
  while (Date.now() < deadline) {
    if (isLiveReady(out)) {
      return { kind: 'live', mode: eff, path: out, probe, progress: job.progress }
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return { kind: 'working', mode: eff, progress: job.progress, probe }
}

function isLiveReady(out: string): boolean {
  try {
    return existsSync(out) && statSync(out).size >= LIVE_MIN_BYTES
  } catch {
    return false
  }
}

function isH264(p: ProbeResult): boolean {
  const vc = (p.videoCodec || '').toLowerCase()
  return vc.includes('h264') || vc.includes('avc')
}

function isHevc(p: ProbeResult): boolean {
  return (p.videoCodec || '').toLowerCase().includes('hevc')
}

/** 10bit（含 12bit）：pixFmt 形如 yuv420p10le / yuv422p12le / p010 */
function is10bit(p: ProbeResult): boolean {
  return /(^|[^0-9])1[02](le|be)?$/.test(p.pixFmt || '') || (p.pixFmt || '').includes('p010')
}

/** 查询任务状态（网页端轮询用）。state: idle/working/live/done/error（live=产物可读，可实时播放） */
export function getStreamStatus(filePath: string, mode: StreamMode = 'auto'): {
  state: 'idle' | 'working' | 'live' | 'done' | 'error'
  progress: number
  cachePath?: string
  error?: string
} {
  const modes: StreamMode[] =
    mode === 'auto'
      ? ['remux', 'remux-hvc1', 'transcode-h264', 'transcode-hvc1']
      : [mode]
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

async function runJob(filePath: string, out: string, mode: StreamMode, probe: ProbeResult | null): Promise<string> {
  const key = `${filePath}|${mode}`
  const isRemux = mode === 'remux' || mode === 'remux-hvc1'

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

    const args = isRemux ? buildRemuxArgs(filePath, out, mode) : await buildEncodeArgs(filePath, out, mode)

    return await new Promise<string>((resolve) => {
      const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderrTail = ''
      proc.stderr.on('data', (d: Buffer) => {
        const s = d.toString()
        stderrTail = (stderrTail + s).slice(-600)
        if (!isRemux && probe && probe.duration > 0) {
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

function buildRemuxArgs(filePath: string, out: string, mode: StreamMode): string[] {
  return [
    '-y',
    '-i', filePath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-map_metadata', '0',
    '-c', 'copy',
    // 8bit HEVC → 强制 hvc1 标记（Safari 要求 hvc1，源可能为 hev1）
    ...(mode === 'remux-hvc1' ? ['-tag:v', 'hvc1'] : []),
    // fragmented mp4：Safari 流式播放兼容性最佳（faststart 对 iPad Safari 不友好，实测黑屏）
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    out,
  ]
}

/** 转码参数：10bit/HEVC/AV1/VP9 → 8bit HEVC(hvc1) 或 8bit h264，硬件编码器优先 */
async function buildEncodeArgs(filePath: string, out: string, mode: StreamMode): Promise<string[]> {
  const codec = mode === 'transcode-hvc1' ? 'hvc1' : 'h264'
  const enc = await pickEncoder(codec)
  const base = [
    '-y',
    '-i', filePath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
  ]
  const vargs = codec === 'hvc1' ? hevcVideoArgs(enc) : h264VideoArgs(enc)
  const tag = codec === 'hvc1' ? ['-tag:v', 'hvc1'] : []
  return [...base, ...vargs, ...tag, out]
}

async function pickEncoder(codec: 'hvc1' | 'h264'): Promise<string> {
  const enc = await detectEncoders()
  return codec === 'hvc1' ? enc.hevc || 'libx265' : enc.h264 || 'libx264'
}

function hevcVideoArgs(enc: string): string[] {
  if (enc.includes('nvenc')) return ['-c:v', 'hevc_nvenc', '-preset', 'p4', '-cq', '24', '-pix_fmt', 'yuv420p']
  if (enc.includes('qsv')) return ['-c:v', 'hevc_qsv', '-global_quality', '24', '-pix_fmt', 'yuv420p']
  if (enc.includes('amf')) return ['-c:v', 'hevc_amf', '-quality', 'balanced', '-qp_i', '24', '-qp_p', '24', '-pix_fmt', 'yuv420p']
  return ['-c:v', 'libx265', '-preset', 'veryfast', '-x265-params', 'profile=main:crf=24', '-pix_fmt', 'yuv420p']
}

function h264VideoArgs(enc: string): string[] {
  if (enc.includes('nvenc')) return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '24']
  if (enc.includes('qsv')) return ['-c:v', 'h264_qsv', '-global_quality', '24']
  if (enc.includes('amf')) return ['-c:v', 'h264_amf', '-quality', 'balanced', '-qp_i', '24', '-qp_p', '24']
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']
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
