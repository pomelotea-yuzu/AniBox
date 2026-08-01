import { readFileSync, readdirSync } from 'fs'
import { extname, join, dirname, basename } from 'path'

/**
 * 字幕轨道描述
 */
export interface SubtitleTrack {
  label: string
  language: string
  filePath: string
  type: 'external'
}

/**
 * 支持的副文本扩展名
 */
const SUBTITLE_EXTS = new Set(['.ass', '.ssa', '.srt', '.vtt', '.sub', '.idx'])

// ========== 集数提取（复用 scanner 逻辑） ==========

function extractEpisodeNumber(fileName: string): number {
  const base = fileName.replace(/\.[^.]+$/, '')
  // 模式 1: " - 11 " 或 " - 11["
  const m1 = base.match(/[−-]\s*(\d{1,4})(?:\s|\[|v|$)/)
  if (m1) return parseInt(m1[1], 10)
  // 模式 2: "[01]" 取最后一个方括号数字
  const bracketNums = [...base.matchAll(/\[(\d{1,4})\]/g)]
  if (bracketNums.length > 0) {
    const last = bracketNums[bracketNums.length - 1]
    const num = parseInt(last[1], 10)
    if (num > 0 && num <= 9999) return num
  }
  // 模式 3: "第01话" "EP01" "E01" "#01"
  const m3 = base.match(/(?:第|EP|E|#)\s*(\d{1,4})/i)
  if (m3) return parseInt(m3[1], 10)
  // 模式 4: 末尾孤立数字
  const m4 = base.match(/[^\d](\d{1,4})$/)
  if (m4) return parseInt(m4[1], 10)
  return 0
}

/**
 * 从视频文件路径提取集号（复用 scanner 中已解析的 epNumber）
 * 如果无法提取，回退到文件名解析
 */
export function getVideoEpisodeNumber(videoPath: string): number {
  const name = basename(videoPath)
  return extractEpisodeNumber(name)
}

/**
 * 从文件名猜测语言和标签
 */
function guessLang(fileBase: string): { lang: string; label: string } {
  const lower = fileBase.toLowerCase()
  // 检查语言标记: video.zh.ass, video.chs.ass, video.en.srt, etc.
  const parts = lower.split('.')
  // 取最后一段扩展名之前的标记
  const tags = parts.slice(0, -1) // remove ext
  const lastTag = tags[tags.length - 1] || ''

  if (
    ['chs', 'sc', 'zh-cn', 'zh-hans', 'gb', '简中', '简体'].some(
      (t) => lastTag === t || lower.includes(`.${t}.`),
    )
  )
    return { lang: 'zh-CN', label: '简体中文' }
  if (
    ['cht', 'tc', 'zh-tw', 'zh-hant', 'big5', '繁中', '繁体'].some(
      (t) => lastTag === t || lower.includes(`.${t}.`),
    )
  )
    return { lang: 'zh-TW', label: '繁體中文' }
  if (['zh', 'chi', 'chinese', '中文'].some((t) => lastTag === t || lower.includes(`.${t}.`)))
    return { lang: 'zh', label: '中文' }
  if (
    ['en', 'eng', 'english', '英文', '英语'].some((t) => lastTag === t || lower.includes(`.${t}.`))
  )
    return { lang: 'en', label: 'English' }
  if (
    ['ja', 'jp', 'jpn', 'japanese', '日语', '日文'].some(
      (t) => lastTag === t || lower.includes(`.${t}.`),
    )
  )
    return { lang: 'ja', label: '日本語' }
  if (
    ['ko', 'kr', 'kor', 'korean', '韩语', '韩文'].some(
      (t) => lastTag === t || lower.includes(`.${t}.`),
    )
  )
    return { lang: 'ko', label: '한국어' }

  return { lang: '', label: '字幕' }
}

/**
 * 检测视频文件同目录下及附近目录的字幕文件
 * 支持三种匹配策略：
 *   1. 同名前缀匹配（如 video.chs.ass）
 *   2. 集号匹配（字幕和视频文件名不同但集号相同）
 *   3. 父目录/字幕子目录搜索
 */
export function findSubtitles(videoPath: string): SubtitleTrack[] {
  const videoDir = dirname(videoPath)
  const videoBase = basename(videoPath)
  const videoName = videoBase.replace(/\.[^.]+$/, '')
  const videoEp = extractEpisodeNumber(videoBase)

  const tracks: SubtitleTrack[] = []
  const seen = new Set<string>() // 去重

  function addTrack(filePath: string): void {
    const key = filePath.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const entryBase = basename(filePath).replace(/\.[^.]+$/, '')
    const { lang, label } = guessLang(entryBase)
    tracks.push({ label, language: lang, filePath, type: 'external' })
  }

  function scanDir(dir: string, useEpisodeMatch: boolean): void {
    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        const ext = extname(entry).toLowerCase()
        if (!SUBTITLE_EXTS.has(ext)) continue

        const entryBase = entry.replace(/\.[^.]+$/, '')
        const fullPath = join(dir, entry)

        // 策略 1: 同名前缀匹配
        if (entryBase === videoName || entryBase.startsWith(videoName + '.')) {
          addTrack(fullPath)
          continue
        }

        // 策略 2: 集号匹配（仅当 videoEp > 0 时启用）
        if (useEpisodeMatch && videoEp > 0) {
          const subEp = extractEpisodeNumber(entry)
          if (subEp === videoEp) {
            addTrack(fullPath)
          }
        }
      }
    } catch {
      /* 忽略 */
    }
  }

  // 策略 1+2: 扫描视频同目录
  scanDir(videoDir, true)

  // 策略 3: 扫描父目录（当视频在子目录中时，字幕可能在父目录）
  const parentDir = dirname(videoDir)
  if (parentDir !== videoDir && parentDir !== '.') {
    scanDir(parentDir, true)
  }

  // 策略 3b: 扫描常见字幕子目录
  for (const subDirName of ['subs', 'subtitles', '字幕', 'Subs', 'Subtitles']) {
    const subDir = join(videoDir, subDirName)
    try {
      scanDir(subDir, true)
    } catch {
      /* 忽略 */
    }
  }

  // 策略 3c: 父目录下的字幕子目录
  if (parentDir !== videoDir) {
    for (const subDirName of ['subs', 'subtitles', '字幕', 'Subs', 'Subtitles']) {
      const subDir = join(parentDir, subDirName)
      try {
        scanDir(subDir, true)
      } catch {
        /* 忽略 */
      }
    }
  }

  return tracks
}

// ========== SRT → VTT 转换 ==========

function srtToVtt(content: string): string {
  // 移除 BOM
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)

  let vtt = 'WEBVTT\n\n'

  const blocks = content.trim().split(/\n\s*\n/)
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue

    // 跳过序号行，找时间戳行
    let tsLine = ''
    let textLines: string[] = []
    for (const line of lines) {
      if (line.includes('-->')) {
        tsLine = line
      } else if (tsLine && line.trim()) {
        textLines.push(line.trim())
      }
    }

    if (!tsLine) continue

    // 转换时间戳: 逗号 → 小数点
    const vttTs = tsLine.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    vtt += vttTs + '\n'
    vtt += textLines.join('\n') + '\n\n'
  }

  return vtt
}

