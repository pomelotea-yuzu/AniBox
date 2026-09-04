// === 封面爬取 IPC ===
import { ipcMain, type BrowserWindow } from 'electron'
import { fetchCoversBatch, fetchCoverManual } from '../cover-fetcher'

export function registerCoverIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle(
    'cover:fetchBatch',
    async (_e, series: Array<{ title: string; folderPath: string }>) => {
      const result = await fetchCoversBatch(series, (cur, total, title, ok, status) => {
        getWin()?.webContents.send('cover:progress', { current: cur, total, title, ok, status })
      })
      return result
    },
  )

  // 手动搜索封面
  ipcMain.handle('cover:fetchManual', async (_e, folderPath: string, searchQuery: string) => {
    const result = await fetchCoverManual(folderPath, searchQuery)
    return result ? true : false
  })
}
