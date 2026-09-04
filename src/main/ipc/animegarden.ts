// === AnimeGarden 资源搜索 / RSS / qBittorrent 联动 IPC ===
import { ipcMain } from 'electron'
import {
  searchAnimeGarden,
  listTeams,
  getQbConfig,
  setQbConfig,
  qbTestConnection,
  qbAddTorrent,
  qbAddRssFeed,
  qbAddRssRule,
  qbRemoveRssRule,
  createRssFeed,
  listRssFeeds,
  deleteRssFeed,
} from '../animegarden'

export function registerAnimegardenIpc(): void {
  // AnimeGarden 资源搜索
  ipcMain.handle('animegarden:search', (_e, params: any) => searchAnimeGarden(params || {}))

  // 字幕组列表（GET /teams，1h 缓存）
  ipcMain.handle('animegarden:teams', () => listTeams())

  // 本地 RSS 订阅代理
  ipcMain.handle('animegarden:createFeed', (_e, cfg: any) => createRssFeed(cfg || {}))
  ipcMain.handle('animegarden:listFeeds', () => listRssFeeds())
  ipcMain.handle('animegarden:deleteFeed', (_e, id: string) => {
    deleteRssFeed(id)
    return true
  })

  // qBittorrent 联动
  ipcMain.handle('qb:getConfig', () => getQbConfig())
  ipcMain.handle('qb:setConfig', (_e, cfg: any) => {
    setQbConfig(cfg)
    return true
  })
  ipcMain.handle('qb:test', (_e, cfg?: any) => qbTestConnection(cfg || {}))
  ipcMain.handle('qb:addTorrent', (_e, magnet: string, savepath?: string) =>
    qbAddTorrent(magnet, savepath),
  )
  ipcMain.handle('qb:addRss', (_e, feedUrl: string, path?: string) => qbAddRssFeed(feedUrl, path))
  ipcMain.handle('qb:addRule', (_e, ruleName: string, opts: any) =>
    qbAddRssRule(ruleName, opts || {}),
  )
  ipcMain.handle('qb:removeRule', (_e, ruleName: string) => qbRemoveRssRule(ruleName))
}
