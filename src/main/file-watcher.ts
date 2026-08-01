import { FSWatcher, watch } from 'chokidar'
import { extname } from 'path'
import { scanSeries } from './scanner'
import * as store from './store'
import { hashPath, VIDEO_EXTS } from './utils'

const SUBTITLE_EXTS = new Set(['.ass', '.ssa', '.srt', '.vtt', '.sub', '.idx'])

type WatchCallback = (event: 'added' | 'removed' | 'changed', payload: {
  type: 'video' | 'subtitle' | 'unknown'
  path: string
  folderPath?: string
}) => void

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const pendingDirs = new Set<string>()

/**
 * 启动文件夹监控
 * 防抖 2 秒聚合变化后触发完整重新扫描
 */
export function startWatching(
  rootPath: string,
  onEvent?: WatchCallback
): void {
  stopWatching()

  watcher = watch(rootPath, {
    ignored: /(^|[\\/])\./,  // 忽略隐藏文件/目录
    persistent: true,
    depth: 10,
    ignoreInitial: true,     // 不触发初始扫描
    awaitWriteFinish: {
      stabilityThreshold: 3000,
      pollInterval: 500
    }
  })

  const scheduleRescan = (folderPath: string) => {
    pendingDirs.add(folderPath)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const dirs = [...pendingDirs]
      pendingDirs.clear()
      console.log('[AniBox] File watcher: rescanning after changes in', dirs.length, 'dir(s)')
      try {
        const result = scanSeries(rootPath)
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
        // 通知渲染进程刷新
        onEvent?.('changed', { type: 'video', path: rootPath, folderPath: rootPath })
      } catch (err) {
        console.error('[AniBox] Watcher rescan error:', err)
      }
    }, 2000)
  }

  watcher.on('add', (filePath: string) => {
    const ext = extname(filePath).toLowerCase()
    if (VIDEO_EXTS.has(ext)) {
      const folderPath = filePath.replace(/[/\\][^/\\]*$/, '')
      onEvent?.('added', { type: 'video', path: filePath, folderPath })
      scheduleRescan(folderPath)
    } else if (SUBTITLE_EXTS.has(ext)) {
      const folderPath = filePath.replace(/[/\\][^/\\]*$/, '')
      onEvent?.('added', { type: 'subtitle', path: filePath, folderPath })
      scheduleRescan(folderPath)
    }
  })

  watcher.on('unlink', (filePath: string) => {
    const ext = extname(filePath).toLowerCase()
    if (VIDEO_EXTS.has(ext) || SUBTITLE_EXTS.has(ext)) {
      const folderPath = filePath.replace(/[/\\][^/\\]*$/, '')
      onEvent?.('removed', { type: VIDEO_EXTS.has(ext) ? 'video' : 'subtitle', path: filePath, folderPath })
      scheduleRescan(folderPath)
    }
  })

  console.log('[AniBox] File watcher started:', rootPath)
}

/**
 * 停止监控
 */
export function stopWatching(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  pendingDirs.clear()
  console.log('[AniBox] File watcher stopped')
}

/**
 * 获取监控状态
 */
export function getWatcherStatus(): {
  active: boolean
  watchingPath?: string
} {
  return {
    active: watcher !== null,
    watchingPath: (watcher as any)?._settings?.cwd
  }
}
