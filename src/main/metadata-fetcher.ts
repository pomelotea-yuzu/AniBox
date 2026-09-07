import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, basename, dirname } from 'path'
import { get, request } from 'https'
import type { IncomingMessage } from 'http'
import { RequestOptions } from 'http'
import { VIDEO_EXTS, extractTitleFromFilename, extractRomajiFromFolder, levenshtein } from './utils'
import { translateLocal, translateSynopsisLocal, translateStaffRoles } from './anime-dict'
import { translateWithAI } from './ai-translate'
import { lookupLocalMetadata } from './bangumi-index'

const UA = 'AniBox/0.1 (https://github.com/anibox; local anime manager)'
const TIMEOUT = 15000

/** 计算文本中中文字符的占比 (0-1) */
function chineseRatio(text: string): number {
  if (!text) return 0
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return chineseChars / Math.max(text.length, 1)
}

// ============================================================
//  元数据接口
// ============================================================

export interface StaffInfo {
  role: string // 导演 / 原作 / 脚本 / 音乐 / 角色设计 等
  name: string
}

export interface AnimeMetadata {
  title: string // 原标题（romaji）
  titleCn: string // 中文标题
  titleEn: string // 英文标题
  synopsis: string // 简介
  rating: number // 评分 0-10
  genres: string[] // 类型标签
  year: number // 播出年份
  season: string // 播出季度 如 "Winter 2024"
  episodes: number // 总集数
  studio: string // 动画制作公司
  staff: StaffInfo[] // 主要 Staff
  coverUrl: string // 封面图 URL
  anilistId: number // AniList ID
  bangumiId: number // Bangumi ID
}

// ============================================================
//  HTTP 工具
// ============================================================

function fetchGet(url: string): Promise<{ status: number; data: string } | null> {
  return new Promise((resolve) => {
    const isHttp = url.startsWith('http://')
    const mod = isHttp ? require('http') : require('https')
    const req = mod.get(
      url,
      { headers: { 'User-Agent': UA }, timeout: TIMEOUT },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString('utf-8') }),
        )
      },
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
  })
}

function httpsPost(url: string, body: string): Promise<{ status: number; data: string } | null> {
  return new Promise((resolve) => {
    const options: RequestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': UA,
      },
      timeout: TIMEOUT,
    }
    const req = request(url, options, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () =>
        resolve({ status: res.statusCode || 0, data: Buffer.concat(chunks).toString('utf-8') }),
      )
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.write(body)
    req.end()
  })
}

async function fetchGetJson(url: string): Promise<any | null> {
  const res = await fetchGet(url)
  if (!res || res.status < 200 || res.status >= 300) return null
  try {
    return JSON.parse(res.data)
  } catch {
    return null
  }
}

async function httpsPostJson(url: string, body: string): Promise<any | null> {
  const res = await httpsPost(url, body)
  if (!res || res.status < 200 || res.status >= 300) return null
  try {
    return JSON.parse(res.data)
  } catch {
    return null
  }
}

