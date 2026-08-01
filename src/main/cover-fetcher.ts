import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, basename, dirname } from 'path'
import { get, request } from 'https'
import type { IncomingMessage } from 'http'
import { RequestOptions } from 'http'
import { VIDEO_EXTS, extractTitleFromFilename, extractRomajiFromFolder, levenshtein } from './utils'

const UA = 'AniBox/0.1 (https://github.com/anibox; local anime manager)'
const TIMEOUT = 15000

// ============================================================
//  HTTP 工具
// ============================================================

function fetchGet(url: string): Promise<{ status: number; data: string } | null> {
  return new Promise((resolve) => {
    const isHttp = url.startsWith('http://')
    const mod = isHttp ? require('http') : require('https')
    const req = mod.get(url, { headers: { 'User-Agent': UA }, timeout: TIMEOUT }, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        console.log('[AniBox] GET', res.statusCode, url.slice(0, 60))
        resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString('utf-8') })
      })
    })
    req.on('error', (e: any) => {
      console.error('[AniBox] GET failed:', url.slice(0, 80), e.message)
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      console.error('[AniBox] GET timeout:', url.slice(0, 80))
      resolve(null)
    })
  })
}

/** POST JSON 请求 */
function httpsPost(url: string, body: string): Promise<{ status: number; data: string } | null> {
  return new Promise((resolve) => {
    const options: RequestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': UA },
      timeout: TIMEOUT
    }
    const req = request(url, options, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        console.log('[AniBox] POST', res.statusCode, url.slice(0, 60))
        resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString('utf-8') })
      })
    })
    req.on('error', (e) => {
      console.error('[AniBox] POST failed:', url.slice(0, 80), e.message)
      resolve(null)
    })
    req.on('timeout', () => {
      req.destroy()
      console.error('[AniBox] POST timeout:', url.slice(0, 80))
      resolve(null)
    })
    req.write(body)
    req.end()
  })
}

async function fetchGetJson(url: string): Promise<any | null> {
  const res = await fetchGet(url)
  if (!res || res.status < 200 || res.status >= 300) return null
  try { return JSON.parse(res.data) } catch { return null }
}

async function httpsPostJson(url: string, body: string): Promise<any | null> {
  const res = await httpsPost(url, body)
  if (!res || res.status < 200 || res.status >= 300) return null
  try { return JSON.parse(res.data) } catch { return null }
}

/** 下载图片到本地 */
function downloadImage(url: string, savePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(url, { headers: { 'User-Agent': UA }, timeout: TIMEOUT }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) { resolve(false); return }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try {
          mkdirSync(dirname(savePath), { recursive: true })
          writeFileSync(savePath, Buffer.concat(chunks))
          resolve(true)
        } catch { resolve(false) }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

// ============================================================
//  通用工具
// ============================================================

function searchQueries(title: string): string[] {
  const qs = [
    title,
    title.replace(/\s*第[一二三四五六七八九十\d]+\s*季?\s*$/, '').trim(),
    title.replace(/\s*Season\s*\d+\s*$/i, '').trim(),
    title.replace(/\s*S\d+\s*$/i, '').trim(),
  ]

  // 额外：提取英文/数字部分（去掉中日文字符）
  const asciiOnly = title.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, '').trim()
  if (asciiOnly.length >= 3) {
    qs.push(asciiOnly)
  }

  return [...new Set(qs.filter(q => q.length >= 2))]
}

