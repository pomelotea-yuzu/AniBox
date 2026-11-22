/**
 * cover-yuc.ts — 从 yuc.wiki（長門番堂）季度新番表抓取封面（带本地持久化缓存）
 *
 * 原理：yuc.wiki 每季度一页（/YYYYMM/），全量列出该季番剧的
 * 中文标题 + B 站 CDN 封面（i0.hdslb.com）。
 * 匹配链：本地索引的放送日期 → 推算季度页 → 页内按中文标题/别名匹配 → 下载。
 *
 * 持久化（userData/yuc-covers/）：
 *   pages/<YYYYMM>.json  季度页解析结果（条目 + 抓取时间），断网/重启可复用
 *   img/<hash>.<ext>     封面图片本体，按需下载，供 anibox://cover?path= 直接渲染
 * 图片走本地协议同时规避 i0.hdslb.com 的 Referer 防盗链。
 *
 * 注意：yuc.wiki 的 HTTPS 证书已过期，走 HTTP 明文（仅抓标题/封面 URL，无敏感数据）。
 */
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  statSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
} from 'fs'
import { join, dirname, extname } from 'path'
import { createHash } from 'crypto'
import { normTitle } from './bangumi-index'
import { levenshtein } from './utils'
import type { LocalIndexHit } from './bangumi-index'

const YUC_BASE = 'http://yuc.wiki'
const YUC_UA = 'AniBox/1.2 (local anime manager; cover lookup)'
const TIMEOUT_MS = 12000

/** 当前季度页 12h 后刷新（番表会追加），历史季度页 30 天 */
const PAGE_TTL_CURRENT_MS = 12 * 60 * 60 * 1000
const PAGE_TTL_OLD_MS = 30 * 24 * 60 * 60 * 1000
/** 图片缓存上限，超出按修改时间淘汰最旧的 */
const MAX_CACHE_BYTES = 200 * 1024 * 1024
const PRUNE_EVERY = 10

export interface YucEntry {
  title: string
  coverUrl: string
  /** 已落盘的图片文件名（相对 img/），未下载为 undefined */
  local?: string
}

interface PageCacheFile {
  page: string
  fetchedAt: number
  entries: YucEntry[]
}

// 页面缓存（一个运行期内不重复抓同一季度页；null = 抓过但失败/为空）
const pageCache = new Map<string, YucEntry[] | null>()
let coverDirOverride: string | null = null
let downloadsSincePrune = 0

/** 测试 / 开发期可重定向缓存目录 */
export function setCoverDir(dir: string | null): void {
  coverDirOverride = dir
}

/** 真实缓存目录（异步：需要 electron app.getPath('userData')） */
export async function resolveCoverDir(): Promise<string> {
  if (coverDirOverride) return coverDirOverride
  try {
    const electron: any = await import('electron')
    const app = electron?.app || electron?.default?.app
    if (app && typeof app.getPath === 'function') {
      return join(app.getPath('userData'), 'yuc-covers')
    }
  } catch {
    /* 非 Electron 环境（vitest 等） */
  }
  return join(process.cwd(), 'yuc-covers')
}

function imgDirOf(dir: string): string {
  return join(dir, 'img')
}

function pageFileOf(dir: string, page: string): string {
  return join(dir, 'pages', `${page}.json`)
}

/** 封面 URL → 稳定文件名（md5 前 16 位 + 原扩展名） */
export function coverFileName(url: string): string {
  const ext = (extname(url.split('?')[0]) || '').toLowerCase()
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg'
  return createHash('md5').update(url).digest('hex').slice(0, 16) + safeExt
}

/** 当前季度页（YYYYMM），用于区分 TTL */
function currentPageKey(): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) * 3 + 1
  return `${now.getFullYear()}${String(q).padStart(2, '0')}`
}

function ttlFor(page: string): number {
  return page === currentPageKey() ? PAGE_TTL_CURRENT_MS : PAGE_TTL_OLD_MS
}

/** 放送日期 "2023-09-29" → 候选季度页 ["202307","202310"]（季末放送的可能排在下一季表） */
export function seasonPageCandidates(date: string): string[] {
  const y = parseInt(date?.slice(0, 4), 10)
  const m = parseInt(date?.slice(5, 7), 10)
  if (!y || !m) return []
  const quarterOf = (mm: number) => (mm <= 3 ? 1 : mm <= 6 ? 4 : mm <= 9 ? 7 : 10)
  const q1 = quarterOf(m)
  const pages = [`${y}${String(q1).padStart(2, '0')}`]
  // 边界月（3/6/9/12 放送）番剧常列入下一季表
  if (m === 3 || m === 6 || m === 9 || m === 12) {
    const nextY = q1 === 10 ? y + 1 : y
    const nextQ = q1 === 10 ? 1 : q1 + 3
    pages.push(`${nextY}${String(nextQ).padStart(2, '0')}`)
  }
  return pages
}