// ========== ASS/SSA → VTT 转换 ==========

function assToVtt(content: string): string {
  // 移除 BOM
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)

  // 查找 [Events] 段
  const eventsMatch = content.match(/\[Events\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/i)
  if (!eventsMatch) return 'WEBVTT\n\n'

  const eventsSection = eventsMatch[1]

  // 解析 Format 行获取列索引
  const formatMatch = eventsSection.match(/Format:\s*(.+)/i)
  if (!formatMatch) return 'WEBVTT\n\n'

  const columns = formatMatch[1].split(',').map((c) => c.trim().toLowerCase())
  const startIdx = columns.indexOf('start')
  const endIdx = columns.indexOf('end')
  const textIdx = columns.indexOf('text')

  if (startIdx < 0 || endIdx < 0 || textIdx < 0) return 'WEBVTT\n\n'

  // 解析所有 Dialogue 行
  const dialogueLines = eventsSection.match(/^Dialogue:\s*(.+)$/gim)
  if (!dialogueLines || dialogueLines.length === 0) return 'WEBVTT\n\n'

  let vtt = 'WEBVTT\n\n'

  for (const line of dialogueLines) {
    const content_ = line.replace(/^Dialogue:\s*/i, '')
    // 按逗号分割（注意 Text 列可能包含逗号）
    const parts = splitAssDialogue(content_, textIdx)

    const start = parts[startIdx]?.trim() || ''
    const end = parts[endIdx]?.trim() || ''
    let text = parts[textIdx]?.trim() || ''

    if (!start || !end || !text) continue

    // 转换 ASS 时间格式: H:MM:SS.cc → HH:MM:SS.mmm
    const vttStart = assTimeToVtt(start)
    const vttEnd = assTimeToVtt(end)
    if (!vttStart || !vttEnd) continue

    // 清理 ASS 样式标签 {\xxx}
    text = text.replace(/\{[^}]*\}/g, '')
    // 转换 \N 为实际换行
    text = text.replace(/\\N|\\n/g, '\n')
    // 转换 ASS 斜体/粗体标签
    text = text.replace(/<i>/g, '<i>').replace(/<\/i>/g, '</i>')
    text = text.replace(/<b>/g, '<b>').replace(/<\/b>/g, '</b>')
    text = text.replace(/<u>/g, '<u>').replace(/<\/u>/g, '</u>')

    if (!text.trim()) continue

    vtt += `${vttStart} --> ${vttEnd}\n${text}\n\n`
  }

  return vtt
}

function splitAssDialogue(line: string, textColumnIdx: number): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '{') {
      depth++
      current += ch
    } else if (ch === '}') {
      depth--
      current += ch
    } else if (ch === ',' && depth === 0 && parts.length < textColumnIdx) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

function assTimeToVtt(assTime: string): string | null {
  // ASS 格式: H:MM:SS.cc (如 0:01:23.45)
  const match = assTime.match(/^(-?\d+):(\d{2}):(\d{2})\.(\d{2,3})$/)
  if (!match) return null

  let hours = parseInt(match[1], 10)
  const minutes = match[2]
  const seconds = match[3]
  let centiseconds = match[4]

  // 处理负时间戳（某些 ASS 文件有）
  if (hours < 0) hours = 0

  // 补全毫秒
  if (centiseconds.length === 2) centiseconds += '0'

  return `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}.${centiseconds}`
}

// ========== 对外接口 ==========

/**
 * 读取字幕文件，返回 VTT 格式内容
 */
export function readSubtitleAsVtt(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const raw = readFileSync(filePath, 'utf-8')

  switch (ext) {
    case '.srt':
      return srtToVtt(raw)
    case '.ass':
    case '.ssa':
      return assToVtt(raw)
    case '.vtt':
      // VTT 不需要转换，直接返回
      return raw
    default:
      return raw.startsWith('WEBVTT') ? raw : srtToVtt(raw)
  }
}

export { SUBTITLE_EXTS }
