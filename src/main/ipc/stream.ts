// === 串流 / 存储 / 应用信息 IPC ===
import { ipcMain, app, shell, type BrowserWindow } from 'electron'
import {
  startStreamServer,
  stopStreamServer,
  getStreamServerState,
} from '../stream-server'
import { cleanStreamCache, getStreamCacheSizeMB, getEngineInfo, resetFfmpegDownload } from '../transcode'
import { getStorageInfo, clearCacheDir } from '../storage-info'
import * as store from '../store'

export function registerStreamIpc(_getWin: () => BrowserWindow | null): void {
  // ===== 局域网串流 =====
  ipcMain.handle('stream:getSettings', () => {
    const s = store.getStreamSettings()
    return { ...s, state: getStreamServerState() }
  })

  ipcMain.handle('stream:setSettings', async (_e, patch: any) => {
    const prev = store.getStreamSettings()
    store.setStreamSettings(patch)
    const cur = store.getStreamSettings()
    // 端口/开关变化时重启服务器（token 变化无需重启，校验实时读 store）
    const restartNeeded = patch.port !== undefined || patch.enabled !== undefined
    if (restartNeeded) {
      stopStreamServer()
      if (cur.enabled) await startStreamServer({ port: cur.port })
    }
    return {
      ...cur,
      state: getStreamServerState(),
      changed: prev.port !== cur.port || prev.enabled !== cur.enabled,
    }
  })

  ipcMain.handle('stream:getState', () => getStreamServerState())

  // 主题同步：渲染进程切换主题时通知主进程（串流网页注入时跟随主应用）
  ipcMain.handle('stream:syncTheme', (_e, theme: string) => {
    if (typeof theme === 'string' && theme) store.setStreamSettings({ theme })
    return store.getStreamSettings().theme
  })

  ipcMain.handle('stream:cacheInfo', () => {
    return { cacheMB: getStreamCacheSizeMB() }
  })

  ipcMain.handle('stream:cacheClean', (_e, maxMB: number) => {
    return cleanStreamCache(maxMB || 2048)
  })

  ipcMain.handle('stream:engineInfo', () => {
    return getEngineInfo()
  })

  ipcMain.handle('stream:ffmpegRetry', () => {
    resetFfmpegDownload()
    return getEngineInfo()
  })

  // ===== 存储信息（设置页「存储」tab） =====
  ipcMain.handle('storage:getInfo', () => getStorageInfo())

  ipcMain.handle('storage:clearCache', (_e, key: string) => clearCacheDir(key))

  ipcMain.handle('storage:openPath', (_e, p: string) => {
    if (!p) return false
    shell.openPath(p).catch(() => {})
    return true
  })

  // 应用版本信息（关于页显示；与 package.json version 同步）
  ipcMain.handle('app:getVersion', () => {
    return { version: app.getVersion(), electron: process.versions.electron }
  })
}