/** 解析季度页 HTML → 条目数组（封面 data-src + date_title_ 标题成对） */
export function parseYucSeason(html: string): YucEntry[] {
  const entries: YucEntry[] = []
  const seen = new Set<string>()
  const titleRe = /class="date_title_?"[^>]*>([\s\S]*?)<\/td>/g
  const imgRe = /<img[^>]*data-src="(https?:\/\/i\d\.hdslb\.com[^"]+)"[^>]*>/g

  let m: RegExpExecArray | null
  while ((m = titleRe.exec(html)) !== null) {
    // 向前找最近的封面 img（2.5KB 窗口内）
    const windowStart = Math.max(0, m.index - 2500)
    const window = html.slice(windowStart, m.index)
    let coverUrl = ''
    let im: RegExpExecArray | null
    imgRe.lastIndex = 0
    while ((im = imgRe.exec(window)) !== null) coverUrl = im[1]
    if (!coverUrl) continue

    // 标题清洗：去标签（含 <br>）、解实体
    const title = m[1]
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, '')
      .trim()
    if (!title || seen.has(title)) continue
    seen.add(title)
    entries.push({ title, coverUrl })
  }
  return entries
}

// ============================================================
//  磁盘缓存
// ============================================================

function readPageCache(dir: string, page: string): PageCacheFile | null {
  try {
    const p = pageFileOf(dir, page)
    if (!existsSync(p)) return null
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as PageCacheFile
    if (!parsed?.entries?.length) return null
    return parsed
  } catch {
    return null
  }
}

function writePageCache(dir: string, page: string, entries: YucEntry[]): void {
  try {
    const p = pageFileOf(dir, page)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify({ page, fetchedAt: Date.now(), entries }), 'utf-8')
  } catch (err: any) {
    console.warn('[AniBox] yuc 页缓存写入失败:', err?.message || err)
  }
}

/** 缓存目录超过上限时，按修改时间淘汰最旧的图片（留 90% 水位） */
export function pruneYucCache(dir: string, maxBytes = MAX_CACHE_BYTES): number {
  try {
    const idir = imgDirOf(dir)
    if (!existsSync(idir)) return 0
    const files = readdirSync(idir)
      .map((f) => {
        const p = join(idir, f)
        try {
          const st = statSync(p)
          return { p, size: st.size, mtime: st.mtimeMs }
        } catch {
          return null
        }
      })
      .filter((x): x is { p: string; size: number; mtime: number } => x !== null)
    const total = files.reduce((s, f) => s + f.size, 0)
    if (total <= maxBytes) return 0
    files.sort((a, b) => a.mtime - b.mtime)
    const target = maxBytes * 0.9
    let cur = total
    let removed = 0
    for (const f of files) {
      if (cur <= target) break
      try {
        unlinkSync(f.p)
        cur -= f.size
        removed++
      } catch {
        /* 占用中，跳过 */
      }
    }
    if (removed) console.log(`[AniBox] yuc 封面缓存清理: 删除 ${removed} 张`)
    return removed
  } catch (err: any) {
    console.warn('[AniBox] yuc 封面缓存清理失败:', err?.message || err)
    return 0
  }
}

/**
 * 下载封面到缓存目录。
 * @returns 成功返回文件名（相对 img/），失败返回 null
 */
export async function downloadYucImage(coverUrl: string, dir?: string): Promise<string | null> {
  const root = dir || (await resolveCoverDir())
  const file = coverFileName(coverUrl)
  const abs = join(imgDirOf(root), file)
  try {
    if (existsSync(abs) && statSync(abs).size > 0) return file
  } catch {
    /* stat 失败按未缓存处理 */
  }
  try {
    const res = await fetch(coverUrl, {
      headers: { 'User-Agent': YUC_UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || (buf[0] !== 0xff && buf[0] !== 0x89 && buf[0] !== 0x52)) {
      throw new Error('非图片内容') // jpg=ffd8 png=89 webp=RIFF
    }
    mkdirSync(imgDirOf(root), { recursive: true })
    writeFileSync(abs, buf)
    if (++downloadsSincePrune >= PRUNE_EVERY) {
      downloadsSincePrune = 0
      pruneYucCache(root)
    }
    return file
  } catch (err: any) {
    console.warn('[AniBox] yuc 封面下载失败:', err?.message || err)
    return null
  }
}

/** 确保条目图片已落盘，返回绝对路径（失败 null） */
export async function ensureLocalCover(entry: YucEntry, dir?: string): Promise<string | null> {
  const root = dir || (await resolveCoverDir())
  if (entry.local) {
    const abs = join(imgDirOf(root), entry.local)
    if (existsSync(abs) && statSync(abs).size > 0) return abs
  }
  const file = await downloadYucImage(entry.coverUrl, root)
  if (!file) return null
  entry.local = file // 回写，后续同运行期直接命中
  return join(imgDirOf(root), file)
}

/** 渲染端可用 URL：本地已缓存走 anibox:// 协议，否则热链 */
export async function coverUrlForRenderer(entry: YucEntry, dir?: string): Promise<string> {
  const local = await ensureLocalCover(entry, dir)
  return local ? aniboxCoverUrl(local) : entry.coverUrl
}

/** 本地绝对路径 → anibox:// 协议 URL（无 Referer，规避防盗链） */
export function aniboxCoverUrl(absPath: string): string {
  return `anibox://cover?path=${encodeURIComponent(absPath)}`
}

/** 后台批量预取图片（失败静默） */
export function prefetchYucImages(
  entries: YucEntry[],
  opts: { concurrency?: number; dir?: string } = {},
): void {
  const concurrency = opts.concurrency ?? 4
  let i = 0
  const worker = async (): Promise<void> => {
    while (i < entries.length) {
      const e = entries[i++]
      try {
        await downloadYucImage(e.coverUrl, opts.dir)
      } catch {
        /* 忽略 */
      }
    }
  }
  void Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker))
}

