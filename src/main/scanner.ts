import { readdirSync, statSync, lstatSync } from 'fs'
import { join, basename, extname } from 'path'
import { findSubtitles, type SubtitleTrack } from './subtitle'
import { titleSimilarity, SIMILARITY_THRESHOLD as MERGE_THRESHOLD, VIDEO_EXTS } from './utils'

/**
 * 非番剧子目录模式（即使含视频也不作为独立系列）
 * 这些目录中的视频属于父系列的附赠内容
 */
const NON_SERIES_DIR_PATTERNS = /^(PV|PVs?|menu|menus?|特典映像?|映像特典?|メニュー|SPs?|NCOP|NCED|CM|creditless|ノンクレジット|イベント|予告|CDs?|Scans?|Fonts?)$/i

/**
 * BD 压制组文件夹名模式（以 [压制组名] 开头）
 * 这类文件夹名缺乏语义标题，需要向上回退取父目录名
 */
const BD_FOLDER_RE = /^\[(?:VCB-Studio|DBD-Raws|Moozzi2|UHA-WINGS|Airota|Nekomoe\s*kissaten|DMG|LoliHouse|BeanSub|FZSD|XKsub|KTXP|orion\s*origin|Sakurato|Comicat|Romanticat|T\.H\.X|YUI-7)/i

/**
 * 从 BD 压制组文件夹名中提取有意义的标题
 * "[DBD-Raws][铃芽之旅][正片+特典映像][1080P][BDRip]..." → "铃芽之旅"
 * "[VCB-Studio] Fate Zero [Ma10p_1080p]" → "Fate Zero"
 */
function extractTitleFromBDFolder(name: string): string {
  let s = name
  // 去掉开头的 [压制组名]
  s = s.replace(/^\[[^\]]+\]\s*/, '')
  // 去掉末尾的技术标签（按优先级：分辨率、压制类型、编码、音频、画面、语言、容器）
  s = s.replace(/\s*\[\s*(?:Ma10p|Hi10p)?_?(?:1080p|2160p|720p|4K)(?:_HDR)?\]/gi, '')
  s = s.replace(/\s*\[\s*(?:BDRip|BD-Rip|WebRip|BluRay|BD)(?:\s*[^\]]*)?\]/gi, '')
  s = s.replace(/\s*\[\s*(?:HEVC|H26[45]|x26[45])(?:[^\]]*)?\]/gi, '')
  s = s.replace(/\s*\[\s*(?:FLAC|AAC|DTS|DTS-HDMA?|opus|AC3|TrueHD)(?:[^\]]*)?\]/gi, '')
  s = s.replace(/\s*\[\s*(?:AVC|HDR10?|10-?bit|8-?bit)(?:[^\]]*)?\]/gi, '')
  s = s.replace(/\s*\[\s*(?:简[体繁]|简|繁|CH[ST]|GB|BIG5|JP|日)(?:[^\]]*)?\]/gi, '')
  s = s.replace(/\s*\[\s*(?:MKV|MP4)\]/gi, '')
  // 去掉纯数字集数范围标签 [01-06] [12-22]
  s = s.replace(/\s*\[\d{1,3}[-~～]\d{1,3}\]/g, '')
  // 去掉描述性标签（正片+特典映像、TV + SP 等，不含中文或字母的纯技术描述）
  s = s.replace(/\s*\[(?:正片[+＋]特典映像?|TV\s*[+＋]\s*SP|SP|OVA|特典映像?|映像特典?|メニュー)\]/gi, '')
  // 如果去除完后仍然有方括号，提取第一个方括号内的内容作为标题
  const firstBracket = s.match(/\[([^\]]+)\]/)
  if (firstBracket) {
    const inner = firstBracket[1].trim()
    if (inner.length > 0 && !/^\d+$/.test(inner)) {
      // 验证不是纯数字或技术关键词
      if (!/^(?:1080p|2160p|720p|4K|HEVC|AVC|FLAC|AAC|DTS|MKV|MP4|ASS|SRT)$/i.test(inner)) {
        return inner
      }
    }
  }
  // 去掉所有剩余方括号标签
  s = s.replace(/\s*\[[^\]]*\]/g, '')
  const result = s.trim()
  return result || name
}

