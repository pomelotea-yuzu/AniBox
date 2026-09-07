/**
 * cover-yuc.ts — 从 yuc.wiki（長門番堂）季度新番表抓取封面
 *
 * 原理：yuc.wiki 每季度一页（/YYYYMM/），全量列出该季番剧的
 * 中文标题 + B 站 CDN 封面（i0.hdslb.com，无防盗链）。
 * 匹配链：本地索引的放送日期 → 推算季度页 → 页内按中文标题/别名匹配 → 下载。
 *
 * 注意：yuc.wiki 的 HTTPS 证书已过期，走 HTTP 明文（仅抓标题/封面 URL，无敏感数据）。
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import { normTitle } from './bangumi-index'
import type { LocalIndexHit } from './bangumi-index'

const YUC_BASE = 'http://yuc.wiki'
const YUC_UA = 'AniBox/1.2 (local anime manager; cover lookup)'
const TIMEOUT_MS = 12000

export interface YucEntry {
  title: string
  coverUrl: string
}

// 页面缓存（一个运行期内不重复抓同一季度页；null = 抓过但失败/为空）
const pageCache = new Map<string, YucEntry[] | null>()

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

export async function fetchYucSeason(page: string): Promise<YucEntry[] | null> {
  if (pageCache.has(page)) return pageCache.get(page)!
  try {
    const res = await fetch(`${YUC_BASE}/${page}/`, {
      headers: { 'User-Agent': YUC_UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const entries = parseYucSeason(await res.text())
    console.log(`[AniBox] yuc.wiki ${page}: ${entries.length} 条`)
    pageCache.set(page, entries.length ? entries : null)
    return entries.length ? entries : null
  } catch (err: any) {
    console.warn(`[AniBox] yuc.wiki ${page} 抓取失败:`, err?.message || err)
    pageCache.set(page, null)
    return null
  }
}

/** 在季度条目里匹配标题/别名（精确 → 包含） */
export function matchYucEntry(entries: YucEntry[], titles: string[]): YucEntry | null {
  const qs = [...new Set(titles.map((t) => normTitle(t)).filter((t) => t.length >= 2))]
  for (const q of qs) {
    for (const e of entries) {
      if (normTitle(e.title) === q) return e
    }
  }
  for (const q of qs) {
    if (q.length < 4) continue
    for (const e of entries) {
      const t = normTitle(e.title)
      if (t.includes(q) || q.includes(t)) return e
    }
  }
  return null
}

/**
 * 封面获取主入口：本地索引命中信息 + 目标路径 → 下载封面。
 * @returns 成功返回 dest，失败返回 null
 */
export async function fetchYucCover(
  hit: LocalIndexHit,
  dest: string,
  onStatus?: (status: string) => void,
): Promise<string | null> {
  if (!hit.date || existsSync(dest)) return existsSync(dest) ? dest : null

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
      console.log(`[AniBox] yuc.wiki 封面已保存: ${matched.title} (${buf.length}B)`)
      return dest
    } catch (err: any) {
      console.warn('[AniBox] yuc.wiki 封面下载失败:', err?.message || err)
    }
  }
  return null
}