// ============================================================
//  季度页抓取
// ============================================================

async function refreshYucSeason(page: string, dir: string): Promise<YucEntry[] | null> {
  try {
    const res = await fetch(`${YUC_BASE}/${page}/`, {
      headers: { 'User-Agent': YUC_UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const fresh = parseYucSeason(await res.text())
    console.log(`[AniBox] yuc.wiki ${page}: ${fresh.length} 条`)
    if (!fresh.length) {
      pageCache.set(page, null)
      return null
    }
    // 合并已有缓存的 local 字段（已落盘的图片不重复下载）
    const prev = pageCache.get(page) || readPageCache(dir, page)?.entries
    if (prev?.length) {
      const byUrl = new Map(prev.filter((e) => e.local).map((e) => [e.coverUrl, e.local!]))
      for (const e of fresh) {
        const l = byUrl.get(e.coverUrl)
        if (l) e.local = l
      }
    }
    pageCache.set(page, fresh)
    writePageCache(dir, page, fresh)
    return fresh
  } catch (err: any) {
    console.warn(`[AniBox] yuc.wiki ${page} 抓取失败:`, err?.message || err)
    pageCache.set(page, null)
    return null
  }
}

/**
 * 取季度页条目：内存 → 磁盘（过期先用旧值 + 后台刷新）→ 网络。
 * 断网且有磁盘缓存时仍能返回旧数据，保证离线可用。
 */
export async function fetchYucSeason(
  page: string,
  opts: { offline?: boolean } = {},
): Promise<YucEntry[] | null> {
  if (pageCache.has(page)) return pageCache.get(page)!

  const dir = await resolveCoverDir()
  const disk = readPageCache(dir, page)
  if (disk) {
    pageCache.set(page, disk.entries)
    if (opts.offline || Date.now() - disk.fetchedAt < ttlFor(page)) return disk.entries
    // 过期：先返回旧值，后台刷新（失败不影响本次）
    void refreshYucSeason(page, dir)
    return disk.entries
  }
  if (opts.offline) return null
  return await refreshYucSeason(page, dir)
}

// ============================================================
//  匹配
// ============================================================

/**
 * 宽松归一化：在 normTitle 基础上抹掉季号/期号/Part/#话数段等非本质差异。
 * 例：「无职转生 第三季 ～到了异世界～」与「无职转生第3期#1~2」都能归到「无职转生」体系。
 */
function looseNorm(s: string): string {
  let t = normTitle(s)
  t = t.replace(/第[0-9一二三四五六七八九十百]+[季期部]/g, '')
  t = t.replace(/(part|season|cour)\d*/gi, '')
  t = t.replace(/#\d+[^#]*$/g, '')
  t = t.replace(/#?\d+~?\d*/g, '')
  return t.trim()
}

/** 在季度条目里匹配标题/别名（宽松精确 → 宽松包含 → Levenshtein 模糊） */
export function matchYucEntry(entries: YucEntry[], titles: string[]): YucEntry | null {
  const qs = [...new Set(titles.map((t) => looseNorm(t)).filter((t) => t.length >= 2))]
  const normed = entries.map((e) => ({ e, t: looseNorm(e.title) }))

  // 1) 宽松精确
  for (const q of qs) {
    for (const { e, t } of normed) {
      if (t && t === q) return e
    }
  }
  // 2) 宽松包含（>=3 字随意；二字别名/简称要求紧窗口 ≤ q+2，防深位置误配）
  for (const q of qs) {
    if (q.length < 2) continue
    for (const { e, t } of normed) {
      if (!t) continue
      if (t.includes(q) || q.includes(t)) {
        if (q.length === 2 && t.length > q.length + 2) continue
        return e
      }
    }
  }
  // 3) Levenshtein 模糊（长度差剪枝，阈值收紧防误配）
  let best: YucEntry | null = null
  let bestScore = Infinity
  for (const q of qs) {
    if (q.length < 4) continue
    for (const { e, t } of normed) {
      if (!t || Math.abs(t.length - q.length) > Math.max(t.length, q.length) * 0.5) continue
      const score = levenshtein(q, t) / Math.max(t.length, q.length)
      if (score < bestScore) {
        bestScore = score
        best = e
      }
    }
  }
  return best && bestScore < 0.35 ? best : null
}

// ============================================================
//  对外接口
// ============================================================

/**
 * 封面获取主入口：本地索引命中信息 + 目标路径 → 下载封面。
 * 优先复用 yuc-covers 缓存中的图片（同一张图跨库/重装不重复下载）。
 * @returns 成功返回 dest，失败返回 null
 */
export async function fetchYucCover(
  hit: LocalIndexHit,
  dest: string,
  onStatus?: (status: string) => void,
): Promise<string | null> {
  if (!hit.date) return null
  if (existsSync(dest)) return dest

  const pages = seasonPageCandidates(hit.date)
  if (!pages.length) return null

  // 匹配用标题：中文名 > 别名（yuc 网格标题为中文）
  const titles = [hit.titleCn, hit.title, ...hit.aliases].filter(Boolean)

  for (const page of pages) {
    onStatus?.(`匹配封面（yuc.wiki ${page}）...`)
    const entries = await fetchYucSeason(page)
    if (!entries?.length) continue
    const matched = matchYucEntry(entries, titles)
    if (!matched) continue

    try {
      onStatus?.('下载封面中...')
      const local = await ensureLocalCover(matched)
      if (local) {
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(local, dest)
        console.log(`[AniBox] yuc 封面已保存（缓存命中）: ${matched.title}`)
        return dest
      }
    } catch (err: any) {
      console.warn('[AniBox] yuc 本地封面复用失败:', err?.message || err)
    }

    try {
      const res = await fetch(matched.coverUrl, {
        headers: { 'User-Agent': YUC_UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (!buf.length || (buf[0] !== 0xff && buf[0] !== 0x89 && buf[0] !== 0x52)) {
        throw new Error('非图片内容') // jpg=ffd8 png=89 webp=RIFF
      }
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
      // 回写缓存，下次直接命中
      try {
        const root = await resolveCoverDir()
        mkdirSync(imgDirOf(root), { recursive: true })
        writeFileSync(join(imgDirOf(root), coverFileName(matched.coverUrl)), buf)
        matched.local = coverFileName(matched.coverUrl)
      } catch {
        /* 缓存回写失败不影响主流程 */
      }
      console.log(`[AniBox] yuc.wiki 封面已保存: ${matched.title} (${buf.length}B)`)
      return dest
    } catch (err: any) {
      console.warn('[AniBox] yuc.wiki 封面下载失败:', err?.message || err)
    }
  }
  return null
}

/** 缓存统计（设置页展示用） */
export async function getYucCacheStats(dir?: string): Promise<{
  dir: string
  images: number
  bytes: number
  pages: number
}> {
  const root = dir || (await resolveCoverDir())
  let images = 0
  let bytes = 0
  let pages = 0
  try {
    const idir = imgDirOf(root)
    if (existsSync(idir)) {
      for (const f of readdirSync(idir)) {
        try {
          const st = statSync(join(idir, f))
          images++
          bytes += st.size
        } catch {
          /* 忽略 */
        }
      }
    }
    const pdir = join(root, 'pages')
    if (existsSync(pdir)) {
      pages = readdirSync(pdir).filter((f) => f.endsWith('.json')).length
    }
  } catch {
    /* 目录不可读 */
  }
  return { dir: root, images, bytes, pages }
}

/** 清空封面缓存（页缓存 + 图片），并重置内存态 */
export async function clearYucCache(dir?: string): Promise<boolean> {
  const root = dir || (await resolveCoverDir())
  try {
    for (const sub of ['img', 'pages']) {
      const p = join(root, sub)
      if (!existsSync(p)) continue
      for (const f of readdirSync(p)) {
        try {
          unlinkSync(join(p, f))
        } catch {
          /* 占用中，跳过 */
        }
      }
    }
    pageCache.clear()
    console.log('[AniBox] yuc 封面缓存已清空')
    return true
  } catch (err: any) {
    console.warn('[AniBox] yuc 封面缓存清空失败:', err?.message || err)
    return false
  }
}

/** 测试用：清空内存页缓存 */
export function resetYucMemoryCache(): void {
  pageCache.clear()
}