/** 判断目录名是否为 BD 压制组文件夹 */
function isBDFolder(name: string): boolean {
  return BD_FOLDER_RE.test(name)
}

/** 判断目录是否应跳过（非番剧子目录） */
function isNonSeriesDir(name: string): boolean {
  return NON_SERIES_DIR_PATTERNS.test(name)
}

/** 支持的封面图片扩展名 */
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

/** 封面图优先文件名（按优先级排列） */
const COVER_NAMES = [
  'cover', 'poster', 'folder',
  'Cover', 'Poster', 'Folder',
  'COVER', 'POSTER', 'FOLDER'
]

export interface EpisodeInfo {
  fileName: string
  filePath: string
  epNumber: number
  subtitleTracks?: SubtitleTrack[]
}

export type SeriesType = 'tv' | 'ova' | 'movie' | 'special'

export interface SeriesInfo {
  /** 文件夹名 = 番剧标题 */
  title: string
  /** 文件夹路径 */
  folderPath: string
  /** 季号（从文件夹名推断） */
  season: number
  /** 番剧类型 */
  seriesType: SeriesType
  /** 话数列表（按话数排序） */
  episodes: EpisodeInfo[]
  /** 封面图片路径（本地文件），没有则为 undefined */
  coverPath?: string
}

/**
 * 从文件名中提取话数
 * 支持常见字幕组命名格式：
 *   [字幕组] 番剧名 - 11 [参数].mp4
 *   [字幕组] Kimetsu [01].mkv
 *   [字幕组][Romanji][24][1080p].mp4
 *   [字幕组] EP01.mp4
 *   第01话.mp4
 */
