/**
 * AnimeGarden 资源搜索 + qBittorrent 下载联动
 *
 * - searchAnimeGarden: 查询动漫花园聚合站资源（AnimeGarden API）
 * - buildAnimeGardenRss: 按标题生成 RSS 订阅链接（可直接粘贴到 qBittorrent RSS 订阅）
 * - qBittorrent: WebUI v2 API 客户端（登录 / 添加磁力 / 添加 RSS 源 / 测试连接）
 *
 * qBittorrent 配置存储于 userData/qb-config.json，本地不上传。
 */

import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createServer } from 'http'

// ==== AnimeGarden API ====
const AG_API = 'https://api.animes.garden'

export interface AGResource {
  id: number
  provider: string
  providerId: string
  title: string
  href: string
  type: string
  magnet: string
  size: number // 单位 KB
  fansub?: { id: number; name: string; avatar?: string | null } | null
  publisher?: { id: number; name: string; avatar?: string | null } | null
  subjectId?: number | null
  createdAt: string
  fetchedAt: string
}

export interface AGSearchParams {
  search?: string // 主搜索词（模糊匹配，多词空格 = AND）
  include?: string[] // 必须包含
  keywords?: string[] // 关键词
  exclude?: string[] // 排除
  type?: string // 类型，如 "动画" / "合集"
  provider?: string // dmhy / mikan / moe / ani
  fansubId?: number // 客户端过滤字幕组 ID（镜像站服务端 fansub 参数不生效）
  page?: number
  pageSize?: number
}

/** 带重试的 fetch（AnimeGarden 站点网络不稳定，失败自动重试） */
async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let lastErr: any
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, init)
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise((r) => setTimeout(r, 600 * (i + 1)))
    }
  }
  throw lastErr
}

