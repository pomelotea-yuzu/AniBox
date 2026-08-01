/**
 * src/main/utils 工具函数单元测试
 */
import { describe, it, expect } from 'vitest'
import {
  hashPath,
  VIDEO_EXTS,
  levenshtein,
  titleSimilarity,
  extractTitleFromFilename,
} from '../utils/index'

describe('hashPath', () => {
  it('should return a 32-char hex string', () => {
    const result = hashPath('/some/path')
    expect(result).toHaveLength(32)
    expect(/^[a-f0-9]+$/.test(result)).toBe(true)
  })

  it('should produce consistent results for same input', () => {
    expect(hashPath('hello')).toBe(hashPath('hello'))
  })

  it('should produce different results for different inputs', () => {
    expect(hashPath('hello')).not.toBe(hashPath('world'))
  })
})

describe('VIDEO_EXTS', () => {
  it('should contain common video extensions', () => {
    expect(VIDEO_EXTS.has('.mp4')).toBe(true)
    expect(VIDEO_EXTS.has('.mkv')).toBe(true)
    expect(VIDEO_EXTS.has('.avi')).toBe(true)
    expect(VIDEO_EXTS.has('.flv')).toBe(true)
    expect(VIDEO_EXTS.has('.rmvb')).toBe(true)
  })

  it('should not contain non-video extensions', () => {
    expect(VIDEO_EXTS.has('.txt')).toBe(false)
    expect(VIDEO_EXTS.has('.jpg')).toBe(false)
    expect(VIDEO_EXTS.has('.ass')).toBe(false)
  })
})

describe('levenshtein', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0)
  })

  it('should return the length of the other string when one is empty', () => {
    expect(levenshtein('', 'hello')).toBe(5)
    expect(levenshtein('world', '')).toBe(5)
  })

  it('should compute correct distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('saturday', 'sunday')).toBe(3)
    expect(levenshtein('abc', 'yabd')).toBe(2)
  })

  it('should be symmetric', () => {
    expect(levenshtein('abc', 'def')).toBe(levenshtein('def', 'abc'))
  })
})

describe('titleSimilarity', () => {
  it('should return 1 for identical titles', () => {
    expect(titleSimilarity('鬼灭之刃', '鬼灭之刃')).toBe(1)
  })

  it('should ignore separators (spaces, dashes, etc.)', () => {
    expect(titleSimilarity('Full Metal Alchemist', 'Full-Metal:Alchemist')).toBeCloseTo(1, 1)
  })

  it('should return high similarity for close titles', () => {
    const sim = titleSimilarity('進撃の巨人', '進撃の巨人')
    expect(sim).toBe(1)
  })

  it('should be lower when one title has extra content', () => {
    const sim = titleSimilarity('進撃の巨人', '進撃の巨人 Season 1')
    // Similarity should be moderate since "Season 1" is appended
    expect(sim).toBeGreaterThan(0.3)
    expect(sim).toBeLessThan(0.9)
  })

  it('should return low similarity for different titles', () => {
    const sim = titleSimilarity('鬼灭之刃', '進撃の巨人')
    expect(sim).toBeLessThan(0.3)
  })

  it('should return 0 when one string is empty', () => {
    expect(titleSimilarity('', 'hello')).toBe(0)
    expect(titleSimilarity('world', '')).toBe(0)
  })

  it('should be case-insensitive', () => {
    expect(titleSimilarity('DEMON SLAYER', 'demon slayer')).toBe(1)
  })
})

describe('extractTitleFromFilename', () => {
  it('should remove file extension', () => {
    expect(extractTitleFromFilename('Kimetsu no Yaiba [01].mkv')).toContain('Kimetsu')
    expect(extractTitleFromFilename('Shingeki 01.mp4')).not.toContain('.mp4')
  })

  it('should remove bracket tags', () => {
    const result = extractTitleFromFilename('[VCB-Studio] Kimetsu no Yaiba [01][Ma10p_1080p].mkv')
    expect(result).not.toContain('VCB-Studio')
    expect(result).not.toContain('Ma10p')
  })

  it('should remove parenthesis tags', () => {
    const result = extractTitleFromFilename('Kimetsu no Yaiba (BD 1920x1080) [01].mkv')
    expect(result).not.toContain('BD')
    expect(result).not.toContain('1920x1080')
  })

  it('should remove episode numbers', () => {
    const result = extractTitleFromFilename('Kimetsu EP 01 [1080p].mkv')
    expect(result).not.toMatch(/\b01\b/)
  })

  it('should preserve the core title', () => {
    const result = extractTitleFromFilename('[SubsPlease] Shingeki no Kyojin - 01 (1080p).mkv')
    expect(result).toContain('Shingeki')
  })
})