function downloadImage(url: string, savePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get(
      url,
      { headers: { 'User-Agent': UA }, timeout: TIMEOUT },
      (res: IncomingMessage) => {
        if (res.statusCode !== 200) {
          resolve(false)
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          try {
            writeFileSync(savePath, Buffer.concat(chunks))
            resolve(true)
          } catch {
            resolve(false)
          }
        })
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

// ============================================================
//  搜索查询生成
// ============================================================

function searchQueries(title: string): string[] {
  const qs = [
    title,
    title.replace(/\s*第[一二三四五六七八九十\d]+\s*季?\s*$/, '').trim(),
    title.replace(/\s*Season\s*\d+\s*$/i, '').trim(),
    title.replace(/\s*S\d+\s*$/i, '').trim(),
  ]
  const asciiOnly = title.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, '').trim()
  if (asciiOnly.length >= 3) qs.push(asciiOnly)
  return [...new Set(qs.filter((q) => q.length >= 2))]
}

// ============================================================
//  Provider 1: AniList (GraphQL) — 完整元数据
// ============================================================

const ANILIST_GQL = `query($s:String){Page(perPage:8){media(search:$s,type:ANIME,format_not:MUSIC){id idMal title{romaji english native} coverImage{large extraLarge} description bannerImage startDate{year month day} season seasonYear episodes averageScore genres studios(isMain:true){nodes{name}} staff(sort:RELEVANCE,perPage:6){nodes{name{full} primaryOccupations}}}}}`

interface AniListMedia {
  id: number
  idMal: number
  title: { romaji: string; english: string; native: string }
  coverImage: { large: string; extraLarge: string }
  description: string
  bannerImage: string
  startDate: { year: number; month: number; day: number }
  season: string
  seasonYear: number
  episodes: number
  averageScore: number
  genres: string[]
  studios: { nodes: Array<{ name: string }> }
  staff: { nodes: Array<{ name: { full: string }; primaryOccupations: string[] }> }
}

async function searchAniListMeta(query: string): Promise<AniListMedia[] | null> {
  try {
    const gql = JSON.stringify({ query: ANILIST_GQL, variables: { s: query } })
    const json = await httpsPostJson('https://graphql.anilist.co', gql)
    const media: AniListMedia[] = json?.data?.Page?.media || []
    return media.filter((m) => m.coverImage?.large)
  } catch {
    return null
  }
}

function matchAniList(query: string, candidates: AniListMedia[]): AniListMedia | null {
  const q = query.toLowerCase()
  let best: AniListMedia | null = null
  let bestScore = Infinity

  for (const m of candidates) {
    const names = [m.title.romaji, m.title.english, m.title.native].filter(Boolean)
    for (const name of names) {
      const n = name.toLowerCase()
      if (n.includes(q) || q.includes(n)) return m
      const dist = levenshtein(q, n)
      const score = dist / Math.max(q.length, n.length)
      if (score < bestScore) {
        bestScore = score
        best = m
      }
    }
  }
  return bestScore < 0.5 ? best : candidates[0] || null
}

function cleanAniListDesc(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function seasonLabel(season: string, seasonYear: number): string {
  const map: Record<string, string> = {
    WINTER: '冬季',
    SPRING: '春季',
    SUMMER: '夏季',
    FALL: '秋季',
  }
  const yr = seasonYear || 0
  const s = map[season?.toUpperCase()] || season || ''
  return yr ? `${yr}年${s}` : s
}

async function fetchAniListMeta(
  query: string,
  targetSeason?: number,
): Promise<AnimeMetadata | null> {
  const candidates = await searchAniListMeta(query)
  if (!candidates?.length) return null

  // 如果指定了季号，优先匹配同季的条目
  let m = matchAniList(query, candidates)
  if (!m && targetSeason && targetSeason > 1) {
    // 尝试用带季号的 query 再匹配（如 "進撃の巨人 Season 2"）
    const seasonQuery = `${query} Season ${targetSeason}`
    const s2Candidates = await searchAniListMeta(seasonQuery)
    if (s2Candidates?.length) {
      m = matchAniList(seasonQuery, s2Candidates) || matchAniList(query, s2Candidates)
    }
  }
  if (!m) return null

  const staffList: StaffInfo[] =
    m.staff?.nodes
      ?.map((s: any) => ({
        role: s.primaryOccupations?.[0] || '',
        name: s.name?.full || '',
      }))
      .filter((s: StaffInfo) => s.name) || []

  const studioName = m.studios?.nodes?.[0]?.name || ''

  const year = m.seasonYear || m.startDate?.year || 0

  return {
    title: m.title.romaji || m.title.english || '',
    titleCn: '', // AniList 的 native 是日文，中文由 Bangumi 补充
    titleEn: m.title.english || m.title.romaji || '',
    synopsis: m.description ? cleanAniListDesc(m.description) : '',
    rating: m.averageScore ? m.averageScore / 10 : 0,
    genres: m.genres || [],
    year,
    season: seasonLabel(m.season, m.seasonYear),
    episodes: m.episodes || 0,
    studio: studioName,
    staff: staffList,
    coverUrl: m.coverImage.extraLarge || m.coverImage.large,
    anilistId: m.id,
    bangumiId: 0,
  }
}

// ============================================================
//  Provider 2: Bangumi v0 API — 中文元数据
// ============================================================

interface BangumiSubject {
  id: number
  name: string
  name_cn: string
  summary: string
  images: { large: string; common: string; medium: string; small: string }
  rating: { score: number; total: number }
  eps: number
  total_episodes: number
  date: string // "2023-09-29"
  type: number // 2=动画
  tags: Array<{ name: string; count: number }>
  staff: Array<{ name: string; jobs: string[]; role_name?: string }>
}

export async function searchBangumiMeta(query: string): Promise<BangumiSubject[]> {
  try {
    // v0 search/subjects 是 POST 接口（GET 会 404），keyword 走 body，type 走 filter
    const url = `https://api.bgm.tv/v0/search/subjects?limit=5`
    console.log(`[AniBox] Bangumi search: ${url} keyword=${query}`)
    const json = await httpsPostJson(
      url,
      JSON.stringify({ keyword: query, sort: 'match', filter: { type: [2] } }),
    )
    if (!json?.data?.length) {
      console.log(`[AniBox] Bangumi search: no results for "${query}"`)
      return []
    }
    console.log(`[AniBox] Bangumi search: ${json.data.length} results for "${query}"`)
    return json.data.map((s: any) => ({
      id: s.id,
      name: s.name || '',
      name_cn: s.name_cn || '',
      summary: s.summary || '',
      images: s.images || { large: '', common: '', medium: '', small: '' },
      rating: { score: s.rating?.score || 0, total: s.rating?.total || 0 },
      eps: s.eps || 0,
      total_episodes: s.total_episodes || s.eps || 0,
      date: s.date || '',
      type: s.type || 2,
      tags: s.tags || [],
      staff: [],
    }))
  } catch (e: any) {
    console.warn(`[AniBox] Bangumi search error for "${query}":`, e?.message || e)
    return []
  }
}

async function getBangumiDetail(bgId: number): Promise<BangumiSubject | null> {
  try {
    const url = `https://api.bgm.tv/v0/subjects/${bgId}`
    console.log(`[AniBox] Bangumi detail: ${url}`)
    const json = await fetchGetJson(url)
    if (!json) {
      console.log(`[AniBox] Bangumi detail: no data for id=${bgId}`)
      return null
    }
    console.log(`[AniBox] Bangumi detail OK: ${json.name_cn || json.name} (id=${bgId})`)
    return {
      id: json.id || bgId,
      name: json.name || '',
      name_cn: json.name_cn || '',
      summary: json.summary || '',
      images: json.images || { large: '', common: '', medium: '', small: '' },
      rating: json.rating || { score: 0, total: 0 },
      eps: json.eps || json.total_episodes || 0,
      total_episodes: json.total_episodes || json.eps || 0,
      date: json.date || '',
      type: json.type || 2,
      tags: json.tags || [],
      staff: [],
    }
  } catch (e: any) {
    console.warn(`[AniBox] Bangumi detail error for id=${bgId}:`, e?.message || e)
    return null
  }
}

async function fetchBangumiMeta(query: string): Promise<AnimeMetadata | null> {
  const items = await searchBangumiMeta(query)
  if (!items.length) return null

  // 模糊匹配：优先 name_cn 完全匹配，其次 Levenshtein
  const q = query.toLowerCase()
  let best: BangumiSubject | null = null
  let bestScore = Infinity
  for (const s of items) {
    const names = [s.name_cn, s.name].filter(Boolean)
    for (const name of names) {
      const n = name.toLowerCase()
      if (n.includes(q) || q.includes(n)) {
        best = s
        bestScore = 0
        break
      }
      const dist = levenshtein(q, n)
      const score = dist / Math.max(q.length, n.length)
      if (score < bestScore) {
        bestScore = score
        best = s
      }
    }
    if (best && bestScore === 0) break
  }
  if (!best) best = items[0]

  console.log(
    `[AniBox] Bangumi matched: ${best.name_cn || best.name} (score=${bestScore.toFixed(2)}, id=${best.id})`,
  )

  // v0 API 搜索已含 summary，但详情可能有更完整的 Staff 等数据
  // 如果搜索结果的 summary 已足够，可以跳过详情请求
  if (!best.summary || !best.tags?.length) {
    const detail = await getBangumiDetail(best.id)
    if (detail) {
      // 保留搜索结果中已有的字段（搜索有时比详情更全）
      best.summary = best.summary || detail.summary
      best.tags = best.tags?.length ? best.tags : detail.tags
      best.eps = best.eps || detail.eps
      best.date = best.date || detail.date
    }
  }

  // 从 date 提取年份
  let year = 0
  const yearMatch = best.date?.match(/(\d{4})/)
  if (yearMatch) year = parseInt(yearMatch[1], 10)

  // 从 tags 提取类型标签（过滤掉元标签）
  const metaTags = [
    'TV',
    'OVA',
    '剧场版',
    'WEB',
    '小说改',
    '漫画改',
    '游戏改',
    '原创',
    '新番',
    '日本',
    '中国',
  ]
  const genres: string[] = (best.tags || [])
    .filter((t: any) => {
      const name = typeof t === 'string' ? t : t.name || ''
      return name && !metaTags.includes(name)
    })
    .map((t: any) => (typeof t === 'string' ? t : t.name || ''))
    .slice(0, 8)

  return {
    title: best.name_cn || best.name || '',
    titleCn: best.name_cn || '',
    titleEn: best.name || '',
    synopsis: best.summary || '',
    rating: best.rating?.score || 0,
    genres: genres.length > 0 ? genres : ['动画'],
    year,
    season: year ? `${year}年` : '',
    episodes: best.total_episodes || best.eps || 0,
    studio: '',
    staff: [], // v0 API 需要 /persons 端点，暂不获取
    coverUrl: best.images?.large || best.images?.common || best.images?.medium || '',
    anilistId: 0,
    bangumiId: best.id,
  }
}

// ============================================================
//  合并元数据（AniList 优先，Bangumi 补充中文信息）
// ============================================================

async function fetchFullMetadata(
  title: string,
  folderPath: string,
  season?: number,
): Promise<AnimeMetadata | null> {
  // ==== 本地索引优先（Bangumi dump 裁剪数据，零在线请求）====
  // 命中则跳过 AniList/Bangumi 在线链路；简介已是中文，无需翻译
  try {
    const local = await lookupLocalMetadata(title, season)
    if (local) return local
  } catch (err: any) {
    console.warn('[AniBox] 本地索引查询失败，回退在线链路:', err?.message || err)
  }

  const queries = searchQueries(title)
  const romajiTitles = extractRomajiFromFolder(folderPath)
  if (romajiTitles.length > 0) queries.unshift(...romajiTitles)

  for (let qi = 0; qi < Math.min(queries.length, 5); qi++) {
    const query = queries[qi]

    // 并行抓取两个数据源
    const [alMeta, bgMeta] = await Promise.all([
      fetchAniListMeta(query, season),
      fetchBangumiMeta(query),
    ])

    if (!alMeta && !bgMeta) continue

    // 合并：AniList 数据质量更好，Bangumi 补充中文信息
    const primary = alMeta || bgMeta!
    const secondary = bgMeta || alMeta

    return {
      title: primary.title || secondary?.title || '',
      titleCn: bgMeta?.titleCn || alMeta?.titleCn || '',
      titleEn: alMeta?.titleEn || bgMeta?.titleEn || '',
      synopsis: bgMeta?.synopsis || alMeta?.synopsis || '',
      rating: Math.max(alMeta?.rating || 0, bgMeta?.rating || 0),
      genres: bgMeta?.genres?.length ? bgMeta.genres : alMeta?.genres || [],
      year: bgMeta?.year || alMeta?.year || 0,
      season: alMeta?.season || bgMeta?.season || '',
      episodes: alMeta?.episodes || bgMeta?.episodes || 0,
      studio: alMeta?.studio || '',
      staff: alMeta?.staff?.length ? alMeta.staff : bgMeta?.staff || [],
      coverUrl: alMeta?.coverUrl || bgMeta?.coverUrl || '',
      anilistId: alMeta?.anilistId || 0,
      bangumiId: bgMeta?.bangumiId || 0,
    }
  }

  return null
}

// ============================================================
//  对外接口：抓取元数据 + 下载封面
// ============================================================

export async function fetchMetadataForSeries(
  title: string,
  folderPath: string,
  season?: number,
  onStatus?: (status: string) => void,
): Promise<{ metadata: AnimeMetadata | null; coverPath: string | null }> {
  onStatus?.('搜索元数据...')
  const metadata = await fetchFullMetadata(title, folderPath, season)

  if (metadata) {
    const origSynopsis = metadata.synopsis || ''

    // 如果简介已含较多中文（来自 Bangumi），跳过翻译
    const ratio = chineseRatio(origSynopsis)
    if (origSynopsis && ratio < 0.5) {
      // 第一步：快速本地词替换（即时生效）
      metadata.synopsis = translateSynopsisLocal(origSynopsis)
      const localRatio = chineseRatio(metadata.synopsis)
      console.log(`[AniBox] Local dict: ${(localRatio * 100).toFixed(0)}% Chinese`)

      // 第二步：使用 AI 翻译模型完成完整翻译
      if (localRatio < 0.5) {
        try {
          onStatus?.('AI 翻译简介...')
          console.log(`[AniBox] Starting AI synopsis translation for: ${title}`)
          const aiTranslated = await translateWithAI(origSynopsis, 'en', 'zh')
          const aiRatio = chineseRatio(aiTranslated)
          if (aiRatio > localRatio) {
            console.log(`[AniBox] AI translation: ${(aiRatio * 100).toFixed(0)}% Chinese`)
            metadata.synopsis = aiTranslated
          } else {
            metadata.synopsis = metadata.synopsis // keep local dict result
          }
        } catch (err: any) {
          console.warn(`[AniBox] AI synopsis translation failed for ${title}:`, err?.message)
        }
      }
    }

    // 类型标签翻译
    if (metadata.genres?.length) {
      const orig = [...metadata.genres]
      metadata.genres = metadata.genres.map((g: string) => translateLocal(g) || g)
      console.log(`[AniBox] Genres: ${orig.join(', ')} → ${metadata.genres.join(', ')}`)
    }

    // Staff 角色翻译
    if (metadata.staff?.length) {
      metadata.staff = translateStaffRoles(metadata.staff)
    }
  }

  // 下载封面和保存元数据到 .anibox/
  let coverPath: string | null = null
  const aniboxDir = join(folderPath, '.anibox')

  if (metadata?.coverUrl) {
    mkdirSync(aniboxDir, { recursive: true })
    const coverFile = join(aniboxDir, 'cover.jpg')
    if (!existsSync(coverFile)) {
      onStatus?.('下载封面...')
      const ok = await downloadImage(metadata.coverUrl, coverFile)
      if (ok) coverPath = coverFile
    } else {
      coverPath = coverFile
    }
  }

  // 保存 metadata.json 到 .anibox/
  if (metadata) {
    try {
      mkdirSync(aniboxDir, { recursive: true })
      const metaFile = join(aniboxDir, 'metadata.json')
      writeFileSync(metaFile, JSON.stringify(metadata, null, 2))
      console.log(`[AniBox] Metadata saved: ${folderPath}/.anibox/metadata.json`)
    } catch (err) {
      console.warn('[AniBox] Failed to save metadata.json:', err)
    }
    console.log(
      `[AniBox] Metadata OK: ${title} → rating=${metadata.rating}, genres=${metadata.genres.join(',')}, year=${metadata.year}`,
    )
  }

  return { metadata, coverPath }
}

export interface MetadataBatchResult {
  folderPath: string
  metadata: AnimeMetadata | null
  coverPath: string | null
}

export async function fetchMetadataBatch(
  series: Array<{ title: string; folderPath: string; season?: number }>,
  onProgress?: (current: number, total: number, title: string, ok: boolean, status: string) => void,
): Promise<{ total: number; fetched: number; failed: number; results: MetadataBatchResult[] }> {
  let fetched = 0
  let failed = 0
  const results: MetadataBatchResult[] = []

  for (let i = 0; i < series.length; i++) {
    const s = series[i]
    onProgress?.(i + 1, series.length, s.title, false, '搜索中...')

    const result = await fetchMetadataForSeries(s.title, s.folderPath, s.season, (status) => {
      onProgress?.(i + 1, series.length, s.title, false, status)
    })

    results.push({
      folderPath: s.folderPath,
      metadata: result.metadata,
      coverPath: result.coverPath,
    })

    if (result.metadata) {
      fetched++
      onProgress?.(i + 1, series.length, s.title, true, '已获取')
    } else {
      failed++
      onProgress?.(i + 1, series.length, s.title, false, '未找到')
    }

    // 限速
    if (i < series.length - 1) {
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  return { total: series.length, fetched, failed, results }
}

// ============================================================
//  兼容旧接口：仅获取封面
// ============================================================

export async function fetchCoverOnly(
  title: string,
  folderPath: string,
  onStatus?: (status: string) => void,
): Promise<string | null> {
  const result = await fetchMetadataForSeries(title, folderPath, undefined, onStatus)
  return result.coverPath
}

export async function fetchCoverManual(
  folderPath: string,
  searchQuery: string,
): Promise<string | null> {
  const coverPath = join(folderPath, 'cover.jpg')
  if (existsSync(coverPath)) return coverPath

  const alMeta = await fetchAniListMeta(searchQuery)
  if (!alMeta?.coverUrl) return null

  const ok = await downloadImage(alMeta.coverUrl, coverPath)
  return ok ? coverPath : null
}

// ============================================================
//  标题校验：用 AniList 修正扫描器提取的标题
// ============================================================

export interface TitleSuggestion {
  folderPath: string
  currentTitle: string
  suggestedTitle: string
  anilistId: number
  confidence: number // 0-1
  reason: string // 为什么建议修改
}

/**
 * 校验一个系列标题，如果 AniList 有更好的标题则返回建议
 * @param folderPath 系列文件夹路径
 * @param currentTitle 扫描器提取的当前标题
 * @returns 标题建议，如果无需修改则返回 null
 */
export async function validateSeriesTitle(
  folderPath: string,
  currentTitle: string,
): Promise<TitleSuggestion | null> {
  try {
    // 用当前标题搜索 AniList
    const candidates = await searchAniListMeta(currentTitle)
    if (!candidates?.length) return null

    const best = matchAniList(currentTitle, candidates)
    if (!best) return null

    // 收集 AniList 返回的候选标题
    const alTitle = best.title.native || best.title.romaji || best.title.english || ''
    const alRomaji = best.title.romaji || ''
    const alEnglish = best.title.english || ''

    // 计算当前标题与 AniList 标题的相似度
    const currentClean = currentTitle.toLowerCase().trim()
    const bestScore = Math.min(
      titleDist(currentClean, alTitle.toLowerCase()),
      titleDist(currentClean, alRomaji.toLowerCase()),
      titleDist(currentClean, alEnglish.toLowerCase()),
    )

    // 如果相似度很高（< 0.15），说明当前标题已经很接近，不需要改
    if (bestScore < 0.15) return null

    // 选择最佳建议标题：优先中文 > romaji > english
    let suggestedTitle = alTitle
    let reason = 'AniList 原标题'

    if (alRomaji && best.title.native) {
      // 如果有日文原生标题，优先用中文翻译（titleCn）
      if (best.title.native && /[\u4e00-\u9fff]/.test(best.title.native)) {
        suggestedTitle = best.title.native
        reason = 'AniList 中文标题'
      } else if (best.title.romaji) {
        suggestedTitle = best.title.romaji
        reason = 'AniList romaji 标题'
      }
    }

    // 如果当前标题有中文但建议标题没有，保持当前
    if (/[\u4e00-\u9fff]/.test(currentTitle) && !/[\u4e00-\u9fff]/.test(suggestedTitle)) {
      // 当前中文标题更好，但仍然检查相似度
      if (bestScore > 0.5) return null
    }

    // 如果建议标题和当前标题几乎一样，不需要改
    if (suggestedTitle.trim().toLowerCase() === currentClean) return null

    return {
      folderPath,
      currentTitle,
      suggestedTitle: suggestedTitle.trim(),
      anilistId: best.id,
      confidence: 1 - bestScore,
      reason,
    }
  } catch {
    return null
  }
}

/** 简单的标题距离计算（归一化后） */
function titleDist(a: string, b: string): number {
  if (!a || !b) return 1
  if (a === b) return 0
  const maxLen = Math.max(a.length, b.length)
  // Levenshtein 距离归一化
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i++) {
    let prev = dp[0]
    dp[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const temp = dp[j + 1]
      dp[j + 1] = a[i] === b[j] ? prev : 1 + Math.min(prev, dp[j], dp[j + 1])
      prev = temp
    }
  }
  return dp[b.length] / maxLen
}

/**
 * 批量校验多个系列标题
 */
export async function validateBatchTitles(
  series: Array<{ folderPath: string; title: string }>,
): Promise<TitleSuggestion[]> {
  const suggestions: TitleSuggestion[] = []
  for (const s of series) {
    try {
      const result = await validateSeriesTitle(s.folderPath, s.title)
      if (result) suggestions.push(result)
    } catch {
      /* skip errors on individual series */
    }
  }
  return suggestions
}
