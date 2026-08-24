/**
 * stream-server.ts — 局域网 HTTP 串流服务器（零第三方依赖，Node 内置 http）
 *
 * 路由：
 *   GET  /                  → 移动端网页（单文件，token 注入）
 *   GET  /api/library       → 番剧列表（含元数据/观看进度）
 *   GET  /api/episodes      → 某番剧剧集列表（含进度/外挂字幕）
 *   GET  /api/video?path=   → 直出文件流（HTTP Range 分段，支持拖动进度）
 *   GET  /api/cover?path=   → 封面图
 *   GET  /api/sub?path=     → 字幕（srt/ass → VTT）
 *   GET  /api/subs?path=    → 某集的外挂字幕列表
 *   GET  /api/progress      → 读取进度
 *   POST /api/progress      → 回写进度（与桌面端共享 store）
 *   GET  /api/probe?path=   → 编码探测结果
 *   GET  /api/stream?path=  → 获取可播放版本（直出/转封装/转码决策）
 *   GET  /api/stream-status → 转码任务状态（网页轮询）
 *   GET  /api/engine        → 转码引擎信息
 *
 * 安全：
 *   - /api/* 要求 ?key= 或 X-AniBox-Key 与 store.token 一致（requireToken 时）
 *   - 文件路径必须位于扫描根目录或串流缓存目录内（防路径穿越/任意文件读取）
 */
import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { createReadStream, existsSync, statSync, readdirSync } from 'fs'
import { join, resolve, basename, dirname } from 'path'
import { networkInterfaces } from 'os'
import webIndexHtml from './web/index.html?raw'
import * as store from './store'
import { findSubtitles, readSubtitleAsVtt } from './subtitle'
import { probeFile } from './video-probe'
import {
  ensurePlayable,
  getStreamStatus,
  getEngineInfo,
  StreamMode,
  cleanStreamCache,
  getStreamCacheSizeMB,
} from './transcode'

export interface StreamServerState {
  running: boolean
  port: number
  urls: string[]
  error?: string
}

let server: Server | null = null
let state: StreamServerState = { running: false, port: 0, urls: [] }

// ---------- MIME ----------
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.f4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.ts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.vtt': 'text/vtt',
  '.srt': 'text/plain',
}
function mimeOf(fp: string): string {
  return MIME['.' + (fp.split('.').pop() || '').toLowerCase()] || 'application/octet-stream'
}

// ---------- 工具 ----------

/** 虚拟网卡关键词（VirtualBox/VMware/Hyper-V/WSL/Docker/蓝牙等，手机通常连不上，不展示） */
const VIRTUAL_NIC = [
  'virtualbox', 'vmware', 'hyper-v', 'hyperv', 'vether', 'vethernet',
  'wsl', 'docker', 'tap-', 'tunnel', 'loopback', 'bluetooth', 'vpn',
  'taptap', 'tun', 'zerotier', 'tailscale', 'nordvpn', 'wireguard',
]

export function getLanUrls(port: number): string[] {
  const urls: string[] = []
  try {
    for (const [name, infos] of Object.entries(networkInterfaces())) {
      for (const info of infos || []) {
        if (info.family !== 'IPv4' || info.internal) continue
        const n = name.toLowerCase()
        if (VIRTUAL_NIC.some((k) => n.includes(k))) continue
        urls.push(`http://${info.address}:${port}`)
      }
    }
  } catch {
    /* ok */
  }
  return urls
}

/** 路径白名单：扫描根目录 ∪ 串流缓存目录（realpath 规范化 + 大小写不敏感比较） */
function isPathAllowed(fp: string): boolean {
  let abs: string
  try {
    abs = resolve(fp)
  } catch {
    return false
  }
  const norm = (p: string) => p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
  const roots = [...store.getScanRoots()]
  try {
    roots.push(join(require('electron').app.getPath('userData'), 'stream-cache'))
  } catch {
    /* ok */
  }
  for (const r of roots) {
    const rootNorm = norm(r)
    if (rootNorm && (norm(abs) === rootNorm || norm(abs).startsWith(rootNorm + '/'))) return true
  }
  return false
}

