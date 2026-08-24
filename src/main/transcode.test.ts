/**
 * transcode 端到端测试（真实引擎：ffmpeg 或 mpv 编码器）
 * 验证 ensurePlayable remux 任务实际产出可播放缓存文件
 * 依赖 D:\VEDIO 下有视频；无文件时跳过
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { existsSync, statSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const TEST_DIR = join(tmpdir(), `anibox-tc-${randomUUID().slice(0, 8)}`)
mkdirSync(TEST_DIR, { recursive: true })
vi.mock('electron', () => ({
  app: { getPath: () => TEST_DIR },
}))

const { ensurePlayable, getStreamStatus, findFfmpeg, hasFfmpeg } = await import('./transcode')

const VIDEO = 'D:\\VEDIO\\Counter-Strike 2 - 2026-07-28 20-06-48.mp4'

describe.skipIf(!existsSync(VIDEO) || !hasFfmpeg())('transcode pipeline (real engine)', () => {
  afterAll(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('reports which engine is available', () => {
    const f = findFfmpeg()
    expect(f === null || typeof f === 'string').toBe(true)
    expect(hasFfmpeg()).toBe(true)
  })

  it('remuxes a real file into a cache mp4 (waits for completion, then cache)', async () => {
    // 体验策略：整集缓存完再播放（ensurePlayable 等待任务完成后返回 cache）
    const r = await ensurePlayable(VIDEO, 'remux')
    expect(r.kind).toBe('cache')
    expect(r.mode).toBe('remux')
    expect(existsSync(r.path as string)).toBe(true)
    // 二次调用命中缓存
    const r2 = await ensurePlayable(VIDEO, 'remux')
    expect(r2.kind).toBe('cache')
    expect(statSync(r2.path as string).size).toBeGreaterThan(1024)
  }, 180000)
})
