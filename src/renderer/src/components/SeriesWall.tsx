import { useEffect, useState, useCallback, useMemo } from 'react'
import type { SeriesInfo } from '../../../main/scanner'
import SeriesCard from './SeriesCard'
import ThemeSwitcher from './ThemeSwitcher'
import PlaylistManager from './PlaylistManager'

interface SeriesWallProps {
  seriesList: SeriesInfo[]
  selectedId: string | null
  onSelect: (series: SeriesInfo) => void
  scanRoots: string[]
  onAddRoot: () => void
  onRemoveRoot: (root: string) => void
  onSmartDiscover: () => void
  onRefresh: () => Promise<void>
}

interface FailedItem {
  title: string
  folderPath: string
  manualQuery: string
}

export default function SeriesWall({
  seriesList,
  selectedId,
  onSelect,
  scanRoots,
  onAddRoot,
  onRemoveRoot,
  onSmartDiscover,
  onRefresh,
}: SeriesWallProps) {
  const [progressMap, setProgressMap] = useState<Record<string, number>>({})
  const [scraping, setScraping] = useState(false)
  const [scrapeProgress, setScrapeProgress] = useState({
    current: 0,
    total: 0,
    title: '',
    status: '',
  })
  const [failedList, setFailedList] = useState<FailedItem[]>([])

  // 筛选排序
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [sortBy, setSortBy] = useState('title')
  const [sortAsc, setSortAsc] = useState(true)
  const [metadataMap, setMetadataMap] = useState<Record<string, any>>({})
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  // 播放列表
  const [showPlaylists, setShowPlaylists] = useState(false)
  const [playlistFilter, setPlaylistFilter] = useState<Set<string> | null>(null)

  // AniList 标题校验
  interface TitleSuggestion {
    folderPath: string
    currentTitle: string
    suggestedTitle: string
    anilistId: number
    confidence: number
    reason: string
  }
  const [validating, setValidating] = useState(false)
  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const handleValidateTitles = useCallback(async () => {
    setValidating(true)
    try {
      const series = seriesList.map((s) => ({ folderPath: s.folderPath, title: s.title }))
      const result = await window.electronAPI.validateTitles(series)
      if (result.length > 0) {
        setSuggestions(result)
        setShowSuggestions(true)
      } else {
        alert('所有标题已是最佳，无需修改')
      }
    } catch (err) {
      console.error('[AniBox] Validation error:', err)
      alert('校验失败，请检查网络连接')
    } finally {
      setValidating(false)
    }
  }, [seriesList])

  const handleAcceptSuggestion = useCallback(
    async (folderPath: string, newTitle: string, index: number) => {
      try {
        await window.electronAPI.updateTitle(folderPath, newTitle)
        setSuggestions((prev) => prev.filter((_, i) => i !== index))
        // 如果全部处理完了，关闭弹窗并刷新
        if (suggestions.length <= 1) {
          setShowSuggestions(false)
          onRefresh()
        }
      } catch {
        /* skip */
      }
    },
    [suggestions.length, onRefresh],
  )

  const handleRejectSuggestion = useCallback(
    (index: number) => {
      setSuggestions((prev) => prev.filter((_, i) => i !== index))
      if (suggestions.length <= 1) {
        setShowSuggestions(false)
      }
    },
    [suggestions.length],
  )

  const handleAcceptAll = useCallback(async () => {
    for (const sug of suggestions) {
      try {
        await window.electronAPI.updateTitle(sug.folderPath, sug.suggestedTitle)
      } catch {
        /* skip */
      }
    }
    setSuggestions([])
    setShowSuggestions(false)
    onRefresh()
  }, [suggestions, onRefresh])

  // 加载收藏列表
  useEffect(() => {
    window.electronAPI
      .favoritesGetAll()
      .then((ids) => setFavorites(new Set(ids)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const map: Record<string, number> = {}
      for (const s of seriesList) {
        if (cancelled) break
        try {
          const p = await window.electronAPI.getSeriesProgress(s.folderPath)
          map[s.folderPath] = p.watched
        } catch {
          map[s.folderPath] = 0
        }
      }
      if (!cancelled) setProgressMap(map)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [seriesList])

  // 加载元数据
  useEffect(() => {
    const load = async () => {
      const map: Record<string, any> = {}
      for (const s of seriesList) {
        try {
          const meta = await window.electronAPI.getMetadata(s.folderPath)
          if (meta) map[s.folderPath] = meta
        } catch {
          /* ignore */
        }
      }
      setMetadataMap(map)
    }
    load()
  }, [seriesList])

  // 筛选 + 排序
  const visibleSeries = useMemo(
    () =>
      seriesList
        .filter((s) => {
          if (playlistFilter && !playlistFilter.has(s.folderPath)) return false
          if (search) {
            const q = search.toLowerCase()
            const meta = metadataMap[s.folderPath]
            const matchTitle = s.title.toLowerCase().includes(q)
            const matchCn = meta?.titleCn?.toLowerCase().includes(q)
            const matchEn = meta?.titleEn?.toLowerCase().includes(q)
            if (!matchTitle && !matchCn && !matchEn) return false
          }
          if (filterType !== 'all' && s.seriesType !== filterType) return false
          if (showFavoritesOnly && !favorites.has(s.folderPath)) return false
          return true
        })
        .sort((a, b) => {
          const ma = metadataMap[a.folderPath]
          const mb = metadataMap[b.folderPath]
          let cmp = 0
          switch (sortBy) {
            case 'title':
              cmp = a.title.localeCompare(b.title, 'zh-CN')
              break
            case 'rating':
              cmp = (mb?.rating || 0) - (ma?.rating || 0)
              break
            case 'year':
              cmp = (mb?.year || 0) - (ma?.year || 0)
              break
            case 'eps':
              cmp = b.episodes.length - a.episodes.length
              break
          }
          return sortAsc ? cmp : -cmp
        }),
    [
      seriesList,
      search,
      filterType,
      sortBy,
      sortAsc,
      metadataMap,
      playlistFilter,
      showFavoritesOnly,
      favorites,
    ],
  )

  // 封面 + 元数据进度监听（统一）
  useEffect(() => {
    const unsub1 = window.electronAPI.onCoverProgress((data) => {
      setScrapeProgress((prev) => ({
        ...data,
        status: data.ok ? '✓封面' : data.status || '',
        current: prev.current || data.current,
        total: prev.total || data.total,
      }))
    })
    const unsub2 = window.electronAPI.onMetadataProgress((data) => {
      setScrapeProgress((prev) => ({
        current: data.current,
        total: data.total,
        title: data.title,
        status: data.ok
          ? prev.status
            ? `${prev.status} ✓元数据`
            : '✓元数据'
          : data.status || '搜索中...',
        ok: data.ok,
      }))
    })
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  // 统一刮削：先获取元数据（含封面），再补齐遗漏的封面
  const handleScrapeAll = useCallback(async () => {
    setScraping(true)
    setFailedList([])
    setScrapeProgress({ current: 0, total: seriesList.length, title: '', status: '准备中...' })
    try {
      const data = seriesList.map((s) => ({
        title: s.title,
        folderPath: s.folderPath,
        season: s.season,
      }))
      await window.electronAPI.fetchMetadataBatch(data)
      await onRefresh()
      // 强制重新加载元数据（确保使用最新翻译结果）
      const newMap: Record<string, any> = {}
      for (const s of seriesList) {
        try {
          const meta = await window.electronAPI.getMetadata(s.folderPath)
          if (meta) newMap[s.folderPath] = meta
        } catch {
          /* ignore */
        }
      }
      setMetadataMap(newMap)
    } catch (e) {
      console.error('[AniBox] Scrape error:', e)
    } finally {
      setScraping(false)
    }
  }, [seriesList, onRefresh])

  const handleManualSearch = useCallback(async (item: FailedItem) => {
    if (!item.manualQuery.trim()) return
    setFetching(true)
    const ok = await window.electronAPI.fetchManualCover(item.folderPath, item.manualQuery.trim())
    if (ok) {
      setFailedList((prev) => prev.filter((f) => f.folderPath !== item.folderPath))
      await onRefresh()
    }
    setFetching(false)
  }, [])

  const handleManualQueryChange = useCallback((folderPath: string, value: string) => {
    setFailedList((prev) =>
      prev.map((f) => (f.folderPath === folderPath ? { ...f, manualQuery: value } : f)),
    )
  }, [])

  return (
    <div className="flex flex-col h-full bg-anibox-bg">
      {/* 扫描根目录管理栏 */}
      {scanRoots.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-1.5 bg-anibox-surface/50 border-b border-anibox-border/50 shrink-0 overflow-x-auto">
          <span className="text-[10px] text-anibox-text-muted mr-1 shrink-0">扫描目录:</span>
          {scanRoots.map((root) => {
            const short = root.length > 40 ? '...' + root.slice(-37) : root
            return (
              <span
                key={root}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-anibox-surface border border-anibox-border rounded shrink-0"
                title={root}
              >
                <span className="max-w-[200px] truncate">{short}</span>
                <button
                  onClick={() => onRemoveRoot(root)}
                  className="text-anibox-text-muted hover:text-red-400 ml-0.5"
                  title="移除"
                >
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-3 px-4 py-2 bg-anibox-surface border-b border-anibox-border shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-anibox-text-muted">
            {scanRoots.length === 0 ? '请添加扫描目录' : `共 ${seriesList.length} 部番剧`}
          </p>
        </div>
        <span className="text-xs text-anibox-text-muted whitespace-nowrap">
          {seriesList.length} 部
        </span>
        <div className="h-5 w-px bg-anibox-border/60" />
        <ThemeSwitcher />
        <div className="h-5 w-px bg-anibox-border/60" />
        <button
          onClick={() => setShowPlaylists(true)}
          className={`px-2.5 py-1.5 text-xs rounded-lg transition-all duration-150 active:scale-95 flex items-center gap-1.5 border ${
            playlistFilter
              ? 'text-anibox-accent border-anibox-accent/40 bg-anibox-border/30'
              : 'text-anibox-text-muted border-anibox-border hover:text-anibox-accent hover:border-anibox-accent/40 hover:bg-anibox-border/30'
          }`}
          title="播放列表"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          播放列表
        </button>
        <div className="h-5 w-px bg-anibox-border/60" />
        <button
          onClick={handleScrapeAll}
          disabled={scraping || seriesList.length === 0}
          className="px-2.5 py-1.5 text-xs text-anibox-text-muted hover:text-anibox-accent hover:bg-anibox-border/30 rounded-lg transition-all duration-150 active:scale-95
            flex items-center gap-1.5 border border-anibox-border hover:border-anibox-accent/40
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          title="从 AniList/Bangumi 获取封面、评分、年份、简介、Staff"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {scraping
            ? scrapeProgress.total > 0
              ? `${scrapeProgress.title || '...'} (${scrapeProgress.current}/${scrapeProgress.total})`
              : '获取中...'
            : '获取番剧信息'}
        </button>
        <button
          onClick={handleValidateTitles}
          disabled={validating || seriesList.length === 0}
          className="px-2.5 py-1.5 text-xs text-anibox-text-muted rounded-lg transition-all duration-150 active:scale-95
            flex items-center gap-1.5 border border-anibox-border
            hover:text-anibox-accent hover:border-anibox-accent/40 hover:bg-anibox-border/30
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          title="用 AniList 校验标题"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
          </svg>
          {validating ? '校验中...' : '校验标题'}
        </button>
      </div>

      {/* 标题校验建议弹窗 */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowSuggestions(false)}
        >
          <div
            className="bg-anibox-surface border border-anibox-border rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-anibox-border shrink-0">
              <h3 className="text-sm font-medium text-anibox-text">
                AniList 标题建议 ({suggestions.length})
              </h3>
              <button
                onClick={handleAcceptAll}
                className="px-3 py-1 text-xs bg-anibox-accent hover:bg-anibox-accent-hover text-white rounded transition-colors"
              >
                全部接受
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
              {suggestions.map((sug, i) => (
                <div
                  key={sug.folderPath}
                  className="flex items-start gap-3 p-3 bg-anibox-bg rounded-lg border border-anibox-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-anibox-text-muted mb-1">当前</p>
                    <p className="text-xs text-anibox-text-muted line-through">
                      {sug.currentTitle}
                    </p>
                    <p className="text-[11px] text-anibox-text-muted mt-2 mb-1">
                      建议 <span className="text-anibox-accent">({sug.reason})</span>
                    </p>
                    <p className="text-sm text-anibox-text font-medium">{sug.suggestedTitle}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-anibox-text-muted">
                        置信度 {(sug.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => handleAcceptSuggestion(sug.folderPath, sug.suggestedTitle, i)}
                      className="px-3 py-1 text-xs bg-anibox-accent hover:bg-anibox-accent-hover text-white rounded transition-colors"
                    >
                      接受
                    </button>
                    <button
                      onClick={() => handleRejectSuggestion(i)}
                      className="px-3 py-1 text-xs text-anibox-text-muted hover:text-anibox-text border border-anibox-border rounded transition-colors"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-anibox-border shrink-0 flex justify-end">
              <button
                onClick={() => setShowSuggestions(false)}
                className="px-4 py-1.5 text-xs text-anibox-text-muted hover:text-anibox-text border border-anibox-border rounded transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {scraping && scrapeProgress.total > 0 && (
        <div className="px-4 py-2 bg-anibox-surface/50 border-b border-anibox-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border border-anibox-accent border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-xs text-anibox-text-muted whitespace-nowrap">
              {scrapeProgress.current}/{scrapeProgress.total}
            </span>
            <span className="text-xs text-anibox-text truncate" title={scrapeProgress.title}>
              {scrapeProgress.title || '搜索中...'}
            </span>
            <span className="text-xs text-anibox-accent/60 shrink-0">{scrapeProgress.status}</span>
          </div>
          <div className="mt-1.5 h-1 bg-anibox-accent/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-anibox-accent rounded-full transition-all duration-300"
              style={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {!scraping && failedList.length > 0 && (
        <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/10 shrink-0 max-h-40 overflow-y-auto">
          <p className="text-xs text-amber-400/80 mb-2">
            以下番剧自动获取失败，请输入英文/romaji 名称手动搜索：
          </p>
          <div className="flex flex-wrap gap-2">
            {failedList.map((item) => (
              <div key={item.folderPath} className="flex items-center gap-1.5">
                <span
                  className="text-xs text-anibox-text-muted truncate max-w-[120px]"
                  title={item.title}
                >
                  {item.title}
                </span>
                <input
                  type="text"
                  value={item.manualQuery}
                  onChange={(e) => handleManualQueryChange(item.folderPath, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleManualSearch(item)
                  }}
                  placeholder="英文名..."
                  className="w-28 px-1.5 py-0.5 text-xs bg-anibox-surface border border-anibox-border rounded
                    text-anibox-text placeholder:text-anibox-text-muted focus:border-anibox-accent outline-none"
                />
                <button
                  onClick={() => handleManualSearch(item)}
                  disabled={!item.manualQuery.trim()}
                  className="px-1.5 py-0.5 text-xs bg-anibox-accent/20 text-anibox-accent rounded
                    hover:bg-anibox-accent/30 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  搜索
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 筛选排序栏 */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-anibox-surface/50 border-b border-anibox-border/50 shrink-0 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索番剧..."
          className="w-36 px-2 py-1 text-xs bg-anibox-bg border border-anibox-border rounded
            text-anibox-text placeholder:text-anibox-text-muted focus:border-anibox-accent outline-none"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-2 py-1 text-xs bg-anibox-bg border border-anibox-border rounded
            text-anibox-text outline-none focus:border-anibox-accent"
        >
          <option value="all">全部类型</option>
          <option value="tv">TV</option>
          <option value="movie">剧场版</option>
          <option value="ova">OVA</option>
          <option value="special">特别篇</option>
        </select>
        <button
          onClick={() => setShowFavoritesOnly((prev) => !prev)}
          className={`px-2 py-1 text-xs rounded border transition-colors ${
            showFavoritesOnly
              ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5'
              : 'text-anibox-text-muted border-transparent hover:border-anibox-border'
          }`}
        >
          ★ 收藏
        </button>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-2 py-1 text-xs bg-anibox-bg border border-anibox-border rounded
            text-anibox-text outline-none focus:border-anibox-accent"
        >
          <option value="title">按标题</option>
          <option value="rating">按评分</option>
          <option value="year">按年份</option>
          <option value="eps">按集数</option>
        </select>
        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="px-1.5 py-1 text-xs text-anibox-text-muted hover:text-anibox-text border border-anibox-border rounded"
          title={sortAsc ? '升序' : '降序'}
        >
          {sortAsc ? '↑' : '↓'}
        </button>
        <span className="text-[10px] text-anibox-text-muted ml-auto">
          {visibleSeries.length}/{seriesList.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {visibleSeries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-anibox-text-muted">
            <p className="text-sm">
              {seriesList.length === 0 ? '该目录下未找到番剧' : '没有匹配的番剧'}
            </p>
            <p className="text-xs">
              {seriesList.length === 0 ? '请选择包含番剧子文件夹的目录' : '尝试修改筛选条件'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visibleSeries.map((s) => (
              <SeriesCard
                key={s.folderPath}
                series={s}
                selected={selectedId === s.folderPath}
                watched={progressMap[s.folderPath] || 0}
                onClick={() => onSelect(s)}
                isFavorited={favorites.has(s.folderPath)}
                onToggleFavorite={() => {
                  window.electronAPI.favoritesToggle(s.folderPath).then((added) => {
                    setFavorites((prev) => {
                      const next = new Set(prev)
                      if (added) next.add(s.folderPath)
                      else next.delete(s.folderPath)
                      return next
                    })
                  })
                }}
              />
            ))}
          </div>
        )}
      </div>

      <PlaylistManager
        visible={showPlaylists}
        onClose={() => setShowPlaylists(false)}
        currentSeriesId={selectedId || undefined}
        onSelectPlaylist={(ids) => setPlaylistFilter(new Set(ids))}
        onClearFilter={() => setPlaylistFilter(null)}
      />
    </div>
  )
}
