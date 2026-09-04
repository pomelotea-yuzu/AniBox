// === 视频 / 播放进度 / 截图 IPC ===
import { ipcMain, dialog, type BrowserWindow } from 'electron'
import { statSync, writeFileSync } from 'fs'
import * as store from '../store'
import { parseMP4Meta, detectAudioCodec } from '../video-info'
import { detectSubtitlesViaMpv } from '../mpv-backend'

/** 所有支持的视频扩展名（供 dialog 过滤使用） */
const ALL_VIDEO_EXTS = [
  'mp4',
  'mkv',
  'webm',
  'avi',
  'mov',
  'flv',
  'ts',
  'm2ts',
  'rmvb',
  'wmv',
  'm4v',
  '3gp',
  '3g2',
  'asf',
  'divx',
  'f4v',
  'mpeg',
  'mpg',
  'mpe',
  'ogv',
  'ogm',
  'qt',
  'vob',
  'evo',
  'mts',
  'mxf',
  'rm',
  'ogg',
]

export function registerVideoIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('dialog:openFile', async () => {
    const win = getWin()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, {
      title: '选择视频',
      filters: [
        { name: '视频', extensions: ALL_VIDEO_EXTS },
        { name: '所有', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (r.canceled || !r.filePaths.length) return null
    const filePath = r.filePaths[0]
    const saved = store.loadProgress(filePath)
    return { filePath, savedPosition: saved?.position ?? 0 }
  })

  ipcMain.handle('progress:getRecent', () => {
    return store.getRecentProgress(10)
  })

  ipcMain.handle('video:load', (_e, p: string) => {
    const saved = store.loadProgress(p)
    return { filePath: p, savedPosition: saved?.position ?? 0 }
  })

  ipcMain.handle('video:getInfo', (_e, p: string) => {
    try {
      const st = statSync(p)
      // 尝试容器解析拿精确视频码率
      let videoMeta: { width: number; height: number; codec: string; exactBitrate: number } | null =
        null
      if (p.toLowerCase().endsWith('.mp4')) {
        videoMeta = parseMP4Meta(p)
      }
      return {
        size: st.size,
        mtime: st.mtimeMs,
        ctime: st.ctimeMs,
        videoMeta,
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('video:checkAudio', (_e, p: string) => {
    try {
      if (!p.toLowerCase().endsWith('.mp4')) return { codec: 'unknown', supported: true }
      const info = detectAudioCodec(p)
      return info || { codec: 'unknown', supported: true }
    } catch {
      return { codec: 'unknown', supported: true }
    }
  })

  // 批量检测音频编码（连播时一次性检测整部番，避免逐集重复检测导致的「跳一下」）
  ipcMain.handle('video:checkAudioBatch', (_e, paths: string[]) => {
    const result: Record<string, { codec: string; supported: boolean }> = {}
    for (const p of paths) {
      try {
        if (!p.toLowerCase().endsWith('.mp4')) {
          result[p] = { codec: 'unknown', supported: true }
          continue
        }
        const info = detectAudioCodec(p)
        result[p] = info || { codec: 'unknown', supported: true }
      } catch {
        result[p] = { codec: 'unknown', supported: true }
      }
    }
    return result
  })

  // 通过 mpv 检测内封字幕（解决 Chromium 不暴露 ASS/SSA/PGS 字幕轨道的问题）
  ipcMain.handle('video:detectEmbeddedSubtitles', (_e, p: string) => {
    return detectSubtitlesViaMpv(p)
  })

  ipcMain.handle('playback:savePosition', (_e, filePath: string, position: number) => {
    store.saveProgress(filePath, position)
  })

  ipcMain.handle('playback:getPosition', (_e, filePath: string) => {
    const saved = store.loadProgress(filePath)
    return saved?.position ?? 0
  })

  // 截图保存
  ipcMain.handle('screenshot:save', async (_e, dataUrl: string) => {
    const win = getWin()
    if (!win) return false
    const now = new Date()
    const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
    const r = await dialog.showSaveDialog(win, {
      title: '保存截图',
      defaultPath: `AniBox_${ts}.png`,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    })
    if (r.canceled || !r.filePath) return false
    try {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      writeFileSync(r.filePath, Buffer.from(base64, 'base64'))
      return true
    } catch (err) {
      console.error('[AniBox] screenshot save error:', err)
      return false
    }
  })
}
