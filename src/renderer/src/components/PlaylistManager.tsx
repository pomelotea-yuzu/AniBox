/**
 * PlaylistManager — 播放列表管理面板
 * 左侧滑出面板：创建/删除播放列表、添加/移除番剧、按列表筛选
 */
import { useState, useEffect, useCallback, useRef } from 'react'

interface Playlist {
  id: string
  name: string
  seriesIds: string[]
  createdAt: string
}

interface PlaylistManagerProps {
  visible: boolean
  onClose: () => void
  currentSeriesId?: string  // 当前选中的番剧 ID
  onSelectPlaylist?: (seriesIds: string[]) => void  // 筛选广播墙
  onClearFilter?: () => void
}

export default function PlaylistManager({
  visible, onClose, currentSeriesId, onSelectPlaylist, onClearFilter
}: PlaylistManagerProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [newName, setNewName] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [seriesCounts, setSeriesCounts] = useState<Record<string, number>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  // 加载播放列表
  const loadPlaylists = useCallback(async () => {
    try {
      const lists = await window.electronAPI.playlistsGetAll()
      setPlaylists(lists)
      // 并行加载每个播放列表的番剧数量
      const counts: Record<string, number> = {}
      for (const list of lists) {
        counts[list.id] = list.seriesIds.length
      }
      setSeriesCounts(counts)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (visible) loadPlaylists()
  }, [visible, loadPlaylists])

  // 创建播放列表
  const handleCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name || name.length > 20) return
    try {
      await window.electronAPI.playlistsCreate(name)
      setNewName('')
      loadPlaylists()
    } catch { /* ignore */ }
  }, [newName, loadPlaylists])

  // 删除播放列表
  const handleDelete = useCallback(async (id: string) => {
    try {
      await window.electronAPI.playlistsDelete(id)
      if (activeFilter === id) { setActiveFilter(null); onClearFilter?.() }
      loadPlaylists()
    } catch { /* ignore */ }
  }, [activeFilter, loadPlaylists, onClearFilter])

  // 添加番剧到列表
  const handleAddSeries = useCallback(async (listId: string) => {
    if (!currentSeriesId) return
    try {
      await window.electronAPI.playlistsAddSeries(listId, currentSeriesId)
      loadPlaylists()
      // 刷新当前筛选
      if (activeFilter === listId) {
        const lists = await window.electronAPI.playlistsGetAll()
        const found = lists.find((l: Playlist) => l.id === listId)
        if (found) onSelectPlaylist?.(found.seriesIds)
      }
    } catch { /* ignore */ }
  }, [currentSeriesId, activeFilter, loadPlaylists, onSelectPlaylist])

  // 移除番剧
  const handleRemoveSeries = useCallback(async (listId: string) => {
    if (!currentSeriesId) return
    try {
      await window.electronAPI.playlistsRemoveSeries(listId, currentSeriesId)
      loadPlaylists()
    } catch { /* ignore */ }
  }, [currentSeriesId, loadPlaylists])

  // 按列表筛选
  const handleFilter = useCallback(async (list: Playlist) => {
    if (activeFilter === list.id) {
      setActiveFilter(null)
      onClearFilter?.()
    } else {
      setActiveFilter(list.id)
      onSelectPlaylist?.(list.seriesIds)
    }
  }, [activeFilter, onSelectPlaylist, onClearFilter])

  // 键盘：Enter 创建
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') onClose()
  }, [handleCreate, onClose])

  if (!visible) return null

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* 侧边栏 */}
      <div className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-anibox-surface border-r border-anibox-border shadow-xl flex flex-col animate-slide-in">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-anibox-border">
          <h3 className="text-sm font-semibold text-anibox-text">播放列表</h3>
          <button
            onClick={onClose}
            className="text-anibox-text-muted hover:text-anibox-text transition-colors text-xs px-1"
          >
            ✕
          </button>
        </div>

        {/* 创建区 */}
        <div className="px-4 py-2 border-b border-anibox-border/50">
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="新建播放列表..."
              maxLength={20}
              className="flex-1 px-2 py-1 text-xs bg-anibox-bg border border-anibox-border rounded
                text-anibox-text placeholder-anibox-text-muted/50 outline-none
                focus:border-anibox-accent/60 transition-colors"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-2 py-1 text-xs bg-anibox-accent text-white rounded hover:bg-anibox-accent-hover
                disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              创建
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {playlists.length === 0 ? (
            <p className="text-xs text-anibox-text-muted text-center py-8">
              暂无播放列表
            </p>
          ) : (
            playlists.map(list => {
              const isFiltered = activeFilter === list.id
              const count = seriesCounts[list.id] ?? list.seriesIds.length
              const hasCurrent = currentSeriesId && list.seriesIds.includes(currentSeriesId)

              return (
                <div
                  key={list.id}
                  className={`group flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors
                    ${isFiltered
                      ? 'bg-anibox-accent/15 border border-anibox-accent/30'
                      : 'hover:bg-anibox-bg/60 border border-transparent'
                    }`}
                >
                  {/* 名称 + 数量 */}
                  <button
                    onClick={() => handleFilter(list)}
                    className="flex-1 text-left min-w-0"
                  >
                    <span className="text-anibox-text truncate block">{list.name}</span>
                    <span className="text-[10px] text-anibox-text-muted">{count} 部番剧</span>
                  </button>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {currentSeriesId && (
                      hasCurrent ? (
                        <button
                          onClick={() => handleRemoveSeries(list.id)}
                          className="text-[10px] text-red-400 hover:text-red-500 px-1"
                          title="移除此番剧"
                        >
                          −
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddSeries(list.id)}
                          className="text-[10px] text-anibox-accent hover:text-anibox-accent-hover px-1"
                          title="添加当前番剧"
                        >
                          +
                        </button>
                      )
                    )}
                    <button
                      onClick={() => handleDelete(list.id)}
                      className="text-[10px] text-anibox-text-muted hover:text-red-400 px-1"
                      title="删除列表"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 底部提示 */}
        {activeFilter && (
          <div className="px-4 py-2 border-t border-anibox-border bg-anibox-accent/5">
            <button
              onClick={() => { setActiveFilter(null); onClearFilter?.() }}
              className="text-[11px] text-anibox-accent hover:text-anibox-accent-hover"
            >
              ← 清除筛选，显示全部
            </button>
          </div>
        )}
      </div>

      {/* 滑入动画 */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>
    </>
  )
}