function checkAuth(req: IncomingMessage): boolean {
  const cfg = store.getStreamSettings()
  if (!cfg.requireToken) return true
  const u = new URL(req.url || '/', 'http://x')
  const q = u.searchParams.get('key') || ''
  const h = req.headers['x-anibox-key'] || ''
  return q === cfg.token || h === cfg.token
}

function sendJson(res: ServerResponse, code: number, obj: unknown): void {
  const body = JSON.stringify(obj)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function sendText(res: ServerResponse, code: number, text: string, type = 'text/plain; charset=utf-8'): void {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })
  res.end(text)
}

/** 文件流（支持 Range）。流式写出，客户端断开时销毁源流防句柄泄漏 */
function streamFile(res: ServerResponse, fp: string): void {
  let st: { size: number }
  try {
    st = statSync(fp)
  } catch {
    sendJson(res, 404, { error: 'file not found' })
    return
  }
  const mime = mimeOf(fp)
  const range = reqRange(res.req, st.size)
  if (range === 'invalid') {
    res.writeHead(416, { 'Content-Range': `bytes */${st.size}` })
    res.end()
    return
  }
  if (range) {
    const { start, end } = range
    const ns = createReadStream(fp, { start, end })
    res.writeHead(206, {
      'Content-Type': mime,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${st.size}`,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    })
    ns.on('error', () => res.destroy())
    res.on('close', () => ns.destroy())
    ns.pipe(res)
    return
  }
  const ns = createReadStream(fp)
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': String(st.size),
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  })
  ns.on('error', () => res.destroy())
  res.on('close', () => ns.destroy())
  ns.pipe(res)
}

function reqRange(req: IncomingMessage, size: number): { start: number; end: number } | null | 'invalid' {
  const h = req.headers.range
  if (!h) return null
  const m = h.match(/bytes=(\d*)-(\d*)/)
  if (!m) return 'invalid'
  let start = m[1] ? parseInt(m[1], 10) : NaN
  let end = m[2] ? parseInt(m[2], 10) : NaN
  if (isNaN(start)) {
    // 后缀范围：bytes=-N → 最后 N 字节
    if (isNaN(end) || end <= 0) return 'invalid'
    start = Math.max(0, size - end)
    end = size - 1
  } else {
    if (isNaN(end)) end = size - 1
    end = Math.min(end, size - 1)
  }
  if (start > end || start >= size) return 'invalid'
  return { start, end }
}

// ---------- API 数据 ----------

function buildLibrary() {
  const all = store.getAllSeries()
  const series = all.map((s) => {
    const meta = store.getSeriesMetadata(s.id)
    const watched = store.getSeriesProgress(s.id)
    return {
      id: s.id,
      title: meta?.titleCn || meta?.title || s.title,
      folderPath: s.folderPath,
      totalEps: s.totalEps,
      status: s.status,
      seriesType: s.seriesType,
      coverPath: s.coverPath || null,
      coverUrl: meta?.coverUrl || null,
      watched,
      meta: meta
        ? { year: meta.year, rating: meta.rating, studio: meta.studio, genres: meta.genres, synopsis: meta.synopsis }
        : null,
    }
  })
  const episodes: Record<string, unknown[]> = {}
  for (const s of all) {
    episodes[s.id] = store.getEpisodesBySeries(s.id).map((e) => ({
      id: e.id,
      epNumber: e.epNumber,
      fileName: e.fileName,
      filePath: e.filePath,
      progress: store.loadProgress(e.filePath),
    }))
  }
  return { series, episodes }
}

// ---------- 文件夹浏览 ----------

const VIDEO_EXTS = new Set([
  'mp4', 'm4v', 'f4v', 'mov', 'webm', 'ogv', 'ogg', '3gp',
  'mkv', 'avi', 'ts', 'm2ts', 'flv', 'wmv', 'rm', 'rmvb',
])

function isVideoFile(fp: string): boolean {
  return VIDEO_EXTS.has((fp.split('.').pop() || '').toLowerCase())
}

/** 自然排序（中文 + 数字感知） */
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

interface BrowseEntry {
  name: string
  path: string
}

interface BrowseResult {
  roots: BrowseEntry[] // dir 为空时的根目录列表
  dirs: BrowseEntry[]
  files: Array<BrowseEntry & { size: number }>
  parent: string | null // 上级目录（为空或与 dir 相同则无上级）
}

function listDirContent(dir: string): BrowseResult {
  const dirs: BrowseEntry[] = []
  const files: Array<BrowseEntry & { size: number }> = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const fp = join(dir, e.name)
    try {
      if (e.isDirectory()) {
        dirs.push({ name: e.name, path: fp })
      } else if (e.isFile() && isVideoFile(fp)) {
        files.push({ name: e.name, path: fp, size: statSync(fp).size })
      }
    } catch {
      /* 无权限/句柄占用，跳过 */
    }
  }
  dirs.sort((a, b) => collator.compare(a.name, b.name))
  files.sort((a, b) => collator.compare(a.name, b.name))
  const parent = dirname(dir)
  return { roots: [], dirs, files, parent: parent && parent !== dir ? parent : null }
}

/** 防止网页端反复触发桌面文件夹选择弹窗 */
let folderReqPending = false

// ---------- 请求分发 ----------

/** 导出供单元测试直测（沙箱环境禁回环 socket） */
export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const u = new URL(req.url || '/', 'http://x')
  const p = u.pathname

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-AniBox-Key',
    })
    res.end()
    return
  }

  if (p === '/') {
    // 注入主题名与是否要求口令；token 不内联（网页需输入口令验证后进入）
    const html = webIndexHtml
      .replace(/__ANIBOX_THEME__/g, store.getStreamSettings().theme || 'warm-oat')
      .replace(/__ANIBOX_REQUIRE_TOKEN__/g, String(store.getStreamSettings().requireToken))
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
    res.end(html)
    return
  }

  if (!p.startsWith('/api/')) {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  if (!checkAuth(req)) {
    sendJson(res, 403, { error: 'invalid key' })
    return
  }

  const q = (name: string): string => u.searchParams.get(name) || ''

  try {
    switch (p) {
      case '/api/library':
        sendJson(res, 200, buildLibrary())
        return

      case '/api/verify': {
        // 网页登录验证：key 与 store token 一致才算通过（requireToken 关闭时恒通过）
        const cfg = store.getStreamSettings()
        const key = q('key')
        sendJson(res, 200, { ok: !cfg.requireToken || (key !== '' && key === cfg.token) })
        return
      }

      case '/api/roots': {
        // 扫描根目录列表（网页文件夹浏览的起点）
        sendJson(
          res,
          200,
          store.getScanRoots().map((r) => ({ path: r, exists: existsSync(r) })),
        )
        return
      }

      case '/api/browse': {
        // 文件夹浏览：dir 为空 → 返回根目录；否则返回 dir 下的目录与视频文件
        const dir = q('dir')
        if (!dir) {
          const roots = store
            .getScanRoots()
            .filter((r) => r && existsSync(r))
            .map((r) => ({ name: basename(r) || r, path: r }))
          sendJson(res, 200, { roots, dirs: [], files: [], parent: null })
          return
        }
        if (!existsSync(dir) || !isPathAllowed(dir)) {
          sendJson(res, 403, { error: 'path not allowed' })
          return
        }
        try {
          sendJson(res, 200, listDirContent(dir))
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message })
        }
        return
      }

      case '/api/request-folder': {
        // 网页端请求在电脑上添加一个文件夹到扫描根目录（弹系统目录选择框）
        let dialog: typeof import('electron').dialog | undefined
        try {
          dialog = require('electron').dialog
        } catch {
          dialog = undefined
        }
        if (!dialog || !dialog.showOpenDialog) {
          sendJson(res, 500, { error: 'desktop dialog unavailable' })
          return
        }
        if (folderReqPending) {
          sendJson(res, 429, { error: '已有待处理的添加请求，请先在电脑上完成选择' })
          return
        }
        folderReqPending = true
        dialog
          .showOpenDialog({ title: '选择要加入串流的文件夹', properties: ['openDirectory'] })
          .then((r: { canceled: boolean; filePaths: string[] }) => {
            folderReqPending = false
            if (!r.canceled && r.filePaths?.[0]) {
              store.addScanRoot(r.filePaths[0])
              console.log('[AniBox] 串流网页添加文件夹:', r.filePaths[0])
            }
          })
          .catch(() => {
            folderReqPending = false
          })
        sendJson(res, 200, { ok: true, message: '请在电脑上选择文件夹' })
        return
      }

      case '/api/episodes': {
        const sid = q('seriesId')
        if (!sid) return sendJson(res, 400, { error: 'seriesId required' })
        const eps = store.getEpisodesBySeries(sid).map((e) => ({
          id: e.id,
          epNumber: e.epNumber,
          fileName: e.fileName,
          filePath: e.filePath,
          progress: store.loadProgress(e.filePath),
          subs: findSubtitles(e.filePath).map((s) => ({
            filePath: s.filePath,
            label: s.label,
            language: s.language,
          })),
        }))
        sendJson(res, 200, eps)
        return
      }

      case '/api/video': {
        const fp = q('path')
        if (!fp) return sendJson(res, 400, { error: 'path required' })
        if (!existsSync(fp) || !isPathAllowed(fp)) return sendJson(res, 403, { error: 'path not allowed' })
        streamFile(res, fp)
        return
      }

      case '/api/cover': {
        const fp = q('path')
        if (!fp) return sendJson(res, 400, { error: 'path required' })
        if (!existsSync(fp) || !isPathAllowed(fp)) return sendJson(res, 403, { error: 'path not allowed' })
        streamFile(res, fp)
        return
      }

      case '/api/sub': {
        const fp = q('path')
        if (!fp) return sendJson(res, 400, { error: 'path required' })
        if (!existsSync(fp) || !isPathAllowed(fp)) return sendJson(res, 403, { error: 'path not allowed' })
        try {
          const vtt = readSubtitleAsVtt(fp)
          sendText(res, 200, vtt, 'text/vtt; charset=utf-8')
        } catch (e) {
          sendJson(res, 500, { error: (e as Error).message })
        }
        return
      }

      case '/api/subs': {
        const fp = q('path')
        if (!fp) return sendJson(res, 400, { error: 'path required' })
        if (!existsSync(fp) || !isPathAllowed(fp)) return sendJson(res, 403, { error: 'path not allowed' })
        sendJson(
          res,
          200,
          findSubtitles(fp).map((s) => ({ filePath: s.filePath, label: s.label, language: s.language })),
        )
        return
      }

      case '/api/progress': {
        const fp = q('path')
        if (!fp) return sendJson(res, 400, { error: 'path required' })
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (d: Buffer) => (body += d.toString()))
          req.on('end', () => {
            try {
              const b = JSON.parse(body || '{}')
              const pos = Number(b.position)
              if (Number.isFinite(pos) && pos >= 0 && existsSync(fp) && isPathAllowed(fp)) {
                store.saveProgress(fp, pos)
                sendJson(res, 200, { ok: true })
              } else {
                sendJson(res, 400, { error: 'invalid body' })
              }
            } catch (e) {
              sendJson(res, 400, { error: (e as Error).message })
            }
          })
        } else {
          const pr = store.loadProgress(fp)
          sendJson(res, 200, pr || { position: 0 })
        }
        return
      }

      case '/api/probe': {
        const fp = q('path')
        if (!fp) return sendJson(res, 400, { error: 'path required' })
        probeFile(fp).then((r) => sendJson(res, 200, r || { error: 'probe failed' }))
        return
      }

      case '/api/stream': {
        const fp = q('path')
        const mode = (q('mode') || 'auto') as StreamMode
        if (!fp) return sendJson(res, 400, { error: 'path required' })
        if (!existsSync(fp) || !isPathAllowed(fp)) return sendJson(res, 403, { error: 'path not allowed' })
        ensurePlayable(fp, mode)
          .then((r) => sendJson(res, 200, r))
          .catch((e) => sendJson(res, 500, { error: (e as Error).message }))
        return
      }

      case '/api/stream-status': {
        const fp = q('path')
        const mode = (q('mode') || 'auto') as StreamMode
        if (!fp) return sendJson(res, 400, { error: 'path required' })
        sendJson(res, 200, getStreamStatus(fp, mode))
        return
      }

      case '/api/engine':
        sendJson(res, 200, { ...getEngineInfo(), cacheMB: getStreamCacheSizeMB() })
        return

      case '/api/cache-clean': {
        const mb = Math.max(100, Number(q('maxMB')) || 2048)
        sendJson(res, 200, cleanStreamCache(mb))
        return
      }

      default:
        sendJson(res, 404, { error: 'not found' })
    }
  } catch (e) {
    sendJson(res, 500, { error: (e as Error).message })
  }
}

// ---------- 生命周期 ----------

/**
 * 启动服务器。listen 完成（或失败）后才 resolve，保证调用方拿到的是真实运行状态。
 * Windows 上 EACCES 常见原因是端口落在系统保留段（Hyper-V/WSL 动态范围，如 8291-8390），
 * 与 EADDRINUSE 一样自动 +1 跳端口，成功后把实际端口回写 store。
 */
const MAX_PORT_RETRY = 200

export function startStreamServer(cfg: { port: number }): Promise<StreamServerState> {
  if (server) return Promise.resolve(state)
  const base = cfg.port || 17830
  server = createServer(handleRequest)
  return new Promise((resolve) => {
    server!.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE' || e.code === 'EACCES') {
        // 端口被占用/被系统保留 → 自动 +1 重试（最多 200 次，足以跳过保留段）
        const next = (state.port || base) + 1
        if (next <= base + MAX_PORT_RETRY) {
          stopStreamServer()
          state = { running: true, port: next, urls: [] }
          resolve(startStreamServer({ port: next }))
        } else {
          state = {
            running: false,
            port: 0,
            urls: [],
            error: `端口 ${base}~${base + MAX_PORT_RETRY} 均不可用（可能被系统保留），请在设置里换个端口`,
          }
          server = null
          resolve(state)
        }
      } else {
        state = { running: false, port: 0, urls: [], error: e.message }
        server = null
        resolve(state)
      }
    })
    server!.listen(base, '0.0.0.0', () => {
      const addr = server?.address()
      const port = typeof addr === 'object' && addr ? addr.port : base
      state = { running: true, port, urls: getLanUrls(port) }
      if (port !== cfg.port) {
        // 自动跳过了被占/被保留端口 → 回写 store，下次启动直接用可用端口
        try {
          store.setStreamSettings({ port })
        } catch {
          /* ok */
        }
        console.log(`[AniBox] 局域网串流: 端口 ${cfg.port} 不可用，已自动改用 ${port}`)
      }
      console.log('[AniBox] 局域网串流已启动:', state.urls.join(', '))
      resolve(state)
    })
  })
}

export function stopStreamServer(): void {
  if (server) {
    try {
      server.close()
    } catch {
      /* ok */
    }
    server = null
  }
  state = { running: false, port: 0, urls: [] }
}

export function getStreamServerState(): StreamServerState {
  return { ...state }
}

/** 清理缓存目录内孤立临时文件（退出时兜底，防残留） */
export function getStreamCacheDir(): string {
  try {
    return join(require('electron').app.getPath('userData'), 'stream-cache')
  } catch {
    return ''
  }
}
