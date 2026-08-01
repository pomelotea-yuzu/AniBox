/**
 * 共享工具函数 — 从多个模块中提取的重复代码
 * 来源: scanner.ts / cover-fetcher.ts / metadata-fetcher.ts / danmaku-fetcher.ts
 */
import { readdirSync } from 'fs'
import { extname } from 'path'
import { createHash } from 'crypto'

// ============================================================
//  通用工具
// ============================================================

/** 对路径/字符串做 MD5 哈希（用作存储 key） */
export function hashPath(p: string): string {
  return createHash('md5').update(p).digest('hex')
}

// ============================================================
//  常量
// ============================================================

/** 支持的视频文件扩展名 */
export const VIDEO_EXTS = new Set([
  '.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.ts', '.m2ts', '.rmvb', '.wmv',
  '.m4v', '.3gp', '.3g2', '.asf', '.divx', '.f4v', '.mpeg', '.mpg', '.mpe', '.ogv',
  '.ogm', '.qt', '.vob', '.evo', '.mts', '.mxf', '.rm', '.ogg'
])

// ============================================================
//  Levenshtein 距离
// ============================================================

/** 计算两个字符串的 Levenshtein 编辑距离（1D 数组优化版） */
export function levenshtein(a: string, b: string): number {
  const m = a.length; const n = b.length
  if (m === 0) return n; if (n === 0) return m

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 0; i < m; i++) {
    let prev = dp[0]
    dp[0] = i + 1
    for (let j = 0; j < n; j++) {
      const temp = dp[j + 1]
      dp[j + 1] = a[i] === b[j]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j + 1])
      prev = temp
    }
  }
  return dp[n]
}

// ============================================================
//  标题相似度（基于 Levenshtein，0-1）
// ============================================================

/** 合并相似番剧的默认阈值 */
export const SIMILARITY_THRESHOLD = 0.85

/**
 * 计算两个标题的相似度 (0-1)
 * 对分隔符做了归一化处理
 */
export function titleSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().replace(/[\s\-_.:：·・]+/g, ' ').trim()
  const s2 = b.toLowerCase().replace(/[\s\-_.:：·・]+/g, ' ').trim()
  if (s1 === s2) return 1
  if (!s1 || !s2) return 0

  const len = Math.max(s1.length, s2.length)
  if (len === 0) return 1

  return 1 - levenshtein(s1, s2) / len
}

// ============================================================
//  文件名中提取标题（去掉标签/话数/编码等）
// ============================================================

/**
 * 从文件名中提取 romaji 标题
 * 去掉方括号标签、圆括号标签、话数标记、季号标记等
 */
export function extractTitleFromFilename(fileName: string): string {
  let name = fileName
  name = name.replace(/\.[^.]+$/, '')
  name = name.replace(/\[[^\]]*\]/g, '')
  name = name.replace(/\([^)]*\)/g, '')
  name = name.replace(/[−-]\s*\d{1,3}(?:\s|\[|v\d|$)/g, '')
  name = name.replace(/(?:第|EP|E|#)\s*\d{1,3}/gi, '')
  name = name.replace(/\b(?:v\d|OVA|SP|NC)\b/gi, '')
  name = name.replace(/\bSeason\s*\d+\b/gi, '')
  name = name.replace(/\bS\d+\b/gi, '')
  name = name.replace(/\s+/g, ' ').trim()
  return name
}

// ============================================================
//  从文件夹提取 romaji 标题（统计最频繁的文件名前缀）
// ============================================================

/**
 * 扫描文件夹中的所有视频文件，从文件名提取 romaji 标题，
 * 统计出现频率最高的前 3 个作为搜索候选项
 */
export function extractRomajiFromFolder(folderPath: string): string[] {
  try {
    const entries = readdirSync(folderPath)
    const titles = new Map<string, number>()

    for (const entry of entries) {
      try {
        if (VIDEO_EXTS.has(extname(entry).toLowerCase())) {
          const extracted = extractTitleFromFilename(entry)
          if (extracted.length >= 2 && /[a-zA-Z]/.test(extracted)) {
            titles.set(extracted, (titles.get(extracted) || 0) + 1)
          }
        }
      } catch { /* skip corrupted filename */ }
    }

    return Array.from(titles.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([title]) => title)
  } catch {
    return []
  }
}
