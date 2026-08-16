/**
 * store 模块单元测试
 * 通过 mock electron 避免依赖真实 app 环境
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { hashPath } from './utils/index'

// 在模块导入前准备好测试目录
const TEST_DIR = join(tmpdir(), `anibox-test-${randomUUID().slice(0, 8)}`)
mkdirSync(TEST_DIR, { recursive: true })

vi.mock('electron', () => ({
  app: { getPath: () => TEST_DIR },
}))

const storeModule = await import('./store')

afterAll(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('store CRUD', () => {
  beforeAll(() => {
    storeModule.clearAllSeriesAndEpisodes()
  })

  it('should create store file on flush', () => {
    storeModule.upsertSeries('/test/folder', 'Test Series', '/test/folder', 1, 'tv')
    storeModule.flushStore()
    expect(existsSync(join(TEST_DIR, 'anibox-store.json'))).toBe(true)
  })

  it('should save and retrieve multiple series', () => {
    storeModule.clearAllSeriesAndEpisodes()
    storeModule.upsertSeries('/anime/a', 'Anime A', '/anime/a', 1, 'tv')
    storeModule.upsertSeries('/anime/b', 'Anime B', '/anime/b', 2, 'movie')

    const all = storeModule.getAllSeries()
    expect(all.length).toBe(2)
    const titles = all.map((s) => s.title).sort()
    expect(titles).toEqual(['Anime A', 'Anime B'])
  })

  it('should handle episode CRUD', () => {
    storeModule.clearAllSeriesAndEpisodes()
    storeModule.upsertSeries('/anime/ep-series', 'Ep Anime', '/anime/ep-series', 1, 'tv')
    const seriesId = storeModule.getAllSeries()[0].id

    storeModule.clearEpisodesForSeries(seriesId)
    const fp1 = '/anime/ep-series/E01.mkv'
    const fp2 = '/anime/ep-series/E02.mkv'
    storeModule.upsertEpisode(hashPath(fp1), seriesId, 1, fp1, 'E01.mkv')
    storeModule.upsertEpisode(hashPath(fp2), seriesId, 2, fp2, 'E02.mkv')
    storeModule.flushStore()

    const eps = storeModule.getEpisodesBySeries(seriesId)
    expect(eps.length).toBe(2)
    expect(eps[0].epNumber).toBe(1)
    expect(eps[1].epNumber).toBe(2)
  })

  it('should save and load progress', () => {
    const filePath = '/anime/test-progress.mkv'
    storeModule.saveProgress(filePath, 250.5)
    storeModule.flushStore()

    const p = storeModule.loadProgress(filePath)
    expect(p).not.toBeNull()
    expect(p!.position).toBe(250.5)
  })

  it('should return null for unknown progress', () => {
    expect(storeModule.loadProgress('/never/saved.mkv')).toBeNull()
  })

  it('should handle skip times', () => {
    storeModule.clearAllSeriesAndEpisodes()
    storeModule.upsertSeries('/anime/skip', 'Skip Anime', '/anime/skip', 1, 'tv')
    const seriesId = storeModule.getAllSeries()[0].id

    storeModule.setSkipTimes(seriesId, {
      opStart: 0,
      opEnd: 90,
      edStart: 1320,
      edEnd: 1440,
    })
    storeModule.flushStore()

    const times = storeModule.getSkipTimes(seriesId)
    expect(times).not.toBeNull()
    expect(times!.opEnd).toBe(90)
    expect(times!.edStart).toBe(1320)
  })
})