export async function searchAnimeGarden(
  params: AGSearchParams,
): Promise<{ ok: true; resources: AGResource[]; complete: boolean } | { ok: false; error: string }> {
  try {
    const qs = new URLSearchParams()
    if (params.search) qs.set('search', params.search)
    if (params.type) qs.set('type', params.type)
    if (params.provider) qs.set('provider', params.provider)
    qs.set('page', String(params.page || 1))
    qs.set('pageSize', String(params.pageSize || 30))

    const resp = await fetchWithRetry(`${AG_API}/resources?${qs}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) return { ok: false, error: `AnimeGarden API 错误 HTTP ${resp.status}` }
    const data = await resp.json()
    let resources: AGResource[] = data?.resources || []
    // 镜像站服务端不支持 fansub/include 过滤，这里客户端过滤（数据字段可靠）
    if (params.fansubId) resources = resources.filter((r) => r.fansub?.id === params.fansubId)
    return {
      ok: true,
      resources,
      complete: !!data?.complete,
    }
  } catch (e: any) {
    return { ok: false, error: describeFetchError(e) }
  }
}

export interface AGTeam {
  id: number
  name: string
  avatar?: string | null
  providers?: Record<string, { providerId?: string; avatar?: string | null }>
}

/** 字幕组列表缓存：内存 1h TTL + 磁盘持久化兜底（24h 在线刷新，30 天离线回退） */
let teamsCache: { data: AGTeam[]; ts: number } | null = null
const TEAMS_TTL = 60 * 60 * 1000 // 内存缓存 1h
const TEAMS_DISK_TTL = 24 * 60 * 60 * 1000 // 磁盘缓存 24h 内优先用
const TEAMS_DISK_FALLBACK_TTL = 30 * 24 * 60 * 60 * 1000 // 磁盘缓存 30 天内做离线兜底
function teamsCachePath(): string {
  return join(app.getPath('userData'), 'teams-cache.json')
}

function loadTeamsDisk(): { teams: AGTeam[]; ts: number } | null {
  try {
    if (existsSync(teamsCachePath())) {
      const raw = JSON.parse(readFileSync(teamsCachePath(), 'utf-8'))
      if (Array.isArray(raw?.teams) && raw.teams.length) {
        return { teams: raw.teams, ts: raw.ts || 0 }
      }
    }
  } catch {}
  return null
}

function saveTeamsDisk(teams: AGTeam[]) {
  try {
    writeFileSync(teamsCachePath(), JSON.stringify({ ts: Date.now(), teams }, null, 1), 'utf-8')
  } catch {}
}

/** 把 undici 的 "fetch failed" 转成可读中文错误（含底层原因码） */
function describeFetchError(e: any): string {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return '请求超时，请检查网络'
  const code = e?.cause?.code || e?.cause?.cause?.code
  if (code) {
    const map: Record<string, string> = {
      ENOTFOUND: '无法解析域名，请检查网络/DNS',
      ECONNREFUSED: '连接被拒绝',
      ECONNRESET: '连接被重置（站点可能不稳定）',
      ETIMEDOUT: '连接超时',
      CERT_HAS_EXPIRED: 'SSL 证书过期',
      'UND_ERR_CONNECT_TIMEOUT': '连接超时',
    }
    return `网络错误（${map[code] || code}）`
  }
  return e?.message && e.message !== 'fetch failed' ? e.message : '网络错误，请稍后重试'
}

/**
 * 获取全部字幕组列表（GET /teams）
 * 缓存优先级：内存(1h) → 磁盘(24h 在线/30 天离线兜底) → 在线请求
 */
export async function listTeams(
  force = false,
): Promise<{ ok: true; teams: AGTeam[]; stale?: boolean } | { ok: false; error: string }> {
  try {
    // 内存缓存
    if (!force && teamsCache && Date.now() - teamsCache.ts < TEAMS_TTL) {
      return { ok: true, teams: teamsCache.data }
    }
    // 磁盘缓存（24h 内直接用，避免频繁请求不稳定的 /teams）
    const disk = loadTeamsDisk()
    const diskAge = disk ? Date.now() - disk.ts : Infinity
    if (!force && disk && diskAge < TEAMS_DISK_TTL) {
      teamsCache = { data: disk.teams, ts: Date.now() }
      return { ok: true, teams: disk.teams, stale: true }
    }

    const resp = await fetchWithRetry(`${AG_API}/teams`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) {
      // 在线失败，回退磁盘缓存（30 天内）
      if (disk && diskAge < TEAMS_DISK_FALLBACK_TTL) {
        teamsCache = { data: disk.teams, ts: Date.now() }
        return { ok: true, teams: disk.teams, stale: true }
      }
      return { ok: false, error: `AnimeGarden API 错误 HTTP ${resp.status}` }
    }
    const data = await resp.json()
    const teams: AGTeam[] = data?.teams || []
    if (teams.length) {
      teamsCache = { data: teams, ts: Date.now() }
      saveTeamsDisk(teams)
      return { ok: true, teams }
    }
    // 返回空列表：回退磁盘
    if (disk) {
      teamsCache = { data: disk.teams, ts: Date.now() }
      return { ok: true, teams: disk.teams, stale: true }
    }
    return { ok: false, error: '字幕组列表为空' }
  } catch (e: any) {
    // 网络失败：内存 → 磁盘（30 天内）逐级回退
    if (teamsCache) return { ok: true, teams: teamsCache.data, stale: true }
    const disk = loadTeamsDisk()
    if (disk && Date.now() - disk.ts < TEAMS_DISK_FALLBACK_TTL) {
      teamsCache = { data: disk.teams, ts: Date.now() }
      return { ok: true, teams: disk.teams, stale: true }
    }
    return { ok: false, error: describeFetchError(e) }
  }
}

// ==== 本地 RSS 代理 ====
// 镜像站 feed.xml 的 filter 参数不生效，这里由 AniBox 起本地 HTTP 服务，
// 收到 qBittorrent 拉取请求时实时调 /resources API（search 生效），
// 再在客户端按字幕组过滤，生成标准 RSS 2.0 返回。
const RSS_PORT = 5860
function rssFeedsPath(): string {
  return join(app.getPath('userData'), 'rss-feeds.json')
}
const RSS_BASE = `http://127.0.0.1:${RSS_PORT}`

export interface RssFeedConfig {
  id: string
  name: string
  search?: string
  include?: string[]
  fansubId?: number
  fansubName?: string
  type?: string
  createdAt: number
}

let rssFeeds: RssFeedConfig[] = []
let rssServer: ReturnType<typeof createServer> | null = null

function loadRssFeeds() {
  try {
    if (existsSync(rssFeedsPath())) {
      rssFeeds = JSON.parse(readFileSync(rssFeedsPath(), 'utf-8')) || []
    }
  } catch {
    rssFeeds = []
  }
}

function saveRssFeeds() {
  try {
    writeFileSync(rssFeedsPath(), JSON.stringify(rssFeeds, null, 2), 'utf-8')
  } catch {
    /* 忽略 */
  }
}

/** 创建一条本地 RSS 订阅，返回可粘贴到 qBittorrent 的 URL */
export function createRssFeed(cfg: {
  name: string
  search?: string
  include?: string[]
  fansubId?: number
  fansubName?: string
  type?: string
}): { ok: true; url: string; id: string } {
  const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  rssFeeds.push({ id, ...cfg, createdAt: Date.now() })
  saveRssFeeds()
  return { ok: true, url: `${RSS_BASE}/rss/${id}`, id }
}

export function listRssFeeds(): RssFeedConfig[] {
  return rssFeeds.map((f) => ({ ...f }))
}

export function deleteRssFeed(id: string) {
  rssFeeds = rssFeeds.filter((f) => f.id !== id)
  saveRssFeeds()
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function generateRssXml(feed: RssFeedConfig): Promise<string> {
  const r = await searchAnimeGarden({
    search: feed.search,
    type: feed.type || '动画',
    fansubId: feed.fansubId,
    pageSize: 100,
  })
  const resources = r.ok ? r.resources : []
  const items = resources
    .map((res) => {
      const pub = new Date(res.createdAt).toUTCString()
      return `  <item>
    <title>${xmlEscape(res.title)}</title>
    <link>${xmlEscape(res.href)}</link>
    <guid isPermaLink="false">${xmlEscape(res.provider)}-${xmlEscape(res.providerId)}</guid>
    <pubDate>${pub}</pubDate>
    <enclosure url="${xmlEscape(res.magnet)}" type="application/x-bittorrent" length="0"/>
  </item>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(feed.name)}</title>
    <link>${RSS_BASE}/rss/${feed.id}</link>
    <description>AnimeGarden resource feed via AniBox${feed.fansubName ? ` (${xmlEscape(feed.fansubName)})` : ''}</description>
    <item>PLACEHOLDER</item>
  </channel>
</rss>`.replace('<item>PLACEHOLDER</item>', items || '')
}

/** 启动本地 RSS 代理（app ready 后调用一次） */
export function startRssServer() {
  loadRssFeeds()
  if (rssServer) return
  rssServer = createServer(async (req, res) => {
    try {
      const m = req.url?.match(/^\/rss\/([A-Za-z0-9]+)$/)
      if (!m) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
      }
      const feed = rssFeeds.find((f) => f.id === m[1])
      if (!feed) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not Found')
        return
      }
      const xml = await generateRssXml(feed)
      res.writeHead(200, {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'no-cache',
      })
      res.end(xml)
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Error: ' + (e.message || 'unknown'))
    }
  })
  rssServer.on('error', (e: any) => {
    console.error('[AniBox] RSS proxy error:', e.message)
  })
  rssServer.listen(RSS_PORT, '127.0.0.1', () => {
    console.log(`[AniBox] RSS proxy listening on ${RSS_BASE}`)
  })
}

/** 格式化大小（KB → 可读） */
export function formatSize(kb: number): string {
  if (!kb || kb <= 0) return '未知'
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)} GB`
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}

// ==== qBittorrent WebUI v2 ====
function qbConfigPath(): string {
  return join(app.getPath('userData'), 'qb-config.json')
}

export interface QbConfig {
  host: string // 如 127.0.0.1
  port: number // 默认 8080
  username: string // 默认 admin
  password: string
  savepath?: string // 可选默认保存路径
}

function loadQbConfig(): QbConfig | null {
  try {
    if (existsSync(qbConfigPath())) {
      const raw = readFileSync(qbConfigPath(), 'utf-8')
      const cfg = JSON.parse(raw)
      if (cfg.host) return { host: cfg.host, port: cfg.port || 8080, username: cfg.username || 'admin', password: cfg.password || '', savepath: cfg.savepath || '' }
    }
  } catch {
    /* 配置损坏时按未配置处理 */
  }
  return null
}

function saveQbConfig(cfg: QbConfig) {
  try {
    writeFileSync(qbConfigPath(), JSON.stringify(cfg), 'utf-8')
  } catch {
    /* 写失败忽略 */
  }
}

export function getQbConfig(): QbConfig | null {
  const c = loadQbConfig()
  if (!c) return null
  return { ...c, password: c.password ? '********' : '' }
}

export function setQbConfig(cfg: QbConfig) {
  // 密码留空时保留旧密码（渲染进程 getConfig 会打码，避免覆盖）
  const existing = loadQbConfig()
  if (!cfg.password && existing?.password) cfg.password = existing.password
  saveQbConfig(cfg)
}

let sidCookie = ''

function qbBase(cfg: QbConfig): string {
  return `http://${cfg.host}:${cfg.port}`
}

async function qbLogin(cfg: QbConfig): Promise<void> {
  const resp = await fetch(`${qbBase(cfg)}/api/v2/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${qbBase(cfg)}/`, // qBittorrent WebUI 默认开启 CSRF 保护，需带 Referer
    },
    body: new URLSearchParams({ username: cfg.username, password: cfg.password }).toString(),
    signal: AbortSignal.timeout(8000),
  })
  const text = await resp.text().catch(() => '')
  // 5.x 无认证模式：login 返回 HTTP 204 空响应；4.x/5.x 带认证：返回 "Ok."
  if (resp.status === 204 || text === 'Ok.') {
    const setCookie = resp.headers.get('set-cookie') || ''
    const m = setCookie.match(/SID=([^;]+)/)
    sidCookie = m ? `SID=${m[1]}` : ''
    return
  }
  if (!resp.ok || text === 'Fails.') {
    throw new Error('qBittorrent 登录失败：用户名或密码错误')
  }
  throw new Error(`qBittorrent 登录失败 (HTTP ${resp.status})`)
}

