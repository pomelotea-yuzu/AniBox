import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

/**
 * 在线字幕搜索结果
 */
export interface OnlineSubtitleResult {
  id: string
  title: string
  language: string
  languageLabel: string
  source: 'opensubtitles' | 'anime-sub' | 'shooter'
  downloadUrl: string
  fileName: string
  rating: number
  downloads: number
  matchedEpisode?: number
}

/**
 * OpenSubtitles API 配置
 * 需要在 https://www.opensubtitles.com 注册免费账号获取 API Key
 */
let openSubtitlesApiKey = ''
let openSubtitlesUserAgent = 'AniBox/1.0'

export function setOpenSubtitlesConfig(apiKey: string, userAgent?: string): void {
  openSubtitlesApiKey = apiKey
  if (userAgent) openSubtitlesUserAgent = userAgent
}

// ========== 动漫字幕库搜索 ==========

// 国内动漫字幕站点
const ANIME_SUB_SOURCES: Array<{
  name: string
  searchUrl: (query: string, ep?: number) => string
  resultsParser: (html: string) => OnlineSubtitleResult[]
}> = [
  {
    name: 'A4K 字幕',
    searchUrl: (q) => `https://a4k.net/search?keyword=${encodeURIComponent(q)}`,
    resultsParser: () => [], // 需要服务端渲染，简化处理
  },
]

// ========== OpenSubtitles API ==========

interface OSSearchResult {
  id: string
  type: string
  attributes: {
    language: string
    release: string
    files: Array<{ file_id: number; file_name: string; cd_number: number }>
    feature_details: {
      feature_id: number
      feature_type: string
      title: string
      year: number
      imdb_id: number
      tmdb_id: number
    }
    subtitle_id: string
    download_count: number
    ratings: number
    from_trusted: boolean
    ai_translated: boolean
  }
}

interface OSFileInfo {
  file_id: number
  file_name: string
  link: string
  remaining: number
  requests: number
  allowed: number
}

async function searchOpenSubtitles(
  query: string,
  episode?: number,
  lang?: string,
): Promise<OnlineSubtitleResult[]> {
  if (!openSubtitlesApiKey) return []

  const searchQuery = episode ? `${query} episode ${episode}` : query
  const params = new URLSearchParams({
    query: searchQuery,
    languages: lang || 'zh,ja,en',
    order_by: 'download_count',
    type: episode ? 'episode' : 'movie',
  })

  try {
    const resp = await fetch(
      `https://api.opensubtitles.com/api/v1/subtitles?${params.toString()}`,
      {
        headers: {
          'Api-Key': openSubtitlesApiKey,
          'User-Agent': openSubtitlesUserAgent,
          'Content-Type': 'application/json',
        },
      },
    )

    if (!resp.ok) return []

    const data = (await resp.json()) as { data: OSSearchResult[] }
    const results: OnlineSubtitleResult[] = []

    for (const item of data.data || []) {
      const attrs = item.attributes
      const file = attrs.files?.[0]
      if (!file) continue

      results.push({
        id: `os_${attrs.subtitle_id}`,
        title: attrs.release || attrs.feature_details?.title || file.file_name,
        language: attrs.language,
        languageLabel: getLanguageLabel(attrs.language),
        source: 'opensubtitles',
        downloadUrl: '', // 需要二次请求获取下载链接
        fileName: file.file_name,
        rating: attrs.ratings || 0,
        downloads: attrs.download_count || 0,
      })
    }

    return results
  } catch {
    return []
  }
}

async function getOpenSubtitlesDownloadUrl(fileId: number): Promise<string> {
  if (!openSubtitlesApiKey) return ''
  try {
    const resp = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: {
        'Api-Key': openSubtitlesApiKey,
        'User-Agent': openSubtitlesUserAgent,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: fileId }),
    })

    if (!resp.ok) return ''
    const data = (await resp.json()) as { link: string; file_name: string }
    return data.link || ''
  } catch {
    return ''
  }
}

// ========== 射手网（伪·射手网 API） ==========