function parseEpisodeNumber(fileName: string): number {
  // 去掉扩展名
  const base = fileName.replace(/\.[^.]+$/, '')

  // 模式 1: " - 11 " 或 " - 11[" （字幕组最常见格式）
  const m1 = base.match(/[−-]\s*(\d{1,3})(?:\s|\[|v|$)/)
  if (m1) return parseInt(m1[1], 10)

  // 模式 2: "[01]" "[24]" — 取最后一个方括号数字
  // （字幕组标签通常在前，话数在靠后位置）
  const bracketNums = [...base.matchAll(/\[(\d{1,3})\]/g)]
  if (bracketNums.length > 0) {
    const last = bracketNums[bracketNums.length - 1]
    const num = parseInt(last[1], 10)
    if (num > 0 && num <= 999) return num
  }

  // 模式 3: "第01话" "第01話" "EP01" "E01" "#01"
  const m3 = base.match(/(?:第|EP|E|#)\s*(\d{1,3})/i)
  if (m3) return parseInt(m3[1], 10)

  // 模式 4: 末尾孤立数字 " 01" " 24"
  const m4 = base.match(/[^\d](\d{1,3})$/)
  if (m4) return parseInt(m4[1], 10)

  return 0
}

/**
 * 从文件夹名推断季号
 * 支持 "第二季" "Season 2" "S2" "2nd Season" 等
 */
function inferSeason(folderName: string): number {
  const chineseNums: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
  }

  // 中文: 第X季
  const cn = folderName.match(/第\s*([一二三四五六七八九十\d]+)\s*季/)
  if (cn) {
    const num = chineseNums[cn[1]] || parseInt(cn[1], 10)
    if (num > 0) return num
  }

  // 英文: Season 2 / S2 / 2nd Season
  const en = folderName.match(/Season\s*(\d+)/i)
    || folderName.match(/\bS(\d+)\b/i)
    || folderName.match(/(\d+)(?:st|nd|rd|th)\s*Season/i)
  if (en) {
    const num = parseInt(en[1], 10)
    if (num > 0) return num
  }

  return 1
}

/**
 * 从文件夹名和文件名推断番剧类型
 */
function inferSeriesType(folderName: string, fileNames: string[]): SeriesType {
  const combined = (folderName + ' ' + fileNames.join(' ')).toLowerCase()

  // 剧场版 / 电影
  if (/剧场版|映画|movie|film|gekijouban/i.test(combined)) return 'movie'

  // OVA / OAD
  if (/\b(ova|oad)\b/i.test(combined)) return 'ova'
  if (/オリジナル.*アニメ|原创动画/i.test(combined)) return 'ova'

  // 特别篇 / SP
  if (/\b(sp|special|特别篇|特典|番外)\b/i.test(combined)) return 'special'

  // 默认 TV
  return 'tv'
}

/**
 * 将相似度超过阈值的番剧分组合并
 */
function mergeSimilarSeries(seriesList: SeriesInfo[]): SeriesInfo[] {
  if (seriesList.length <= 1) return seriesList

  const merged: SeriesInfo[] = []
  const used = new Set<string>()

  for (let i = 0; i < seriesList.length; i++) {
    if (used.has(seriesList[i].folderPath)) continue

    let base = seriesList[i]
    used.add(base.folderPath)

    for (let j = i + 1; j < seriesList.length; j++) {
      if (used.has(seriesList[j].folderPath)) continue

      const sim = titleSimilarity(base.title, seriesList[j].title)
      if (sim >= MERGE_THRESHOLD) {
        const other = seriesList[j]

        // 如果两个系列季号不同，即使是同一作品的不同季也不合并
        // "冰海战记 第一季" vs "冰海战记 第二季" 相似度 87.5% 但不应合并
        if (base.season !== other.season) continue

        // 合并：保留标题较短的那个（通常更干净），合并剧集列表
        const mergedTitle = base.title.length <= other.title.length ? base.title : other.title

        base = {
          ...base,
          title: mergedTitle,
          episodes: [...base.episodes, ...other.episodes],
          // 优先保留有封面的
          coverPath: base.coverPath || other.coverPath,
          // 如果任一为 movie/ova，优先用非 tv 类型
          seriesType: base.seriesType !== 'tv' ? base.seriesType
            : other.seriesType !== 'tv' ? other.seriesType : 'tv'
        }
        used.add(other.folderPath)
      }
    }

    // 去重并排序
    const seen = new Set<string>()
    base.episodes = base.episodes
      .filter(e => { const k = e.filePath; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => a.epNumber - b.epNumber)

    merged.push(base)
  }

  return merged
}

/**
 * 清理文件夹名中的追番状态前缀
 * "完结 已追 春夏秋冬代行者 春之舞" → "春夏秋冬代行者 春之舞"
 */
const STATUS_PREFIXES = /^(?:完结|已?完结|已?追|未?追|在追|在播|未播|想追|想补|弃番|搁置|看过|已看|未看|没看|待看|补番)\s*/

/** 数字编号前缀：1、 2、 1. 01- 等手动排序编号 */
const NUMERIC_PREFIX = /^\d{1,2}[、，,.\-－]\s*/

/** 类型后缀：清理时保留原标题，这些只用于类型推断 */
const TYPE_SUFFIXES = /[\s]*[（(](?:剧场版|OVA|OAD|SP|特别篇|特典|番外)[)）]?$/

function cleanTitle(raw: string): string {
  let title = raw
  let prev = ''
  while (prev !== title) {
    prev = title
    title = title.replace(STATUS_PREFIXES, '')
    title = title.replace(NUMERIC_PREFIX, '')
  }
  // 去除末尾类型标记，但保留在 rawTitle 中供 inferSeriesType 使用
  title = title.replace(TYPE_SUFFIXES, '').trim()

  // 如果是 BD 压制组文件夹名，尝试提取真正的标题
  if (isBDFolder(title)) {
    const extracted = extractTitleFromBDFolder(title)
    if (extracted && extracted !== title) {
      title = extracted
    }
  }

  return title || raw.trim()
}

/**
 * 在指定目录中查找封面图片
 * 优先级：cover/poster/folder > 任意图片
 */
function findCoverImage(dir: string, entries: string[]): string | undefined {
  // 优先检查 .anibox/ 子目录（AniBox 下载的封面）
  const aniboxDir = join(dir, '.anibox')
  try {
    const aniboxEntries = readdirSync(aniboxDir)
    for (const entry of aniboxEntries) {
      if (IMAGE_EXTS.has(extname(entry).toLowerCase())) {
        return join(aniboxDir, entry)
      }
    }
  } catch { /* .anibox/ 不存在或无权限 */ }

  // 回退：在根目录找命名匹配的
  for (const name of COVER_NAMES) {
    for (const ext of IMAGE_EXTS) {
      const candidate = entries.find(e => {
        const base = e.replace(/\.[^.]+$/, '').toLowerCase()
        return base === name.toLowerCase() && extname(e).toLowerCase() === ext
      })
      if (candidate) return join(dir, candidate)
    }
  }
  // 回退：取第一个图片文件
  for (const entry of entries) {
    if (IMAGE_EXTS.has(extname(entry).toLowerCase())) {
      return join(dir, entry)
    }
  }
  return undefined
}

/**
 * 递归扫描目录，按子文件夹分组为番剧
 */
export function scanSeries(rootPath: string): SeriesInfo[] {
  const seriesMap = new Map<string, SeriesInfo>()

  function walk(dir: string, depth: number = 0): void {
    // MAX_PATH 警告：Windows 路径长度上限 260 字符
    if (process.platform === 'win32' && dir.length > 240) {
      console.warn('[AniBox] Long path detected (may cause errors):', dir.substring(0, 200) + '...')
    }

    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch (err: any) {
      console.warn('[AniBox] Cannot read directory:', dir, '-', err?.code || err?.message || err)
      return
    }

    // 收集当前目录的视频文件
    const videoFiles: string[] = []
    const seenInodes = new Set<number>()  // 去重符号链接/硬链接

    for (const entry of entries) {
      const fullPath = join(dir, entry)

      // 先用 lstat 检测符号链接，避免循环引用
      let lst: ReturnType<typeof lstatSync>
      try {
        lst = lstatSync(fullPath)
      } catch (err: any) {
        console.warn('[AniBox] Cannot stat:', fullPath, '-', err?.code || err?.message || err)
        continue
      }

      // 跳过符号链接（防止循环引用和重复扫描）
      if (lst.isSymbolicLink()) {
        console.log('[AniBox] Skipping symlink:', fullPath)
        continue
      }

      if (lst.isDirectory()) {
        // 跳过隐藏文件夹和系统文件夹
        if (entry.startsWith('.') || entry === '$RECYCLE.BIN' || entry === 'System Volume Information') continue
        // 跳过非番剧子目录（PV/menu/特典映像/SPs/CDs/Scans/Fonts 等）
        if (isNonSeriesDir(entry)) continue
        walk(fullPath, depth + 1)
      } else if (lst.isFile()) {
        // 检测硬链接（通过 inode），避免重复统计同一文件
        if (process.platform !== 'win32') {
          const ino = lst.ino
          if (seenInodes.has(ino)) continue
          seenInodes.add(ino)
        }
        const ext = extname(entry).toLowerCase()
        if (VIDEO_EXTS.has(ext)) {
          videoFiles.push(fullPath)
        }
      }
    }

    // 如果当前目录有视频文件，将其作为一个番剧
    if (videoFiles.length > 0) {
      const rawTitle = basename(dir)
      let title = cleanTitle(rawTitle)
      const folderPath = dir

      // BD 嵌套结构：当前目录是 BD 压制组文件夹，
      // 且父目录没有直接视频（是纯容器），尝试使用父目录的标题
      if (isBDFolder(rawTitle) && depth > 0) {
        const parentPath = join(dir, '..')
        const parentName = basename(parentPath)
        const parentHasSeries = seriesMap.has(parentPath)
        // 如果父目录没有系列条目（说明父目录没有直接视频文件）
        if (!parentHasSeries && !isBDFolder(parentName)) {
          const parentTitle = cleanTitle(parentName)
          if (parentTitle && parentTitle.length > 0) {
            // 1) 提取完全失败 → 用父标题
            if (title === rawTitle || title.length <= 2) {
              title = parentTitle
            }
            // 2) 父有中文而子无中文，且父不是多季容器 → 用父标题
            else if (/[\u4e00-\u9fff]/.test(parentTitle) && !/[\u4e00-\u9fff]/.test(title)) {
              // 检测父目录是否为多季容器（如 "Re：从零...第一季 第二季"）
              // 这类容器下的子目录各自有独立标题，不应统一用父名
              const isMultiSeasonContainer =
                /第[一二三四五六七八九十\d]+季.*第[一二三四五六七八九十\d]+季/.test(parentTitle) ||
                /Season\s*\d+.*Season\s*\d+/i.test(parentTitle)
              if (!isMultiSeasonContainer) {
                title = parentTitle
              }
            }
          }
        }
      }

      if (!seriesMap.has(folderPath)) {
        const coverPath = findCoverImage(dir, entries)
        seriesMap.set(folderPath, {
          title,
          folderPath,
          season: inferSeason(rawTitle),
          seriesType: inferSeriesType(rawTitle, videoFiles.map(f => basename(f))),
          episodes: [],
          coverPath
        })
      }

      const series = seriesMap.get(folderPath)!
      // 如果之前创建时的 title 不够好，现在更新
      if (title !== series.title && series.title === cleanTitle(rawTitle) && title !== rawTitle) {
        series.title = title
      }

      for (const filePath of videoFiles) {
        const fileName = basename(filePath)
        const epNumber = parseEpisodeNumber(fileName)
        const subtitleTracks = findSubtitles(filePath)
        // 避免重复添加
        if (!series.episodes.some(e => e.filePath === filePath)) {
          series.episodes.push({
            fileName, filePath, epNumber,
            subtitleTracks: subtitleTracks.length > 0 ? subtitleTracks : undefined
          })
        }
      }
    }
  }

  walk(rootPath)

  // 转为数组，按标题排序，话数按话号排序
  const result = Array.from(seriesMap.values())
  for (const series of result) {
    series.episodes.sort((a, b) => a.epNumber - b.epNumber)
  }
  result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))

  // 合并相似番剧（不同文件夹同番剧）
  const merged = mergeSimilarSeries(result)
  merged.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))

  return merged
}

