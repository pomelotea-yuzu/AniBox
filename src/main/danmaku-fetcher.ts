import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { levenshtein, titleSimilarity } from './utils'

/**
 * 弹幕数据结构（从B站XML解析）
 */
export interface DanmakuItem {
  text: string
  time: number // 视频时间（秒）
  mode: 'scroll' | 'top' | 'bottom'
  color: string // '#RRGGBB'
  fontSize: number
  timestamp: number // 发送时间戳
}

interface BilibiliSeasonResult {
  season_id: number
  media_id: number
  title: string
}

interface BilibiliEpisode {
  title: string
  ep_id: number
  aid: number
  cid: number
  index: number
}

// B站 API 端点
const BILIBILI_API = {
  searchAnime: 'https://api.bilibili.com/x/web-interface/search/type?search_type=media_bangumi',
  seasonInfo: 'https://api.bilibili.com/pgc/view/web/season',
  danmaku: 'https://api.bilibili.com/x/v1/dm/list.so',
}

// User-Agent（B站要求）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// 缓存目录
function getCacheDir(): string {
  const dir = join(app.getPath('userData'), 'danmaku-cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 步骤1: 根据番剧名搜索B站番剧
 */
export async function searchBilibiliAnime(keyword: string): Promise<BilibiliSeasonResult[]> {
  const params = new URLSearchParams({ keyword, search_type: 'media_bangumi' })
  try {
    const resp = await fetch(`${BILIBILI_API.searchAnime}?${params.toString()}`, {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com' },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return []
    const data = (await resp.json()) as any
    if (data.code !== 0) return []

    const results: BilibiliSeasonResult[] = []
    for (const item of data.data?.result || []) {
      const m = data.data?.media_list?.find((ml: any) => ml.media_id === item.media_id)
      results.push({
        season_id: item.season_id || m?.season_id || 0,
        media_id: item.media_id || 0,
        title: item.title || '',
      })
    }
    return results.filter((r) => r.season_id > 0)
  } catch {
    return []
  }
}

/**
 * 步骤2: 获取番剧分集列表
 */
export async function getBilibiliEpisodes(seasonId: number): Promise<BilibiliEpisode[]> {
  try {
    const resp = await fetch(`${BILIBILI_API.seasonInfo}?season_id=${seasonId}`, {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com' },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return []
    const data = (await resp.json()) as any
    if (data.code !== 0) return []

    const episodes: BilibiliEpisode[] = []
    for (const ep of data.result?.episodes || []) {
      episodes.push({
        title: ep.long_title || ep.share_copy || `第${ep.title}话`,
        ep_id: ep.ep_id || ep.id,
        aid: ep.aid,
        cid: ep.cid,
        index: ep.title ? parseInt(ep.title) || episodes.length + 1 : episodes.length + 1,
      })
    }
    return episodes
  } catch {
    return []
  }
}

/**
 * 步骤3: 获取弹幕XML
 */
export async function fetchBilibiliDanmakuXML(cid: number): Promise<string> {
  try {
    const resp = await fetch(`${BILIBILI_API.danmaku}?oid=${cid}`, {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com' },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return ''
    return await resp.text()
  } catch {
    return ''
  }
}

/**
 * 解析B站弹幕XML → DanmakuItem[]
 *
 * XML 格式:
 *   <d p="time,mode,fontSize,color,timestamp,pool,sender,rowID">文本</d>
 *
 * p 属性字段说明:
 *   [0] time      — 弹幕出现时间（秒，带小数）
 *   [1] mode      — 1=滚动, 4=底部, 5=顶部, 6=逆向, 7=高级
 *   [2] fontSize  — 字号 (18/25/36)
 *   [3] color     — 颜色 (十进制 RGB)
 *   [4] timestamp — Unix时间戳
 *   [5] pool      — 池 (0=普通, 1=字幕, 2=特殊)
 *   [6] sender    — 发送者UID(加密)
 *   [7] rowID     — 弹幕数据库ID
 */
export function parseBilibiliDanmakuXML(xml: string): DanmakuItem[] {
  const items: DanmakuItem[] = []
  const dTagRegex = /<d p="([^"]*)">(.*?)<\/d>/g

  let match: RegExpExecArray | null
  while ((match = dTagRegex.exec(xml)) !== null) {
    const p = match[1].split(',')
    const rawText = match[2]

    if (p.length < 8) continue

    const time = parseFloat(p[0])
    const mode = parseInt(p[1], 10)
    const fontSize = parseInt(p[2], 10) || 25
    const colorDec = parseInt(p[3], 10) || 16777215
    const timestamp = parseInt(p[4], 10) || 0

    // 转换模式
    let dmMode: 'scroll' | 'top' | 'bottom' = 'scroll'
    if (mode === 5) dmMode = 'top'
    if (mode === 4) dmMode = 'bottom'
    // mode 6=逆向 scroll, 7=高级(按 scroll 处理)

    // 颜色转换: 十进制 → '#RRGGBB'
    const color = '#' + colorDec.toString(16).padStart(6, '0')

    if (time < 0 || !rawText.trim()) continue
    if (rawText.trim().length > 100) continue // 跳过超长弹幕

    items.push({
      text: rawText.trim(),
      time,
      mode: dmMode,
      color,
      fontSize: Math.min(fontSize, 36),
      timestamp,
    })
  }

  return items
}

/**
 * 完整流程: 搜索番剧 → 匹配集号 → 获取弹幕
 */
export async function fetchDanmakuForEpisode(
  animeTitle: string,
  episodeNumber: number,
  onProgress?: (msg: string) => void,
): Promise<DanmakuItem[]> {
  // 1. 搜索番剧
  onProgress?.(`搜索: ${animeTitle}`)
  const seasons = await searchBilibiliAnime(animeTitle)
  if (seasons.length === 0) {
    console.warn('[AniBox Danmaku] No results for:', animeTitle)
    return []
  }

  // 2. 标题模糊匹配选最佳
  const best = fuzzyMatch(animeTitle, seasons)
  onProgress?.(`找到: ${best.title}`)

  // 3. 获取分集列表
  const episodes = await getBilibiliEpisodes(best.season_id)
  if (episodes.length === 0) {
    console.warn('[AniBox Danmaku] No episodes for season:', best.season_id)
    return []
  }

  // 4. 按集号匹配
  let targetEp = episodes.find((e) => e.index === episodeNumber)
  if (!targetEp) {
    // 如果按 index 找不到，尝试直接按数组索引
    targetEp = episodes[episodeNumber - 1]
  }
  if (!targetEp) {
    console.warn('[AniBox Danmaku] Episode not found:', episodeNumber)
    return []
  }

  onProgress?.(`下载弹幕: 第${targetEp.index}话 (cid=${targetEp.cid})`)

  // 5. 检查缓存
  const cacheFile = join(getCacheDir(), `dm_${targetEp.cid}.json`)
  if (existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf-8'))
      if (Array.isArray(cached) && cached.length > 0) {
        onProgress?.('已加载缓存弹幕')
        return cached
      }
    } catch {
      /* 缓存损坏，重新下载 */
    }
  }

  // 6. 下载弹幕
  const xml = await fetchBilibiliDanmakuXML(targetEp.cid)
  if (!xml) {
    console.warn('[AniBox Danmaku] Empty XML for cid:', targetEp.cid)
    return []
  }

  // 7. 解析
  const items = parseBilibiliDanmakuXML(xml)
  onProgress?.(`解析完成: ${items.length} 条弹幕`)

  // 8. 缓存
  try {
    writeFileSync(cacheFile, JSON.stringify(items))
  } catch {
    /* ok */
  }

  return items
}

/**
 * 直接通过 cleanTitle 搜索（精简标题提高命中率）
 */
export function cleanTitleForSearch(title: string): string {
  // 去除常见字幕组/格式标签
  return title
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/【.*?】/g, '')
    .replace(/第[一二三四五六七八九十\d]+季/g, '')
    .replace(/Season\s*\d+/gi, '')
    .replace(/S\d+/gi, '')
    .replace(/\d{4}/g, '') // 年份
    .replace(/1080[pP]|720[pP]|4K|BD/g, '')
    .replace(/GB|BIG5|CHS|CHT|JP|EN/g, '')
    .trim()
}

/**
 * 模糊匹配：计算标题相似度，选最佳
 */
function fuzzyMatch(
  target: string,
  candidates: Array<{ title: string; season_id: number; media_id: number }>,
) {
  const cleanTarget = cleanTitleForSearch(target).toLowerCase()
  let best = candidates[0]
  let bestScore = 0

  for (const c of candidates) {
    const cleanTitle = cleanTitleForSearch(c.title).toLowerCase()
    const score = titleSimilarity(cleanTarget, cleanTitle)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }

  return best
}

/**
 * 从本地XML文件解析弹幕（用于导入第三方弹幕库文件）
 */
export function parseDanmakuFromFile(filePath: string): DanmakuItem[] {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return parseBilibiliDanmakuXML(content)
  } catch {
    return []
  }
}

/**
 * 导出弹幕为B站XML格式
 */
export function exportDanmakuToXML(items: DanmakuItem[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<i>\n'
  for (const item of items) {
    const mode = item.mode === 'scroll' ? 1 : item.mode === 'bottom' ? 4 : 5
    const colorDec = parseInt(item.color.replace('#', ''), 16)
    const p = [
      item.time.toFixed(2),
      mode,
      item.fontSize,
      colorDec,
      item.timestamp || 0,
      0,
      '0',
      '0',
    ].join(',')
    xml += `  <d p="${p}">${escapeXml(item.text)}</d>\n`
  }
  xml += '</i>'
  return xml
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