async function searchShooter(query: string, episode?: number): Promise<OnlineSubtitleResult[]> {
  // 射手网已关停，使用存档 API 镜像
  const hash = await computeFileHash(query)
  const fileHash = episode ? `${hash}_${episode}` : hash
  try {
    const resp = await fetch(`https://api.ass.sn/sub/search?q=${encodeURIComponent(fileHash)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!resp.ok) return []
    // 射手镜像 API 格式各异，简单处理
    return []
  } catch {
    return []
  }
}

async function computeFileHash(query: string): Promise<string> {
  // 简单哈希用于射手API
  let hash = 0
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}

// ========== 公共搜索接口 ==========

export interface SubtitleSearchQuery {
  /** 番剧/电影标题 */
  title: string
  /** 集号（可选） */
  episode?: number
  /** 视频文件路径（用于本地搜索） */
  videoPath?: string
  /** 偏好的语言代码 */
  preferredLanguages?: string[]
}

/**
 * 搜索在线字幕
 * 按优先级顺序搜索：OpenSubtitles → 动漫字幕库 → 射手网
 */
export async function searchOnlineSubtitles(
  query: SubtitleSearchQuery,
): Promise<OnlineSubtitleResult[]> {
  const results: OnlineSubtitleResult[] = []
  const lang = query.preferredLanguages?.join(',') || 'zh,ja,en'

  // 并行搜索所有源
  const [osResults, animeResults] = await Promise.all([
    searchOpenSubtitles(query.title, query.episode, lang),
    searchAnimeSubs(query.title, query.episode),
  ])

  results.push(...osResults)
  results.push(...animeResults)

  // 去重 + 按评分/下载量排序
  const seen = new Set<string>()
  return results
    .filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
    .sort((a, b) => b.downloads - a.downloads || b.rating - a.rating)
}

/**
 * 下载字幕文件并保存到视频目录
 * 返回保存的本地文件路径
 */
export async function downloadSubtitle(
  result: OnlineSubtitleResult,
  videoPath: string,
): Promise<string | null> {
  const videoDir = dirname(videoPath)
  const videoName = videoPath.replace(/\.[^.]+$/, '').replace(/.*[/\\]/, '')

  try {
    let downloadUrl = result.downloadUrl

    // OpenSubtitles 需要额外获取下载链接
    if (result.source === 'opensubtitles' && !downloadUrl) {
      const fileId = parseInt(result.id.replace('os_', ''), 10)
      if (!isNaN(fileId)) {
        downloadUrl = await getOpenSubtitlesDownloadUrl(fileId)
      }
    }

    if (!downloadUrl) return null

    const resp = await fetch(downloadUrl)
    if (!resp.ok) return null

    // 从 Content-Disposition 或 result 中提取文件扩展名
    let ext = '.srt'
    const disposition = resp.headers.get('content-disposition')
    if (disposition) {
      const m = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
      if (m) {
        const fn = m[1].replace(/['"]/g, '')
        const dotIdx = fn.lastIndexOf('.')
        if (dotIdx >= 0) ext = fn.substring(dotIdx)
      }
    }

    // 用语言标签命名：videoname.language.ext
    const langTag = result.language || 'zh'
    const saveName = `${videoName}.${langTag}${ext}`
    const savePath = join(videoDir, saveName)

    const buffer = Buffer.from(await resp.arrayBuffer())
    writeFileSync(savePath, buffer)

    return savePath
  } catch (err) {
    console.error('[AniBox] Subtitle download failed:', err)
    return null
  }
}

/**
 * 获取 OpenSubtitles 配置状态
 */
export function getOpenSubtitlesStatus(): { configured: boolean; apiKeySet: boolean } {
  return {
    configured: openSubtitlesApiKey.length > 0,
    apiKeySet: openSubtitlesApiKey.length > 0,
  }
}

// ========== 辅助函数 ==========

async function searchAnimeSubs(_title: string, _ep?: number): Promise<OnlineSubtitleResult[]> {
  // 动漫字幕库搜索（目前通过上面定义的源迭代）
  // 由于大多数动漫字幕站需要 JS 渲染或反爬，此处作为框架预留
  // 后续可通过 Playwright 或专用 API 增强
  return []
}

function getLanguageLabel(code: string): string {
  const map: Record<string, string> = {
    zh: '中文',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'zh-Hans': '简体中文',
    'zh-Hant': '繁體中文',
    ja: '日本語',
    en: 'English',
    ko: '한국어',
    fr: 'Français',
    de: 'Deutsch',
    es: 'Español',
    pt: 'Português',
    it: 'Italiano',
    ru: 'Русский',
    ar: 'العربية',
    th: 'ไทย',
    vi: 'Tiếng Việt',
  }
  return map[code] || code
}

/**
 * 缓存目录（用于字幕搜索结果缓存等）
 */
export function getSubtitleCacheDir(): string {
  const dir = join(app.getPath('userData'), 'subtitle-cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}
