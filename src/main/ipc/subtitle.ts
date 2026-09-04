// === 字幕 / 音轨 / 播放设置 IPC ===
import { ipcMain, type BrowserWindow } from 'electron'
import { readSubtitleAsVtt, findSubtitles } from '../subtitle'
import {
  searchOnlineSubtitles,
  downloadSubtitle,
  getOpenSubtitlesStatus,
  setOpenSubtitlesConfig,
} from '../online-subtitle'
import * as store from '../store'

export function registerSubtitleIpc(_getWin: () => BrowserWindow | null): void {
  // 字幕：读取并转换为 VTT
  ipcMain.handle('subtitle:readVtt', (_e, filePath: string) => {
    try {
      return readSubtitleAsVtt(filePath)
    } catch (err) {
      console.error('[AniBox] subtitle read error:', err)
      return ''
    }
  })

  // 字幕：重新扫描当前视频的字幕
  ipcMain.handle('subtitle:rescan', (_e, videoPath: string) => {
    try {
      return findSubtitles(videoPath)
    } catch (err) {
      console.error('[AniBox] subtitle rescan error:', err)
      return []
    }
  })

  // 在线字幕搜索
  ipcMain.handle(
    'subtitle:searchOnline',
    async (
      _e,
      query: {
        title: string
        episode?: number
        videoPath?: string
        preferredLanguages?: string[]
      },
    ) => {
      try {
        return await searchOnlineSubtitles(query)
      } catch (err) {
        console.error('[AniBox] online subtitle search error:', err)
        return []
      }
    },
  )

  // 在线字幕下载
  ipcMain.handle('subtitle:download', async (_e, result: any, videoPath: string) => {
    try {
      return await downloadSubtitle(result, videoPath)
    } catch (err) {
      console.error('[AniBox] subtitle download error:', err)
      return null
    }
  })

  // OpenSubtitles 配置
  ipcMain.handle('subtitle:getOSStatus', () => {
    return getOpenSubtitlesStatus()
  })

  ipcMain.handle('subtitle:setOSConfig', (_e, apiKey: string, userAgent?: string) => {
    setOpenSubtitlesConfig(apiKey, userAgent)
  })

  // 音轨偏好
  ipcMain.handle('audio:getPrefs', (_e, seriesId: string) => {
    return store.getAudioPrefs(seriesId)
  })

  ipcMain.handle(
    'audio:setPrefs',
    (
      _e,
      seriesId: string,
      prefs: {
        audioIndex: number
        audioDelay: number
        language?: string
      },
    ) => {
      store.setAudioPrefs(seriesId, prefs)
    },
  )

  ipcMain.handle('audio:getGlobalPrefs', () => {
    return store.getGlobalAudioPrefs()
  })

  // 字幕样式
  ipcMain.handle('subtitle:getStyle', () => {
    return store.getSubtitleStyle()
  })

  ipcMain.handle('subtitle:setStyle', (_e, style: any) => {
    store.setSubtitleStyle(style)
  })

  // 全局播放偏好（设置页「播放」tab）
  ipcMain.handle('settings:getPlayback', () => {
    return store.getPlaybackSettings()
  })

  ipcMain.handle('settings:setPlayback', (_e, settings: any) => {
    store.setPlaybackSettings(settings)
  })
}