/**
 * 智能发现：扫描一个大目录（如整个磁盘），自动识别哪些子目录可能是番剧库
 * 返回推荐的扫描根目录列表
 */
export function discoverAnimeRoots(basePath: string): string[] {
  const roots: string[] = []
  let entries: string[]
  try { entries = readdirSync(basePath) } catch { return roots }

  for (const entry of entries) {
    // 跳过系统和隐藏目录
    if (entry.startsWith('.') || entry === '$RECYCLE.BIN' || entry === 'System Volume Information') continue
    if (entry === '种子备份') continue  // 常见的非番剧目录

    const fullPath = join(basePath, entry)
    let lst
    try { lst = lstatSync(fullPath) } catch { continue }
    if (lst.isSymbolicLink() || !lst.isDirectory()) continue

    // 快速探测：看这个目录下是否有番剧特征
    const dirScore = scoreAnimeDirectory(fullPath)
    if (dirScore >= 2) {
      roots.push(fullPath)
    }
  }

  return roots
}

/**
 * 给目录打分，评估其作为番剧库的可能性
 *   +3 直接包含 >= 5 个视频文件
 *   +3 有 >= 3 个子目录包含视频
 *   +3 子目录名含年份/季度的模式（如 "23年10月新番"）
 *   +1 直接包含 >= 1 个视频文件
 *   +1 有 >= 1 个子目录包含视频
 */
