/**
 * video-probe 端到端测试（真实 mpv.exe + 真实视频文件）
 * 验证：mpv IPC 探测链路（spawn → named pipe → loadfile → track-list）
 * 依赖 D:\VEDIO 下有视频；无文件或 mpv 缺失时跳过
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { probeFile, getMpvPath } from './video-probe'

const VIDEOS = ['D:\\VEDIO\\Counter-Strike 2 - 2026-07-28 20-06-48.mp4']

describe.skipIf(!existsSync(getMpvPath()) || !existsSync(VIDEOS[0]))(
  'video probe (real mpv)',
  () => {
    it('probes an mp4 file and returns codec info', async () => {
      const r = await probeFile(VIDEOS[0])
      expect(r).not.toBeNull()
      expect(r!.videoCodec.length).toBeGreaterThan(0)
      expect(r!.videoWidth).toBeGreaterThan(0)
      expect(r!.duration).toBeGreaterThan(0)
    })

    it('caches repeated probes', async () => {
      const a = await probeFile(VIDEOS[0])
      const b = await probeFile(VIDEOS[0])
      expect(a).toEqual(b)
    })
  },
)