function bestMatch(
  query: string,
  candidates: Array<{ names: string[]; coverUrl: string }>
): { coverUrl: string } | null {
  const q = query.toLowerCase()

  // 检测查询中的季号
  const qSeason = q.match(/第([一二三四五六七八九十\d]+)季|Season\s*(\d+)|S(\d+)/i)
  const qSeasonNum = qSeason
    ? (() => {
        const cnMap: Record<string, number> = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
        if (qSeason[1]) return cnMap[qSeason[1]] || parseInt(qSeason[1])
        if (qSeason[2]) return parseInt(qSeason[2])
        if (qSeason[3]) return parseInt(qSeason[3])
        return 0
      })()
    : 0

  let best: typeof candidates[0] | null = null
  let bestScore = Infinity

  for (const c of candidates) {
    for (const name of c.names) {
      const n = name.toLowerCase()
      if (n.includes(q) || q.includes(n)) return c
      const dist = levenshtein(q, n)
      let score = dist / Math.max(q.length, n.length)

      // 如果查询包含季号，检查候选是否也包含相同季号
      if (qSeasonNum > 0) {
        const cSeason = n.match(/第([一二三四五六七八九十\d]+)季|Season\s*(\d+)|(?:\b|_)(\d+)(?:st|nd|rd|th)\s*Season|S(\d+)/i)
        const cSeasonNum = cSeason
          ? (() => {
              const cnMap: Record<string, number> = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
              if (cSeason[1]) return cnMap[cSeason[1]] || parseInt(cSeason[1])
              if (cSeason[2]) return parseInt(cSeason[2])
              if (cSeason[3]) return parseInt(cSeason[3])
              if (cSeason[4]) return parseInt(cSeason[4])
              return 0
            })()
          : 0
        // 季号不匹配的候选惩罚（降低优先级）
        if (cSeasonNum > 0 && cSeasonNum !== qSeasonNum) {
          score += 0.3
        }
        // 季号匹配的候选奖励
        if (cSeasonNum === qSeasonNum) {
          score -= 0.15
        }
      }

      if (score < bestScore) { bestScore = score; best = c }
    }
  }
  return bestScore < 0.5 ? best : (candidates[0] || null)
}

// ============================================================
//  Provider 1: AniList (GraphQL)
// ============================================================

async function searchAniList(query: string): Promise<Array<{ names: string[]; coverUrl: string }>> {
  try {
    const gql = JSON.stringify({
      query: `query($s:String){Page(perPage:5){media(search:$s,type:ANIME,format_not:MUSIC){id title{romaji english native}coverImage{large}}}}`,
      variables: { s: query }
    })
    const json = await httpsPostJson('https://graphql.anilist.co', gql)
    const media = json?.data?.Page?.media
    console.log('[AniList] results:', media?.length || 0)
    if (!media?.length) return []
    return media
      .filter((m: any) => m.coverImage?.large)
      .map((m: any) => ({
        names: [m.title.romaji, m.title.english, m.title.native].filter(Boolean),
        coverUrl: m.coverImage.large
      }))
  } catch (e: any) {
    console.error('[AniBox] AniList error:', e.message)
    return []
  }
}

async function fetchAniList(query: string): Promise<string | null> {
  const items = await searchAniList(query)
  if (!items.length) return null
  const match = bestMatch(query, items)
  console.log('[AniList] bestMatch:', match ? items[0].names[0] : 'null', '| cover:', match?.coverUrl ? 'OK' : 'NO')
  return match?.coverUrl || null
}

// ============================================================
//  Provider 2: Jikan (MyAnimeList v4)
// ============================================================

async function searchJikan(query: string): Promise<Array<{ names: string[]; coverUrl: string }>> {
  try {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5&sfw=true`
    const json = await fetchGetJson(url)
    if (!json?.data?.length) return []
    return json.data
      .filter((e: any) => e.images?.jpg?.large_image_url)
      .map((e: any) => ({
        names: [e.title, e.title_english, e.title_japanese].filter(Boolean),
        coverUrl: e.images.jpg.large_image_url
      }))
  } catch (e: any) {
    console.error('[AniBox] Jikan error:', e.message)
    return []
  }
}

async function fetchJikan(query: string): Promise<string | null> {
  const items = await searchJikan(query)
  if (!items.length) return null
  const match = bestMatch(query, items)
  if (match) console.log('[Jikan] matched ->', items[0].names[0])
  return match?.coverUrl || null
}

// ============================================================
//  Provider 3: Bangumi
// ============================================================

async function searchBangumi(query: string): Promise<Array<{ id: number; names: string[]; coverUrl: string }>> {
  try {
    const url = `http://api.bgm.tv/search/subject/${encodeURIComponent(query)}?type=2&responseGroup=small&max_results=5`
    const json = await fetchGetJson(url)
    if (!json?.list?.length) return []
    return json.list.map((s: any) => ({
      id: s.id,
      names: [s.name_cn, s.name].filter(Boolean),
      coverUrl: ''
    }))
  } catch (e: any) {
    console.error('[AniBox] Bangumi error:', e.message)
    return []
  }
}

async function getBangumiDetail(id: number): Promise<string | null> {
  const url = `http://api.bgm.tv/subject/${id}?responseGroup=large`
  const json = await fetchGetJson(url)
  return json?.images?.large || json?.images?.common || null
}

