// === 弹幕 IPC ===
import { ipcMain, dialog, type BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import {
  fetchDanmakuForEpisode,
  cleanTitleForSearch,
  parseDanmakuFromFile,
  exportDanmakuToXML,
} from '../danmaku-fetcher'

export function registerDanmakuIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('danmaku:fetch', async (_e, animeTitle: string, episodeNumber: number) => {
    try {
      const items = await fetchDanmakuForEpisode(animeTitle, episodeNumber, (msg) => {
        getWin()?.webContents.send('danmaku:progress', { message: msg })
      })
      getWin()?.webContents.send('danmaku:progress', { message: '完成', count: items.length })
      return items
    } catch (err: any) {
      getWin()?.webContents.send('danmaku:progress', { message: '失败', error: err.message })
      return []
    }
  })

  ipcMain.handle('danmaku:cleanTitle', (_e, title: string) => {
    return cleanTitleForSearch(title)
  })

  ipcMain.handle('danmaku:import', (_e, filePath: string) => {
    return parseDanmakuFromFile(filePath)
  })

  ipcMain.handle('danmaku:export', async (_e, items: any[]) => {
    const win = getWin()
    if (!win) return false
    const now = new Date()
    const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`
    const r = await dialog.showSaveDialog(win, {
      title: '导出弹幕',
      defaultPath: `danmaku_${ts}.xml`,
      filters: [{ name: '弹幕XML', extensions: ['xml'] }],
    })
    if (r.canceled || !r.filePath) return false
    try {
      const xml = exportDanmakuToXML(items)
      writeFileSync(r.filePath, xml, 'utf-8')
      return true
    } catch {
      return false
    }
  })
}
