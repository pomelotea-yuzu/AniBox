// === 媒体库 IPC：扫描 / 系列 / 收藏 / 播放列表 / 追番 ===
import { ipcMain, dialog, type BrowserWindow } from 'electron'
import { scanSeries, discoverAnimeRoots } from '../scanner'
import * as store from '../store'
import { hashPath } from '../utils'

export function registerLibraryIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('dialog:openFolder', async () => {
    const win = getWin()
    if (!win) return null
    const r = await dialog.showOpenDialog(win, {
      title: '选择番剧目录',
      properties: ['openDirectory'],
    })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })

  ipcMain.handle('scanner:scan', (_e, root: string) => {
    try {
      store.clearAllSeriesAndEpisodes()
      const result = scanSeries(root)
      for (const s of result) {
        const seriesId = hashPath(s.folderPath)
        store.upsertSeries(seriesId, s.title, s.folderPath, s.season, s.seriesType, s.coverPath)
        store.clearEpisodesForSeries(seriesId)
        for (const ep of s.episodes) {
          const episodeId = hashPath(ep.filePath)
          store.upsertEpisode(episodeId, seriesId, ep.epNumber, ep.filePath, ep.fileName)
        }
        store.updateSeriesTotalEps(seriesId, s.episodes.length)
      }
      return result
    } catch (err) {
      console.error('[AniBox] Scanner error:', err)
      return []
    }
  })

  // === 多根扫描 ===
  ipcMain.handle('scanRoots:get', () => store.getScanRoots())

  ipcMain.handle('scanRoots:add', (_e, root: string) => {
    store.addScanRoot(root)
    return store.getScanRoots()
  })

  ipcMain.handle('scanRoots:remove', (_e, root: string) => {
    store.removeScanRoot(root)
    return store.getScanRoots()
  })

  ipcMain.handle('scanRoots:setAll', (_e, roots: string[]) => {
    store.setScanRoots(roots)
    return roots
  })

  // 扫描所有根目录，合并结果（先全部扫描完成，再统一替换旧数据）
  ipcMain.handle('scanRoots:scanAll', async () => {
    const roots = store.getScanRoots()
    const allResults: any[] = []
    const seenFolderPaths = new Set<string>()

    // 第一阶段：扫描所有根目录，收集结果（不触碰旧数据）
    for (const root of roots) {
      try {
        const result = scanSeries(root)
        for (const s of result) {
          if (seenFolderPaths.has(s.folderPath)) continue
          seenFolderPaths.add(s.folderPath)
          allResults.push(s)
        }
      } catch (err) {
        console.error(
          '[AniBox] Scan root error:',
          root,
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    // 第二阶段：确认收集完毕后再清除旧数据并写入新数据
    store.clearAllSeriesAndEpisodes()
    for (const s of allResults) {
      const seriesId = hashPath(s.folderPath)
      store.upsertSeries(seriesId, s.title, s.folderPath, s.season, s.seriesType, s.coverPath)
      store.clearEpisodesForSeries(seriesId)
      for (const ep of s.episodes) {
        const episodeId = hashPath(ep.filePath)
        store.upsertEpisode(episodeId, seriesId, ep.epNumber, ep.filePath, ep.fileName)
      }
      store.updateSeriesTotalEps(seriesId, s.episodes.length)
    }

    return allResults
  })

  // 智能发现番剧目录
  ipcMain.handle('discover:scan', (_e, basePath: string) => {
    try {
      return discoverAnimeRoots(basePath)
    } catch (err) {
      console.error('[AniBox] Discover error:', err)
      return []
    }
  })

  // 手动修正番剧标题
  ipcMain.handle('series:updateTitle', (_e, folderPath: string, newTitle: string) => {
    const seriesId = hashPath(folderPath)
    const s = store.getSeriesById(seriesId)
    if (s) {
      store.upsertSeries(
        seriesId,
        newTitle,
        folderPath,
        s.season,
        s.seriesType || 'tv',
        s.coverPath,
      )
    }
  })

  ipcMain.handle('series:getProgress', (_e, folderPath: string) => {
    return store.getSeriesProgress(hashPath(folderPath))
  })

  ipcMain.handle('series:setStatus', (_e, folderPath: string, status: string) => {
    store.updateSeriesStatus(hashPath(folderPath), status)
  })

  // OP/ED 跳过时间（双点区间）
  ipcMain.handle('series:getSkipTimes', (_e, folderPath: string) => {
    return store.getSkipTimes(hashPath(folderPath))
  })

  ipcMain.handle(
    'series:setSkipTimes',
    (
      _e,
      folderPath: string,
      times: { opStart: number; opEnd: number; edStart: number; edEnd: number },
    ) => {
      store.setSkipTimes(hashPath(folderPath), times)
    },
  )

  // 系列列表（含 metadata）
  ipcMain.handle('series:getAll', () => {
    const series = store.getAllSeries()
    const metadata = store.getAllMetadata()
    return series.map((s) => ({
      ...s,
      metadata: metadata[s.id] || null,
    }))
  })

  // ===== 收藏 =====
  ipcMain.handle('favorites:getAll', () => store.getFavorites())
  ipcMain.handle('favorites:toggle', (_e, seriesId: string) => store.toggleFavorite(seriesId))
  ipcMain.handle('favorites:isFavorited', (_e, seriesId: string) => store.isFavorited(seriesId))

  // ===== 播放列表 =====
  ipcMain.handle('playlists:getAll', () => store.getPlaylists())
  ipcMain.handle('playlists:create', (_e, name: string) => store.createPlaylist(name))
  ipcMain.handle('playlists:delete', (_e, id: string) => store.deletePlaylist(id))
  ipcMain.handle('playlists:addSeries', (_e, listId: string, seriesId: string) => {
    store.addToPlaylist(listId, seriesId)
  })
  ipcMain.handle('playlists:removeSeries', (_e, listId: string, seriesId: string) => {
    store.removeFromPlaylist(listId, seriesId)
  })

  // ===== 追番同步 =====
  ipcMain.handle(
    'tracking:sync',
    async (_e, anilistId: number, bangumiId: number, status: string, watchedEpisodes: number) => {
      try {
        // 同步到 AniList（需要 OAuth token，此处为框架）
        if (anilistId > 0) {
          // TODO: 实现 AniList OAuth 流程
          console.log('[AniBox] Would sync to AniList:', anilistId, status, watchedEpisodes)
        }
        // 同步到 Bangumi
        if (bangumiId > 0) {
          // TODO: 实现 Bangumi OAuth 流程
          console.log('[AniBox] Would sync to Bangumi:', bangumiId, status, watchedEpisodes)
        }
        return true
      } catch {
        return false
      }
    },
  )
}