async function fetchBangumi(query: string): Promise<string | null> {
  const items = await searchBangumi(query)
  if (!items.length) return null
  const match = bestMatch(query, items.map(s => ({ names: s.names, coverUrl: s.coverUrl })))
  if (!match) return null
  const coverUrl = await getBangumiDetail(items[0].id)
  if (coverUrl) console.log('[Bangumi] matched -> cover found')
  return coverUrl || null
}

// ============================================================
//  对外接口
// ============================================================

const PROVIDERS: Array<{ name: string; fetch: (q: string) => Promise<string | null> }> = [
  { name: 'AniList', fetch: fetchAniList },
  { name: 'Jikan', fetch: fetchJikan },
  { name: 'Bangumi', fetch: fetchBangumi },
]

export interface CoverProgress {
  current: number
  total: number
  title: string
  ok: boolean
  status: string
}

export async function fetchCoverForSeries(
  title: string, folderPath: string,
  onStatus?: (status: string) => void
): Promise<string | null> {
  const aniboxDir = join(folderPath, '.anibox')
  const coverPath = join(aniboxDir, 'cover.jpg')
  if (existsSync(coverPath)) {
    onStatus?.('已有封面，跳过')
    return coverPath
  }

  const queries = searchQueries(title)

  // 从视频文件名中提取 romaji 标题，优先搜索
  const romajiTitles = extractRomajiFromFolder(folderPath)
  if (romajiTitles.length > 0) {
    console.log('[AniBox] Romaji from files:', romajiTitles.join(', '))
    queries.unshift(...romajiTitles)
  }

  // 检测标题是否包含季号信息
  const hasSeason = /第[一二三四五六七八九十\d]+季|Season\s*\d+|S\d+/i.test(title)

  // 如果有季号：先尝试含季号的查询，全部失败后再尝试去除季号的查询
  const seasonQueries = hasSeason
    ? queries.filter(q => /第[一二三四五六七八九十\d]+季|Season\s*\d+|S\d+/i.test(q))
    : queries
  const strippedQueries = hasSeason
    ? queries.filter(q => !seasonQueries.includes(q) && !romajiTitles.includes(q))
    : []

  // 合并：先季号查询，再 romaji，最后去季号查询
  const orderedQueries = hasSeason
    ? [...seasonQueries, ...strippedQueries]
    : queries

  for (let qi = 0; qi < Math.min(orderedQueries.length, 5); qi++) {
    const query = orderedQueries[qi]
    for (const provider of PROVIDERS) {
      console.log('[AniBox] Trying', provider.name, `query="${query}"`)
      onStatus?.(`搜索 ${provider.name}...`)
      const coverUrl = await provider.fetch(query)
      if (!coverUrl) continue

      onStatus?.('下载封面中...')
      const ok = await downloadImage(coverUrl, coverPath)
      if (ok) {
        console.log('[AniBox] Cover saved OK')
        return coverPath
      }
      console.error('[AniBox] Cover download failed')
    }
  }

  console.log('[AniBox] Cover not found (all providers exhausted)')
  return null
}

/**
 * 手动搜索封面（用户自行输入英文/romaji 名，仅用 AniList）
 */
export async function fetchCoverManual(folderPath: string, searchQuery: string): Promise<string | null> {
  const aniboxDir = join(folderPath, '.anibox')
  const coverPath = join(aniboxDir, 'cover.jpg')
  if (existsSync(coverPath)) return coverPath

  console.log('[AniBox] Manual search:', searchQuery)
  const coverUrl = await fetchAniList(searchQuery)
  if (!coverUrl) return null

  const ok = await downloadImage(coverUrl, coverPath)
  return ok ? coverPath : null
}
export async function fetchCoversBatch(
  series: Array<{ title: string; folderPath: string }>,
  onProgress?: (current: number, total: number, title: string, ok: boolean, status: string) => void
): Promise<{ total: number; fetched: number; failed: number }> {
  let fetched = 0
  let failed = 0

  for (let i = 0; i < series.length; i++) {
    const s = series[i]
    onProgress?.(i + 1, series.length, s.title, false, '准备中...')

    const result = await fetchCoverForSeries(s.title, s.folderPath, (status) => {
      onProgress?.(i + 1, series.length, s.title, false, status)
    })

    if (result) {
      fetched++
      onProgress?.(i + 1, series.length, s.title, true, '已获取')
    } else {
      failed++
      onProgress?.(i + 1, series.length, s.title, false, '未找到')
    }

    if (i < series.length - 1) {
      await new Promise(r => setTimeout(r, 1500))
    }
  }

  return { total: series.length, fetched, failed }
}
