import { useState, useCallback, useRef, useEffect } from 'react'
import type { SeriesInfo, EpisodeInfo } from '../../main/scanner'
import Player from './components/Player'
import MpvOverlay from './components/MpvOverlay'
import SeriesWall from './components/SeriesWall'
import EpisodeList from './components/EpisodeList'
import EmptyState from './components/EmptyState'
import ErrorBoundary from './components/ErrorBoundary'
import SettingsModal from './components/SettingsModal'
import SeasonCalendar from './components/SeasonCalendar'
import SearchAnimePage from './components/SearchAnimePage'

type View = 'empty' | 'loading' | 'wall' | 'episodes' | 'player' | 'season' | 'search'
type PlayMode = 'sequential' | 'loop-one' | 'loop-all' | 'shuffle'

export default function App() {
  const [view, setView] = useState<View>('loading')
  const [scanRoots, setScanRoots] = useState<string[]>([])
  const [seriesList, setSeriesList] = useState<SeriesInfo[]>([])
  const [selectedSeries, setSelectedSeries] = useState<SeriesInfo | null>(null)
  const [currentVideo, setCurrentVideo] = useState<{
    filePath: string
    mediaUrl: string
    savedPosition: number
  } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mpvFallback, setMpvFallback] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [seriesMetadata, setSeriesMetadata] = useState<any>(null)
  const [playMode, setPlayMode] = useState<PlayMode>('sequential')

  const playbackRef = useRef({ position: 0, duration: 0, isPlaying: false })
  const currentEpIndexRef = useRef(-1)

  // 启动：不自动扫描，显示空状态让用户手动选择
  useEffect(() => {
    ;(async () => {
      try {
        const roots = await window.electronAPI.scanRootsGet()
        if (roots && roots.length > 0) {
          setScanRoots(roots)
        }
      } catch {
        /* ignore */
      }
      setView('empty')
    })()
  }, [])

  // 扫描所有根目录
  const scanAll = useCallback(
    async (roots?: string[]) => {
      const r = roots ?? scanRoots
      if (r.length === 0) {
        setSeriesList([])
        setView('empty')
        return
      }
      setView('loading')
      try {
        const result = await window.electronAPI.scanRootsScanAll()
        setSeriesList(result)
        setView('wall')
      } catch (err) {
        console.error('[AniBox] Scan error:', err)
        setView('empty')
      }
    },
    [scanRoots],
  )

  // 添加扫描根目录（替换模式，每次选新目录即替换旧目录）
  const handleAddRoot = useCallback(async () => {
    const folder = await window.electronAPI.openFolder()
    if (!folder) return
    await window.electronAPI.scanRootsSetAll([folder])
    setScanRoots([folder])
    await scanAll([folder])
  }, [scanAll])

  // 移除扫描根目录
  const handleRemoveRoot = useCallback(
    async (root: string) => {
      const updated = await window.electronAPI.scanRootsRemove(root)
      setScanRoots(updated)
      await scanAll(updated)
    },
    [scanAll],
  )

  // 刷新当前
  const handleRefresh = useCallback(async () => {
    await scanAll()
  }, [scanAll])

  const handleSelectSeries = useCallback((series: SeriesInfo) => {
    setSelectedSeries(series)
    setSeriesMetadata(null)
    // 异步加载元数据
    window.electronAPI
      .getMetadata(series.folderPath)
      .then((meta) => {
        if (meta) setSeriesMetadata(meta)
      })
      .catch(() => {})
    setView('episodes')
  }, [])

  const handleBackToWall = useCallback(() => {
    setSelectedSeries(null)
    setView('wall')
  }, [])

  const handlePlayEpisode = useCallback(async (ep: EpisodeInfo, index: number) => {
    currentEpIndexRef.current = index
    setMpvFallback(false)
    // 播放前检查音频编码兼容性
    try {
      const audio = await window.electronAPI.checkAudio(ep.filePath)
      if (!audio.supported) {
        console.log('[AniBox] Unsupported audio codec:', audio.codec, 'using mpv')
        setMpvFallback(true)
      }
    } catch {
      /* ignore */
    }
    const savedPosition = await window.electronAPI.getPosition(ep.filePath)
    const mediaUrl = window.electronAPI.getMediaUrl(ep.filePath)
    setCurrentVideo({ filePath: ep.filePath, mediaUrl, savedPosition })
    setView('player')
  }, [])

  const handleClosePlayer = useCallback(() => {
    setCurrentVideo(null)
    setMpvFallback(false)
    if (mpvFallback) {
      window.electronAPI.mpvQuit()
    }
    if (selectedSeries) setView('episodes')
    else setView('wall')
  }, [selectedSeries, mpvFallback])

  const handleEpisodeList = useCallback(() => {
    if (selectedSeries) setView('episodes')
  }, [selectedSeries])

  const handleNextEpisode = useCallback(() => {
    if (!selectedSeries) return
    const eps = selectedSeries.episodes
    let nextIdx: number
    if (playMode === 'shuffle') {
      const otherIdxs = eps.map((_, i) => i).filter((i) => i !== currentEpIndexRef.current)
      if (otherIdxs.length === 0) {
        nextIdx = currentEpIndexRef.current
      } else {
        nextIdx = otherIdxs[Math.floor(Math.random() * otherIdxs.length)]
      }
    } else {
      nextIdx = currentEpIndexRef.current + 1
      if (nextIdx >= eps.length) {
        if (playMode === 'loop-all') {
          nextIdx = 0
        } else {
          setView('episodes')
          return
        }
      }
    }
    switchToEpisode(eps, nextIdx)
  }, [selectedSeries, playMode])

  const handlePrevEpisode = useCallback(() => {
    if (!selectedSeries) return
    const eps = selectedSeries.episodes
    const prevIdx = currentEpIndexRef.current - 1
    if (prevIdx < 0) return
    switchToEpisode(eps, prevIdx)
  }, [selectedSeries])

  const switchToEpisode = useCallback((eps: EpisodeInfo[], idx: number) => {
    const ep = eps[idx]
    currentEpIndexRef.current = idx
    setMpvFallback(false)
    // 播放前检查音频编码兼容性
    window.electronAPI
      .checkAudio(ep.filePath)
      .then((audio) => {
        if (!audio.supported) {
          console.log('[AniBox] Unsupported audio codec:', audio.codec, 'using mpv')
          setMpvFallback(true)
        }
      })
      .catch(() => {})
    window.electronAPI.mpvQuit().then(() => {
      window.electronAPI.getPosition(ep.filePath).then((p) => {
        setCurrentVideo({
          filePath: ep.filePath,
          mediaUrl: window.electronAPI.getMediaUrl(ep.filePath),
          savedPosition: p,
        })
      })
    })
  }, [])

  const cyclePlayMode = useCallback(() => {
    const modes: PlayMode[] = ['sequential', 'loop-one', 'loop-all', 'shuffle']
    setPlayMode((prev) => {
      const idx = modes.indexOf(prev)
      return modes[(idx + 1) % modes.length]
    })
  }, [])

  const handlePositionChange = useCallback((p: number) => {
    playbackRef.current.position = p
  }, [])
  const handleDurationChange = useCallback((d: number) => {
    playbackRef.current.duration = d
  }, [])
  const handlePlayStateChange = useCallback((playing: boolean) => {
    playbackRef.current.isPlaying = playing
  }, [])
  const handleFallback = useCallback(() => {
    setMpvFallback(true)
  }, [])

  useEffect(() => {
    if (!currentVideo) return
    const interval = setInterval(() => {
      if (playbackRef.current.position > 0)
        window.electronAPI.savePosition(currentVideo.filePath, playbackRef.current.position)
    }, 5000)
    return () => clearInterval(interval)
  }, [currentVideo])

  useEffect(() => {
    return window.electronAPI.onFullscreenChanged((fs: boolean) => setIsFullscreen(fs))
  }, [])

  return (
    <div className={`w-full h-full flex flex-col ${view === 'player' ? '' : 'bg-anibox-bg'}`}>
      {!(isFullscreen && view === 'player') && (
        <header className="flex items-center justify-between px-4 py-2 bg-anibox-surface border-b border-anibox-border shrink-0">
          <h1
            className="text-sm font-semibold text-anibox-accent select-none tracking-wide cursor-pointer"
            onClick={() => {
              if (view !== 'empty' && view !== 'loading') setView('wall')
            }}
          >
            AniBox
          </h1>
          <div className="flex-1" />
          {view === 'player' && currentVideo && (
            <>
              <span className="text-xs text-anibox-text-muted truncate max-w-md mx-2">
                {currentVideo.filePath.split(/[/\\]/).pop()}
              </span>
              <button
                onClick={handleClosePlayer}
                className="px-2 py-0.5 text-xs text-anibox-text-muted hover:text-anibox-text border border-anibox-border rounded hover:border-anibox-text-muted transition-colors ml-2"
              >
                ← 返回
              </button>
            </>
          )}
          {view === 'wall' && (
            <div className="flex items-center gap-2">
              {scanRoots.length > 0 && (
                <button
                  onClick={handleRefresh}
                  className="px-2 py-1 text-xs text-anibox-text-muted hover:text-anibox-text border border-anibox-border rounded transition-colors"
                  title="重新扫描"
                >
                  ↻
                </button>
              )}
              <button
                onClick={() => setView('search')}
                className="px-2.5 py-1.5 text-xs text-anibox-text-muted hover:text-anibox-accent hover:bg-anibox-border/30
                  border border-anibox-border hover:border-anibox-accent/40 rounded-lg transition-all duration-150 active:scale-95
                  flex items-center gap-1.5"
                title="搜索想要的番剧，获取资源并下载"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                搜索番剧
              </button>
              <button
                onClick={handleAddRoot}
                className="px-2.5 py-1.5 text-xs text-anibox-text-muted hover:text-anibox-text hover:bg-anibox-border/30
                  border border-anibox-border hover:border-anibox-text-muted rounded-lg transition-all duration-150 active:scale-95
                  flex items-center gap-1.5"
                title="手动选择番剧目录"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                手动添加
              </button>
              <button
                onClick={() => setView('season')}
                className="px-2.5 py-1.5 text-xs text-anibox-text-muted hover:text-anibox-accent hover:bg-anibox-border/30
                  border border-anibox-border hover:border-anibox-accent/40 rounded-lg transition-all duration-150 active:scale-95
                  flex items-center gap-1.5"
                title="新番时间表"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="10" y1="14" x2="14" y2="14" /><line x1="12" y1="14" x2="12" y2="18" />
                </svg>
                新番
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="px-2.5 py-1.5 text-xs text-anibox-text-muted hover:text-anibox-text hover:bg-anibox-border/30
                  border border-anibox-border hover:border-anibox-text-muted rounded-lg transition-all duration-150 active:scale-95
                  flex items-center gap-1.5"
                title="设置"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                设置
              </button>
            </div>
          )}
        </header>
      )}
      <main
        className={`flex-1 relative ${view === 'player' ? '' : 'overflow-hidden bg-anibox-bg'}`}
      >
        {/* 所有非播放器视图常驻 DOM，display 切换 — 保留筛选/滚动状态 */}
        <div style={{ display: view === 'empty' ? 'block' : 'none' }} className="w-full h-full">
          <EmptyState
            onOpenFolder={handleAddRoot}
            onSearchAnime={() => setView('search')}
            onOpenFile={async () => {
              const r = await window.electronAPI.openFile()
              if (!r) return
              setMpvFallback(false)
              setCurrentVideo({
                filePath: r.filePath,
                mediaUrl: window.electronAPI.getMediaUrl(r.filePath),
                savedPosition: r.savedPosition,
              })
              setView('player')
            }}
            onPlayRecent={async (folderPath, filePath, position) => {
              const roots = await window.electronAPI.scanRootsGet()
              const parentRoot = roots.find((r: string) => folderPath.startsWith(r))
              if (!parentRoot) {
                let root = folderPath
                const parts = folderPath.replace(/\\/g, '/').split('/')
                if (parts.length > 2) root = parts.slice(0, -1).join('/')
                await window.electronAPI.scanRootsAdd(root)
                const updated = await window.electronAPI.scanRootsGet()
                setScanRoots(updated)
              }
              setMpvFallback(false)
              setCurrentVideo({
                filePath,
                mediaUrl: window.electronAPI.getMediaUrl(filePath),
                savedPosition: position,
              })
              setView('player')
            }}
            onOpenSeason={() => setView('season')}
          />
        </div>
        {view === 'loading' && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-anibox-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-anibox-text-muted">正在扫描番剧...</p>
            </div>
          </div>
        )}
        {seriesList.length > 0 && (
          <div style={{ display: view === 'wall' ? 'block' : 'none' }} className="w-full h-full">
            <SeriesWall
              seriesList={seriesList}
              selectedId={selectedSeries?.folderPath || null}
              onSelect={handleSelectSeries}
              scanRoots={scanRoots}
              onAddRoot={handleAddRoot}
              onRemoveRoot={handleRemoveRoot}
              onRefresh={handleRefresh}
            />
          </div>
        )}
        {selectedSeries && (
          <div
            style={{ display: view === 'episodes' ? 'block' : 'none' }}
            className="w-full h-full"
          >
            <EpisodeList
              series={selectedSeries}
              metadata={seriesMetadata}
              onPlay={handlePlayEpisode}
              onClose={handleBackToWall}
            />
          </div>
        )}
        {/* 新番时间表 */}
        {view === 'season' && (
          <div className="w-full h-full">
            <SeasonCalendar
              onBack={() => setView('wall')}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>
        )}
        {/* 搜索番剧 */}
        {view === 'search' && (
          <div className="w-full h-full">
            <SearchAnimePage
              onBack={() => setView(scanRoots.length > 0 ? 'wall' : 'empty')}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>
        )}
        {/* 播放器：保持 key 重挂载，无筛选状态需保留 */}
        {currentVideo && view === 'player'
          ? (() => {
              const eps = selectedSeries?.episodes || []
              const curIdx = currentEpIndexRef.current
              const next = curIdx >= 0 && curIdx + 1 < eps.length ? eps[curIdx + 1] : null
              const prev = curIdx > 0 ? eps[curIdx - 1] : null
              const curEp = curIdx >= 0 && curIdx < eps.length ? eps[curIdx] : null

              if (!mpvFallback) {
                return (
                  <ErrorBoundary
                    fallback={
                      <div className="w-full h-screen bg-black flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-neutral-400 mb-3">播放器出错</p>
                          <button
                            onClick={handleEpisodeList}
                            className="px-4 py-2 text-sm bg-anibox-accent text-white rounded"
                          >
                            返回选集
                          </button>
                        </div>
                      </div>
                    }
                  >
                    <Player
                      key={currentVideo.filePath}
                      mediaUrl={currentVideo.mediaUrl}
                      filePath={currentVideo.filePath}
                      folderPath={selectedSeries?.folderPath}
                      savedPosition={currentVideo.savedPosition}
                      subtitleTracks={curEp?.subtitleTracks}
                      playMode={playMode}
                      nextEpisodeTitle={next?.fileName}
                      prevEpisodeTitle={prev?.fileName}
                      onNextEpisode={next ? handleNextEpisode : undefined}
                      onPrevEpisode={prev ? handlePrevEpisode : undefined}
                      onCyclePlayMode={cyclePlayMode}
                      onFallback={handleFallback}
                      onEpisodeList={selectedSeries ? handleEpisodeList : undefined}
                      episodes={selectedSeries?.episodes}
                      currentEpIndex={selectedSeries ? currentEpIndexRef.current : -1}
                      onSelectEpisode={(idx) => {
                        if (selectedSeries) {
                          switchToEpisode(selectedSeries.episodes, idx)
                        }
                      }}
                      onOpenSettings={() => setShowSettings(true)}
                      onPositionChange={handlePositionChange}
                      onDurationChange={handleDurationChange}
                      onPlayStateChange={handlePlayStateChange}
                    />
                  </ErrorBoundary>
                )
              }
              // loop-all / shuffle 在末集也能继续（handleNextEpisode 内部处理回绕/随机）
              const canAutoNext = next !== null || playMode === 'loop-all' || playMode === 'shuffle'
              return (
                <MpvOverlay
                  key={currentVideo.filePath}
                  filePath={currentVideo.filePath}
                  playMode={playMode}
                  nextEpisodeTitle={next?.fileName}
                  onNextEpisode={canAutoNext ? handleNextEpisode : undefined}
                  onClose={handleClosePlayer}
                />
              )
            })()
          : null}
      </main>

      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
