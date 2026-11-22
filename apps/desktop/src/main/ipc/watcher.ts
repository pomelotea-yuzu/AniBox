// === 文件监控 IPC ===
import { ipcMain, type BrowserWindow } from 'electron'
import { startWatching, stopWatching, getWatcherStatus } from '../file-watcher'

export function registerWatcherIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('watcher:start', (_e, rootPath: string) => {
    startWatching(rootPath, (event, payload) => {
      getWin()?.webContents.send('watcher:event', { event, ...payload })
    })
  })

  ipcMain.handle('watcher:stop', () => {
    stopWatching()
  })

  ipcMain.handle('watcher:status', () => {
    return getWatcherStatus()
  })
}