function scoreAnimeDirectory(dir: string, depth: number = 0, maxDepth: number = 2): number {
  if (depth > maxDepth) return 0

  let entries: string[]
  try { entries = readdirSync(dir) } catch { return 0 }

  let score = 0
  let videoCount = 0
  let subWithVideos = 0

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    if (entry.startsWith('.') || entry === '$RECYCLE.BIN' || entry === 'System Volume Information') continue
    if (isNonSeriesDir(entry)) continue

    try {
      const lst = lstatSync(fullPath)
      if (lst.isSymbolicLink()) continue
      if (lst.isDirectory()) {
        const childScore = scoreAnimeDirectory(fullPath, depth + 1, maxDepth)
        if (childScore > 0) subWithVideos++
        score += childScore
      } else if (lst.isFile()) {
        if (VIDEO_EXTS.has(extname(entry).toLowerCase())) {
          videoCount++
        }
      }
    } catch { continue }
  }

  if (videoCount >= 5) score += 3
  else if (videoCount >= 1) score += 1

  if (subWithVideos >= 3) score += 3
  else if (subWithVideos >= 1) score += 1

  // 子目录名是年份/季度的模式 → 很强的番剧信号
  const yearSeasonCount = entries.filter(e => /\d{2}年\d{1,2}月新番/.test(e)).length
  if (yearSeasonCount >= 2) score += 3

  return score
}
