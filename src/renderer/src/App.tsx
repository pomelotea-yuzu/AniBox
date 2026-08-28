import { useState, useCallback, useRef, useEffect } from 'react'
import type { SeriesInfo, EpisodeInfo } from '../../main/scanner'
import Player from './components/Player'
import MpvOverlay from './components/MpvOverlay'
import MpvCanvas from './components/MpvCanvas'
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
  // 方案 A 播放后端：libmpv 内嵌（默认）→ 失败自动回退 legacy（mpv.exe 独立窗口）
  const [mpvBackend, setMpvBackend] = useState<'libmpv' | 'legacy'>('libmpv')
  const [showSettings, setShowSettings] = useState(false)
  const [seriesMetadata, setSeriesMetadata] = useState<any>(null)
  const [playMode, setPlayMode] = useState<PlayMode>('sequential')

  const playbackRef = useRef({ position: 0, duration: 0, isPlaying: false })
  const currentEpIndexRef = useRef(-1)
  // 全局播放偏好（进度保存间隔；播放器内默认音量/倍速/自动下一集由 Player/MpvCanvas 自行读取）
  const playbackSettingsRef = useRef<any>(null)
  // 音频编码兼容性缓存：key = 集文件路径，value = HTML5 是否可播放。
  // 避免连播/切集时逐集重复检测导致「跳一下」（问题 #3）。
  const audioSupportCacheRef = useRef<Map<string, boolean>>(new Map())
  // 剧集级播放形式锁定：key = 番剧目录，value = HTML5 是否可播。
  // 同一部剧基本同一种片源，首集实时检测后锁定整部，连播/切集直接复用，不再逐集检测。
  const seriesAudioBackendRef = useRef<Map<string, boolean>>(new Map())
  // 已批量预热过音频检测的番剧目录集合
  const seriesAudioWarmedRef = useRef<Set<string>>(new Set())

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

  // 加载全局播放偏好（进度保存间隔用）
  useEffect(() => {
    window.electronAPI
      .getPlaybackSettings()
      .then((s) => {
        if (s) playbackSettingsRef.current = s
      })
      .catch(() => {})
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

  // 单集音频兼容性解析：优先命中单集缓存 → 再命中剧集级锁定 → 否则实时检测一次。
  // 返回 true 表示 HTML5 可播放，false 表示需要 mpv。
  const resolveAudioSupport = useCallback(
    async (filePath: string, folder?: string): Promise<boolean> => {
      // 1. 单集缓存命中（最精确，如已批量预热）
      const cached = audioSupportCacheRef.current.get(filePath)
      if (cached !== undefined) return cached
      // 2. 剧集级锁定命中：同一种片源，直接复用该剧的播放形式
      if (folder) {
        const locked = seriesAudioBackendRef.current.get(folder)
        if (locked !== undefined) {
          audioSupportCacheRef.current.set(filePath, locked)
          return locked
        }
      }
      // 3. 实时检测：写入单集缓存，并作为该剧集播放形式的首个样本锁定整部
      try {
        const audio = await window.electronAPI.checkAudio(filePath)
        audioSupportCacheRef.current.set(filePath, audio.supported)
        if (folder) seriesAudioBackendRef.current.set(folder, audio.supported)
        return audio.supported
      } catch {
        return true // 检测失败默认走 HTML5
      }
    },
    [],
  )

  // 后台批量预热整部番的音频检测结果（一次性检测全部，连播时逐集命中缓存，不再「跳一下」）
  const warmSeriesAudioCache = useCallback((series: SeriesInfo | null) => {
    if (!series) return
    const folder = series.folderPath
    if (seriesAudioWarmedRef.current.has(folder)) return
    seriesAudioWarmedRef.current.add(folder)
    const paths = series.episodes.map((e) => e.filePath)
    window.electronAPI
      .checkAudioBatch(paths)
      .then((map) => {
        for (const [p, info] of Object.entries(map)) {
          if (info && typeof info.supported === 'boolean') {
            audioSupportCacheRef.current.set(p, info.supported)
          }
        }
      })
      .catch(() => {})
  }, [])

  const handlePlayEpisode = useCallback(
    async (ep: EpisodeInfo, index: number) => {
      currentEpIndexRef.current = index
      setMpvBackend('libmpv')
      // 播放前检查音频编码兼容性（单集缓存 → 剧集级锁定）
      const supported = await resolveAudioSupport(ep.filePath, selectedSeries?.folderPath)
      setMpvFallback(!supported)
      if (!supported) console.log('[AniBox] Unsupported audio codec, using mpv:', ep.filePath)
      // 后台批量预热整部番，之后连播/切集直接命中缓存
      warmSeriesAudioCache(selectedSeries)
      const savedPosition = await window.electronAPI.getPosition(ep.filePath)
      const mediaUrl = window.electronAPI.getMediaUrl(ep.filePath)
      setCurrentVideo({ filePath: ep.filePath, mediaUrl, savedPosition })
      setView('player')
    },
    [resolveAudioSupport, warmSeriesAudioCache, selectedSeries],
  )

  const handleClosePlayer = useCallback(() => {
    setCurrentVideo(null)
    setMpvFallback(false)
    setMpvBackend('libmpv')
    // 无条件停止 mpv：libmpv / legacy 双链路都要停（libmpvQuit/mpvKill 对空引用安全）
    window.electronAPI.mpvQuit().catch(() => {})
    if (selectedSeries) setView('episodes')
    else setView('wall')
  }, [selectedSeries])

  // 播放器视图退出兜底：任何路径离开 player 视图都确保 mpv 停止，
  // 防止 MpvCanvas 卸载 cleanup 的 quit IPC 丢失导致「返回后声音仍在播放」；
  // 同时退出全屏（问题 #5：全屏连播完退出后软件仍停留在全屏、无窗口控制按钮）
  const prevViewRef = useRef<View>('loading')
  useEffect(() => {
    if (prevViewRef.current === 'player' && view !== 'player') {
      window.electronAPI.mpvQuit().catch(() => {})
      window.electronAPI.exitFullscreen().catch(() => {})
    }
    prevViewRef.current = view
  }, [view])

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
    switchToEpisode(eps, nextIdx, selectedSeries.folderPath)
  }, [selectedSeries, playMode])

  const handlePrevEpisode = useCallback(() => {
    if (!selectedSeries) return
    const eps = selectedSeries.episodes
    const prevIdx = currentEpIndexRef.current - 1
    if (prevIdx < 0) return
    switchToEpisode(eps, prevIdx, selectedSeries.folderPath)
  }, [selectedSeries])

  const switchToEpisode = useCallback(
    async (eps: EpisodeInfo[], idx: number, folder?: string) => {
      const ep = eps[idx]
      currentEpIndexRef.current = idx
      setMpvBackend('libmpv')
      // 缓存优先检测（单集缓存 → 剧集级锁定），避免连播中间先切回 HTML5 再切回 mpv 造成的「跳一下」。
      // 注意：此处不再同步 setMpvFallback(false)，而是等检测结果确定后再一次性切换。
      const supported = await resolveAudioSupport(ep.filePath, folder)
      setMpvFallback(!supported)
      if (!supported) console.log('[AniBox] Unsupported audio codec, using mpv:', ep.filePath)
      // 停止当前 mpv，再加载新集（幂等；MpvCanvas 卸载 cleanup 时也会再调一次）
      await window.electronAPI.mpvQuit().catch(() => {})
      let savedPosition = 0
      try {
        savedPosition = await window.electronAPI.getPosition(ep.filePath)
      } catch {
        /* ignore */
      }
      setCurrentVideo({
        filePath: ep.filePath,
        mediaUrl: window.electronAPI.getMediaUrl(ep.filePath),
        savedPosition,
      })
    },
    [resolveAudioSupport],
  )

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
    // 进度保存间隔读全局设置（设置页「播放」tab；默认 5s）
    const intervalMs = Math.max(1, playbackSettingsRef.current?.saveProgressInterval || 5) * 1000
    const interval = setInterval(() => {
      if (playbackRef.current.position > 0)
        window.electronAPI.savePosition(currentVideo.filePath, playbackRef.current.position)
    }, intervalMs)
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
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="10" y1="14" x2="14" y2="14" />
                  <line x1="12" y1="14" x2="12" y2="18" />
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
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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
              setMpvBackend('libmpv')
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
              setMpvBackend('libmpv')
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
                          switchToEpisode(selectedSeries.episodes, idx, selectedSeries.folderPath)
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
              // 方案 A：libmpv 内嵌（Canvas 显示）；libmpv 初始化失败时回退旧 mpv.exe 独立窗口
              if (mpvBackend === 'libmpv') {
                return (
                  <MpvCanvas
                    key={currentVideo.filePath}
                    filePath={currentVideo.filePath}
                    playMode={playMode}
                    prevEpisodeTitle={prev?.fileName}
                    nextEpisodeTitle={next?.fileName}
                    onPrevEpisode={prev ? handlePrevEpisode : undefined}
                    onNextEpisode={canAutoNext ? handleNextEpisode : undefined}
                    onClose={handleClosePlayer}
                    onFallbackToLegacy={() => setMpvBackend('legacy')}
                    onCyclePlayMode={cyclePlayMode}
                    episodes={selectedSeries?.episodes}
                    currentEpIndex={curIdx}
                    onSelectEpisode={
                      selectedSeries
                        ? (idx) =>
                            switchToEpisode(selectedSeries.episodes, idx, selectedSeries.folderPath)
                        : undefined
                    }
                  />
                )
              }
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
