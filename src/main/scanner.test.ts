/**
 * scanner 模块单元测试 & 集成测试
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { scanSeries } from './scanner'

const TEST_ROOT = join(tmpdir(), `anibox-scanner-${randomUUID().slice(0, 8)}`)

// 创建测试目录结构
function setup() {
  mkdirSync(TEST_ROOT, { recursive: true })
}
function cleanup() {
  try {
    rmSync(TEST_ROOT, { recursive: true, force: true })
  } catch {
    /* */
  }
}
function touch(dir: string, name: string) {
  writeFileSync(join(dir, name), '')
}

afterAll(cleanup)

describe('scanner', () => {
  describe('episode number parsing', () => {
    it('should parse " - 11 " format', () => {
      setup()
      const dir = join(TEST_ROOT, 'Test Anime')
      mkdirSync(dir, { recursive: true })
      touch(dir, '[SubGroup] Test Anime - 01 [1080p].mkv')
      touch(dir, '[SubGroup] Test Anime - 12 [1080p].mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results.length).toBe(1)
      expect(results[0].episodes.length).toBe(2)
      expect(results[0].episodes.map((e) => e.epNumber).sort((a, b) => a - b)).toEqual([1, 12])
    })

    it('should parse "[01]" bracket format', () => {
      setup()
      const dir = join(TEST_ROOT, 'Bracket Anime')
      mkdirSync(dir, { recursive: true })
      touch(dir, '[VCB-Studio] Break Anime [01][Ma10p_1080p].mkv')
      touch(dir, '[VCB-Studio] Break Anime [08].mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results.length).toBe(1)
      expect(results[0].episodes.map((e) => e.epNumber).sort((a, b) => a - b)).toEqual([1, 8])
    })

    it('should parse "EP01" / "第01话" format', () => {
      setup()
      const dir = join(TEST_ROOT, 'EP Anime')
      mkdirSync(dir, { recursive: true })
      touch(dir, 'EP01.mkv')
      touch(dir, 'E02.mkv')
      touch(dir, '第03话.mp4')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results.length).toBe(1)
      expect(results[0].episodes.map((e) => e.epNumber).sort((a, b) => a - b)).toEqual([1, 2, 3])
    })
  })

  describe('season detection', () => {
    it('should detect Chinese season number', () => {
      setup()
      const dir = join(TEST_ROOT, '进击的巨人 第二季')
      mkdirSync(dir, { recursive: true })
      touch(dir, '[Sub] Shingeki 01.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results[0].season).toBe(2)
    })

    it('should detect Season N format', () => {
      setup()
      const dir = join(TEST_ROOT, 'Attack on Titan Season 3')
      mkdirSync(dir, { recursive: true })
      touch(dir, 'AoT S3 01.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results[0].season).toBe(3)
    })

    it('should default to season 1', () => {
      setup()
      const dir = join(TEST_ROOT, 'No Season Name')
      mkdirSync(dir, { recursive: true })
      touch(dir, 'video.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results[0].season).toBe(1)
    })
  })

  describe('series type detection', () => {
    it('should detect movies', () => {
      setup()
      const dir = join(TEST_ROOT, '铃芽之旅 剧场版')
      mkdirSync(dir, { recursive: true })
      touch(dir, 'Suzume 1080p.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results[0].seriesType).toBe('movie')
    })

    it('should detect OVA', () => {
      setup()
      const dir = join(TEST_ROOT, '某番 OVA')
      mkdirSync(dir, { recursive: true })
      touch(dir, 'OVA 01.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results[0].seriesType).toBe('ova')
    })

    it('should default to tv', () => {
      setup()
      const dir = join(TEST_ROOT, '普通的日常番')
      mkdirSync(dir, { recursive: true })
      touch(dir, 'Normal Anime 01.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results[0].seriesType).toBe('tv')
    })
  })

  describe('BD folder handling', () => {
    it('should handle BD folder nesting', () => {
      setup()
      const seriesDir = join(TEST_ROOT, '铃芽之旅')
      const bdDir = join(seriesDir, '[DBD-Raws][铃芽之旅][1080P][BDRip]')
      mkdirSync(bdDir, { recursive: true })
      touch(bdDir, '[DBD-Raws] Suzume - 01.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results.length).toBe(1)
      // Should use parent folder title, not the BD folder name
      expect(results[0].title).toBe('铃芽之旅')
    })
  })

  describe('non-series dir filtering', () => {
    it('should skip PV/menu/SP folders', () => {
      setup()
      const dir = join(TEST_ROOT, '某番')
      const pvDir = join(dir, 'PV')
      mkdirSync(pvDir, { recursive: true })
      touch(pvDir, 'pv.mkv')
      touch(dir, 'Episode 01.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      // PV folder should NOT create a separate series
      expect(results.length).toBe(1)
      expect(results[0].episodes.length).toBe(1)
    })
  })

  describe('cross-folder merging', () => {
    it('should merge similar titles from different folders', () => {
      setup()
      const dir1 = join(TEST_ROOT, 'Steins Gate')
      const dir2 = join(TEST_ROOT, 'Steins;Gate')
      mkdirSync(dir1, { recursive: true })
      mkdirSync(dir2, { recursive: true })
      touch(dir1, 'Steins 01.mkv')
      touch(dir2, 'Steins 02.mkv')

      const results = scanSeries(TEST_ROOT)
      cleanup()
      expect(results.length).toBe(1)
      expect(results[0].episodes.length).toBe(2)
    })
  })
})