async function qbRequest(cfg: QbConfig, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (sidCookie) headers.set('Cookie', sidCookie)
  if (!headers.has('Referer')) headers.set('Referer', `${qbBase(cfg)}/`)
  return fetch(`${qbBase(cfg)}${path}`, { ...init, headers, signal: AbortSignal.timeout(10000) })
}

export async function qbTestConnection(cfg: QbConfig): Promise<{ ok: boolean; message: string; version?: string }> {
  try {
    // 密码留空时用已保存的密码测试
    if (!cfg.password) {
      const saved = loadQbConfig()
      if (saved?.password) cfg.password = saved.password
    }
    await qbLogin(cfg)
    const resp = await qbRequest(cfg, '/api/v2/app/version')
    if (resp.ok) {
      const version = (await resp.text()).trim()
      return { ok: true, message: '连接成功', version }
    }
    return { ok: false, message: `连接失败 (HTTP ${resp.status})` }
  } catch (e: any) {
    return { ok: false, message: e.message || '连接失败' }
  }
}

export async function qbAddTorrent(
  magnet: string,
  savepath?: string,
): Promise<{ ok: boolean; message: string }> {
  const cfg = loadQbConfig()
  if (!cfg) return { ok: false, message: '未配置 qBittorrent，请先在设置中配置' }
  try {
    await qbLogin(cfg)
    const body = new URLSearchParams({ urls: magnet })
    const sp = savepath || cfg.savepath
    if (sp) body.set('savepath', sp)
    const resp = await qbRequest(cfg, '/api/v2/torrents/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const text = await resp.text().catch(() => '')
    if (resp.ok && (text === 'Ok.' || text === '')) return { ok: true, message: '已添加到 qBittorrent' }
    if (text === 'Fails.') return { ok: false, message: '添加失败：URL 无效或已存在' }
    return { ok: false, message: `添加失败: ${text || resp.status}` }
  } catch (e: any) {
    return { ok: false, message: e.message || '添加失败' }
  }
}

export async function qbAddRssFeed(
  feedUrl: string,
  path?: string,
): Promise<{ ok: boolean; message: string; path?: string }> {
  const cfg = loadQbConfig()
  if (!cfg) return { ok: false, message: '未配置 qBittorrent，请先在设置中配置' }
  try {
    await qbLogin(cfg)
    // 版本差异：4.x 要求 path 必填（根目录 "/" 可用）；
    // 5.x 要求 path 为"唯一的节点路径"，传已存在的 "/" 会报 409 "路径已存在"
    let feedPath = path || '/'
    try {
      const verResp = await qbRequest(cfg, '/api/v2/app/version')
      const ver = (await verResp.text()).trim()
      const major = parseInt(ver.replace(/^v/i, '').split('.')[0]) || 4
      if (major >= 5) {
        feedPath = path && path !== '/' ? path : `/AniBox-${Date.now().toString(36)}`
      }
    } catch {
      /* 查版本失败按 4.x 处理 */
    }
    const body = new URLSearchParams({ url: feedUrl })
    body.set('path', feedPath)
    const resp = await qbRequest(cfg, '/api/v2/rss/addFeed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const text = await resp.text().catch(() => '')
    if (resp.ok && (text === 'Ok.' || text === '')) return { ok: true, message: 'RSS 订阅已添加到 qBittorrent', path: feedPath }
    return { ok: false, message: `添加订阅失败: ${text || resp.status}` }
  } catch (e: any) {
    return { ok: false, message: e.message || '添加订阅失败' }
  }
}

/**
 * 确保 qBittorrent 全局 RSS 自动下载开关已打开。
 * 一键追番依赖两个全局偏好：拉取 RSS 源（rss_processing_enabled）
 * 与自动下载匹配资源（rss_auto_downloading_enabled）。若用户没在
 * qBittorrent 里手动打开后者，即使规则创建正确也不会自动下载。
 */
async function qbEnableRssAutoDownload(cfg: QbConfig): Promise<void> {
  try {
    const prefs = JSON.stringify({
      rss_processing_enabled: true,
      rss_auto_downloading_enabled: true,
    })
    await qbRequest(cfg, '/api/v2/app/setPreferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ json: prefs }).toString(),
    })
  } catch {
    /* 旧版本/改版可能不支持该偏好，忽略，不阻断后续流程 */
  }
}

/**
 * 创建 RSS 自动下载规则（ruleDef 参考 qBittorrent RSS Downloader）
 * 参数名兼容：官方版用 rule_name/rule_def，部分改版用 ruleName/ruleDef，两组都传
 */
export async function qbAddRssRule(
  ruleName: string,
  opts: { mustContain: string; savepath?: string; affectedFeeds?: string[]; addPaused?: boolean; useRegex?: boolean },
): Promise<{ ok: boolean; message: string }> {
  const cfg = loadQbConfig()
  if (!cfg) return { ok: false, message: '未配置 qBittorrent，请先在设置中配置' }
  try {
    await qbLogin(cfg)
    await qbEnableRssAutoDownload(cfg)
    const ruleDef = JSON.stringify({
      // qBittorrent 的 ruleDef 里 `enabled` 缺省为 false：不显式传 true，
      // 规则会被创建成「禁用」状态，导致订阅到新资源也不会自动下载。
      enabled: true,
      mustContain: opts.mustContain,
      mustNotContain: '',
      savePath: opts.savepath || '',
      addPaused: !!opts.addPaused,
      affectedFeeds: opts.affectedFeeds || [],
      useRegex: !!opts.useRegex,
    })
    const body = new URLSearchParams()
    // 两组参数名都传，qBittorrent 只取它认识的那组
    body.set('rule_name', ruleName)
    body.set('rule_def', ruleDef)
    body.set('ruleName', ruleName)
    body.set('ruleDef', ruleDef)
    const resp = await qbRequest(cfg, '/api/v2/rss/setRule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const text = await resp.text().catch(() => '')
    if (resp.ok && (text === 'Ok.' || text === '')) return { ok: true, message: `下载规则「${ruleName}」已创建` }
    return { ok: false, message: `创建规则失败: ${text || resp.status}` }
  } catch (e: any) {
    return { ok: false, message: e.message || '创建规则失败' }
  }
}

/** 删除 RSS 自动下载规则 */
export async function qbRemoveRssRule(ruleName: string): Promise<{ ok: boolean; message: string }> {
  const cfg = loadQbConfig()
  if (!cfg) return { ok: false, message: '未配置 qBittorrent，请先在设置中配置' }
  try {
    await qbLogin(cfg)
    const body = new URLSearchParams()
    body.set('rule_name', ruleName)
    body.set('ruleName', ruleName)
    const resp = await qbRequest(cfg, '/api/v2/rss/removeRule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const text = await resp.text().catch(() => '')
    if (resp.ok && (text === 'Ok.' || text === '')) return { ok: true, message: '规则已删除' }
    return { ok: false, message: `删除规则失败: ${text || resp.status}` }
  } catch (e: any) {
    return { ok: false, message: e.message || '删除规则失败' }
  }
}
