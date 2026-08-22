import { useState, useRef, useEffect } from 'react'
import ProgressBar from './ProgressBar'

interface ControlsProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  playbackRate: number
  isFullscreen: boolean
  visible: boolean
  subtitleTracks?: Array<{ label: string; language: string; type: string }>
  selectedSubtitleIdx?: number
  selectedSecondarySubIdx?: number
  audioTracks?: Array<{ label: string; language: string; index: number }>
  selectedAudioIdx?: number
  onTogglePlay: () => void
  onSeek: (time: number) => void
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
  onSpeedChange: (speed: number) => void
  onToggleFullscreen: () => void
  onSubtitleChange?: (index: number) => void
  onSecondarySubtitleChange?: (index: number) => void
  onAudioChange?: (index: number) => void
  onAspectCycle?: () => void
  aspectMode?: string
  bufferProgress?: number
  onScreenshot?: () => void
  onPiP?: () => void
  isPiP?: boolean
  playMode?: string
  onCyclePlayMode?: () => void
  loopA?: number | null
  loopB?: number | null
  previewTime?: number | null
  previewImage?: string | null
  onPreviewHover?: (time: number | null) => void
  onPrevEpisode?: () => void
  onNextEpisode?: () => void
  hasPrevEpisode?: boolean
  hasNextEpisode?: boolean
  hasEpisodeList?: boolean
  onEpisodeList?: () => void
  /** 播放器内选集面板 */
  episodes?: Array<{ fileName: string; filePath: string; epNumber?: number }>
  currentEpIndex?: number
  onSelectEpisode?: (index: number) => void
  /** 音频延迟（毫秒） */
  audioDelay?: number
  onAudioDelayChange?: (delayMs: number) => void
  /** 音量均衡开关 */
  volumeNormalization?: boolean
  onVolumeNormalizationToggle?: () => void
  /** OP/ED 跳过（快捷键模式）：连按 3 次右方向键 = 跳过 80 秒 */
  skipShortcutEnabled?: boolean
  onSkipShortcutToggle?: () => void
  /** 画面增强 */
  enhanceEnabled?: boolean
  enhancePreset?: string
  onEnhanceToggle?: () => void
  onEnhancePreset?: (preset: string) => void
  abCompare?: boolean
  onAbCompare?: () => void
  /** 字幕样式 */
  subtitleStyle?: {
    fontSize: number
    fontFamily: string
    textColor: string
    strokeColor: string
    strokeWidth: number
    bgColor: string
    position: string
    secondaryFontSize: number
    dualSubtitleGap: number
  }
  onSubtitleStyleChange?: (style: any) => void
  showSubtitleSettings?: boolean
  onToggleSubtitleSettings?: () => void
  /** 在线字幕搜索 */
  onOnlineSearch?: (query?: string) => void
  onlineSearchResults?: Array<{
    id: string
    title: string
    language: string
    languageLabel: string
    source: string
    fileName: string
    rating: number
    downloads: number
  }>
  isSearchingOnline?: boolean
  showOnlineSearch?: boolean
  onToggleOnlineSearch?: () => void
  onOnlineSubDownload?: (result: any) => void
  /** 生词点查 */
  onWordLookup?: () => void
  /** Whisper 语音识别 */
  onWhisperTranscribe?: () => void
  isWhisperAvailable?: boolean
  /** 弹幕 */
  danmakuConfig?: {
    enabled: boolean
    density: number
    speed: number
    opacity: number
    fontScale: number
    showScroll: boolean
    showTop: boolean
    showBottom: boolean
    offsetMs: number
  }
  onDanmakuConfigChange?: (partial: any) => void
  onDanmakuFetch?: () => void
  isLoadingDanmaku?: boolean
  danmakuCount?: number
  showDanmakuSettings?: boolean
  onToggleDanmakuSettings?: () => void
  onSendDanmaku?: (text: string, color: string, mode: string) => void
  onDanmakuExport?: () => void
  danmakuFilterText?: string
  onDanmakuFilterText?: (text: string) => void
  danmakuFilterRegex?: string
  onDanmakuFilterRegex?: (re: string) => void
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 播放控制栏
 * 底部渐变浮层，包含全部播放控制
 */
export default function Controls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackRate,
  isFullscreen,
  visible,
  subtitleTracks,
  selectedSubtitleIdx = -1,
  selectedSecondarySubIdx = -1,
  audioTracks,
  selectedAudioIdx = 0,
  onTogglePlay,
  onSeek,
  onToggleMute,
  onVolumeChange,
  onSpeedChange,
  onToggleFullscreen,
  onSubtitleChange,
  onSecondarySubtitleChange,
  onAudioChange,
  onAspectCycle,
  aspectMode,
  bufferProgress,
  onScreenshot,
  onPiP,
  isPiP,
  playMode,
  onCyclePlayMode,
  loopA,
  loopB,
  previewTime,
  previewImage,
  onPreviewHover,
  onPrevEpisode,
  onNextEpisode,
  hasPrevEpisode,
  hasNextEpisode,
  hasEpisodeList,
  onEpisodeList,
  episodes,
  currentEpIndex = -1,
  onSelectEpisode,
  audioDelay,
  onAudioDelayChange,
  volumeNormalization,
  onVolumeNormalizationToggle,
  skipShortcutEnabled,
  onSkipShortcutToggle,
  enhanceEnabled,
  enhancePreset,
  onEnhanceToggle,
  onEnhancePreset,
  abCompare,
  onAbCompare,
  subtitleStyle,
  onSubtitleStyleChange,
  showSubtitleSettings,
  onToggleSubtitleSettings,
  onOnlineSearch,
  onlineSearchResults,
  isSearchingOnline,
  showOnlineSearch,
  onToggleOnlineSearch,
  onOnlineSubDownload,
  onWordLookup,
  onWhisperTranscribe,
  isWhisperAvailable,
  danmakuConfig,
  onDanmakuConfigChange,
  onDanmakuFetch,
  isLoadingDanmaku,
  danmakuCount,
  showDanmakuSettings,
  onToggleDanmakuSettings,
  onSendDanmaku,
  onDanmakuExport,
  danmakuFilterText,
  onDanmakuFilterText,
  danmakuFilterRegex,
  onDanmakuFilterRegex,
}: ControlsProps) {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false)
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [showEpisodePanel, setShowEpisodePanel] = useState(false)
  const [customSpeed, setCustomSpeed] = useState('')
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const speedMenuRef = useRef<HTMLDivElement>(null)
  const subtitleMenuRef = useRef<HTMLDivElement>(null)
  const audioMenuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭倍速菜单
  useEffect(() => {
    if (!showSpeedMenu) return
    const handler = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSpeedMenu])

  // 点击外部关闭字幕菜单
  useEffect(() => {
    if (!showSubtitleMenu) return
    const handler = (e: MouseEvent) => {
      if (subtitleMenuRef.current && !subtitleMenuRef.current.contains(e.target as Node)) {
        setShowSubtitleMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSubtitleMenu])

  // 点击外部关闭音轨菜单
  useEffect(() => {
    if (!showAudioMenu) return
    const handler = (e: MouseEvent) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setShowAudioMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAudioMenu])

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent pt-20 pb-3 px-4 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 进度条 */}
      <div className="mb-2">
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          bufferProgress={bufferProgress}
          loopA={loopA}
          loopB={loopB}
          previewTime={previewTime}
          previewImage={previewImage}
          onSeek={onSeek}
          onPreviewHover={onPreviewHover}
        />
      </div>

      {/* 控制按钮行 */}
      <div className="flex items-center gap-3">
        {/* 上一集 */}
        {hasPrevEpisode && onPrevEpisode && (
          <button
            onClick={onPrevEpisode}
            className="text-white/60 hover:text-white transition-colors"
            title="上一集"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
        )}

        {/* 播放/暂停 */}
        <button
          onClick={onTogglePlay}
          className="text-white hover:text-anibox-accent transition-colors"
          title={isPlaying ? '暂停 (Space)' : '播放 (Space)'}
        >
          {isPlaying ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="0.5" />
              <rect x="14" y="4" width="4" height="16" rx="0.5" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,3 20,12 6,21" />
            </svg>
          )}
        </button>

        {/* 下一集 */}
        {hasNextEpisode && onNextEpisode && (
          <button
            onClick={onNextEpisode}
            className="text-white/60 hover:text-white transition-colors"
            title="下一集"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        )}

        {/* 时间 */}
        <span className="text-xs text-white/75 tabular-nums min-w-[105px] select-none">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* 音量控制 — 悬浮展开 */}
        <div
          className="flex items-center gap-1.5"
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
        >
          <button
            onClick={onToggleMute}
            className="text-white/80 hover:text-white transition-colors shrink-0"
            title={isMuted ? '取消静音 (M)' : '静音 (M)'}
          >
            {isMuted || volume === 0 ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 12A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM3 9v6h4l5 5V4L7 9H3z" />
                <line x1="20" y1="8" x2="20" y2="16" stroke="currentColor" strokeWidth="2" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5z" />
              </svg>
            )}
          </button>
          <div
            className={`flex items-center gap-1.5 overflow-hidden transition-all duration-200 ${
              showVolumeSlider ? 'w-[104px] opacity-100' : 'w-0 opacity-0'
            }`}
          >
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-16 accent-anibox-accent cursor-pointer shrink-0"
              title="音量"
            />
            <span className="text-[11px] text-white/50 tabular-nums min-w-[28px] text-right select-none shrink-0">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>
        </div>

        {/* 音量均衡 */}
        {onVolumeNormalizationToggle && (
          <button
            onClick={onVolumeNormalizationToggle}
            className={`text-xs transition-colors px-1 py-0.5 rounded ${
              volumeNormalization ? 'text-anibox-accent' : 'text-white/50 hover:text-white'
            }`}
            title={`音量均衡${volumeNormalization ? '：开' : '：关'}`}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
            </svg>
          </button>
        )}

        {/* 音频延迟 */}
        {onAudioDelayChange && audioDelay !== undefined && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onAudioDelayChange(Math.max(0, audioDelay - 50))}
              className="text-white/40 hover:text-white/70 transition-colors disabled:opacity-20"
              disabled={audioDelay <= 0}
              title="音频延迟 -50ms"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 12H5m7-7l-7 7 7 7" transform="rotate(-90 12 12)" />
              </svg>
            </button>
            <span
              className={`text-[10px] tabular-nums select-none min-w-[34px] text-center ${
                audioDelay > 0 ? 'text-anibox-accent' : 'text-white/30'
              }`}
              title="音频延迟"
            >
              {audioDelay > 0 ? `+${audioDelay}` : '0'}ms
            </span>
            <button
              onClick={() => onAudioDelayChange(Math.min(500, audioDelay + 50))}
              className="text-white/40 hover:text-white/70 transition-colors disabled:opacity-20"
              disabled={audioDelay >= 500}
              title="音频延迟 +50ms"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 12H5m7-7l-7 7 7 7" transform="rotate(90 12 12)" />
              </svg>
            </button>
          </div>
        )}

        {/* OP/ED 跳过（快捷键模式：连按 3 次右方向键 = 跳过 80 秒） */}
        {onSkipShortcutToggle && (
          <button
            onClick={onSkipShortcutToggle}
            className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              skipShortcutEnabled
                ? 'text-green-400'
                : 'text-white/25 hover:text-white/50'
            }`}
            title={
              skipShortcutEnabled
                ? 'OP/ED 跳过已开启：连按 3 次 → 跳过 80 秒'
                : 'OP/ED 跳过已关闭（点击开启）'
            }
          >
            ⏭ 跳过
            {skipShortcutEnabled ? <span className="ml-0.5 align-top text-[8px]">●</span> : ''}
          </button>
        )}

        {/* 画面增强 */}
        {onEnhanceToggle && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={onEnhanceToggle}
              className={`text-[10px] px-1 py-0.5 rounded transition-colors ${
                enhanceEnabled ? 'text-anibox-accent' : 'text-white/25 hover:text-white/50'
              }`}
              title={`Anime4K${enhanceEnabled ? '：开' : '：关'} (E键)`}
            >
              4K
            </button>
            {enhanceEnabled && onEnhancePreset && (
              <select
                value={enhancePreset || 'balanced'}
                onChange={(e) => onEnhancePreset(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="text-[9px] bg-transparent text-anibox-accent/70 outline-none cursor-pointer"
              >
                <option value="balanced">均衡</option>
                <option value="quality">高质量</option>
                <option value="performance">性能</option>
              </select>
            )}
            {enhanceEnabled && onAbCompare && (
              <button
                onClick={onAbCompare}
                className={`text-[10px] px-0.5 py-0.5 rounded transition-colors ${
                  abCompare ? 'text-amber-400' : 'text-white/25 hover:text-white/50'
                }`}
                title="A/B 对比 (B键)"
              >
                AB
              </button>
            )}
          </div>
        )}

        {/* 弹幕开关 */}
        <button
          onClick={() => {
            if ((danmakuCount ?? 0) === 0) return
            onDanmakuConfigChange?.({ enabled: !danmakuConfig?.enabled })
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            onDanmakuConfigChange?.({ enabled: false })
          }}
          className={`text-[10px] px-1 py-0.5 rounded transition-colors ${
            (danmakuCount ?? 0) === 0
              ? 'text-white/15 cursor-not-allowed'
              : danmakuConfig?.enabled
                ? 'text-anibox-accent'
                : 'text-white/25 hover:text-white/50'
          }`}
          title={
            (danmakuCount ?? 0) === 0
              ? '弹幕 (未加载)'
              : danmakuConfig?.enabled
                ? `弹幕：开 (${danmakuCount}条) · 右键关闭`
                : `弹幕：关 (${danmakuCount}条)`
          }
        >
          弹
        </button>

        {/* 倍速选择 */}
        <div className="relative" ref={speedMenuRef}>
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            className="text-xs text-white/75 hover:text-white transition-colors px-1 py-0.5 rounded min-w-[28px]"
            title="播放速度"
          >
            {playbackRate}x
          </button>
          {showSpeedMenu && (
            <div className="absolute bottom-full right-0 mb-2 bg-anibox-overlay border border-neutral-700 rounded-md shadow-xl py-1 z-50 min-w-[100px]">
              {PLAYBACK_SPEEDS.map((speed) => (
                <button
                  key={speed}
                  onClick={() => {
                    onSpeedChange(speed)
                    setShowSpeedMenu(false)
                  }}
                  className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors whitespace-nowrap ${
                    playbackRate === speed ? 'text-anibox-accent font-medium' : 'text-white/80'
                  }`}
                >
                  {speed}x
                </button>
              ))}
              {/* 自定义倍速输入 */}
              <div className="border-t border-neutral-700 mt-1 pt-1 px-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const val = parseFloat(customSpeed)
                    if (val >= 0.1 && val <= 16) {
                      onSpeedChange(val)
                      setShowSpeedMenu(false)
                      setCustomSpeed('')
                    }
                  }}
                >
                  <input
                    type="number"
                    min="0.1"
                    max="16"
                    step="0.05"
                    value={customSpeed}
                    onChange={(e) => setCustomSpeed(e.target.value)}
                    placeholder="自定义..."
                    className="w-full bg-white/5 border border-neutral-600 rounded px-2 py-1 text-xs text-white
                      placeholder:text-white/30 focus:outline-none focus:border-anibox-accent
                      [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                </form>
              </div>
            </div>
          )}
        </div>

        {/* 字幕选择 */}
        {subtitleTracks && subtitleTracks.length > 0 && onSubtitleChange && (
          <div className="relative" ref={subtitleMenuRef}>
            <button
              onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
              className={`text-xs transition-colors px-1 py-0.5 rounded ${
                selectedSubtitleIdx >= 0 ? 'text-anibox-accent' : 'text-white/60 hover:text-white'
              }`}
              title="字幕 (V)"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M7 15h2m2 0h6M7 11h10" />
              </svg>
            </button>
            {showSubtitleMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-anibox-overlay border border-neutral-700 rounded-md shadow-xl py-1 z-50 min-w-[200px]">
                <div className="px-3 py-1 text-[10px] text-neutral-500 uppercase">主字幕</div>
                <button
                  onClick={() => {
                    onSubtitleChange(-1)
                    setShowSubtitleMenu(false)
                  }}
                  className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                    selectedSubtitleIdx < 0 ? 'text-anibox-accent font-medium' : 'text-white/80'
                  }`}
                >
                  关闭字幕
                </button>
                {subtitleTracks.map((track, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onSubtitleChange(i)
                      setShowSubtitleMenu(false)
                    }}
                    className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors whitespace-nowrap ${
                      selectedSubtitleIdx === i ? 'text-anibox-accent font-medium' : 'text-white/80'
                    }`}
                  >
                    {track.label}
                    {track.language ? (
                      <span className="text-white/30 ml-1">({track.language})</span>
                    ) : (
                      ''
                    )}
                  </button>
                ))}
                {/* 双语副字幕 */}
                {onSecondarySubtitleChange && selectedSubtitleIdx >= 0 && (
                  <>
                    <div className="border-t border-neutral-700 mt-1 pt-1 px-3 py-1 text-[10px] text-neutral-500 uppercase">
                      双语·副字幕
                    </div>
                    <button
                      onClick={() => {
                        onSecondarySubtitleChange(-1)
                        setShowSubtitleMenu(false)
                      }}
                      className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                        selectedSecondarySubIdx < 0
                          ? 'text-anibox-accent font-medium'
                          : 'text-white/80'
                      }`}
                    >
                      不使用
                    </button>
                    {subtitleTracks.map(
                      (track, i) =>
                        i !== selectedSubtitleIdx && (
                          <button
                            key={'sec_' + i}
                            onClick={() => {
                              onSecondarySubtitleChange(i)
                              setShowSubtitleMenu(false)
                            }}
                            className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors whitespace-nowrap ${
                              selectedSecondarySubIdx === i
                                ? 'text-anibox-accent font-medium'
                                : 'text-white/80'
                            }`}
                          >
                            {track.label}
                            {track.language ? (
                              <span className="text-white/30 ml-1">({track.language})</span>
                            ) : (
                              ''
                            )}
                          </button>
                        ),
                    )}
                  </>
                )}
                {/* 在线搜索 + 样式设置 */}
                {onOnlineSearch && (
                  <>
                    <div className="border-t border-neutral-700 mt-1 pt-1" />
                    <button
                      onClick={() => {
                        onToggleOnlineSearch?.()
                        setShowSubtitleMenu(false)
                      }}
                      className="block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors text-white/80"
                    >
                      <span className="text-anibox-accent">🌐</span> 在线搜索字幕
                    </button>
                  </>
                )}
                {onToggleSubtitleSettings && (
                  <button
                    onClick={() => {
                      onToggleSubtitleSettings?.()
                      setShowSubtitleMenu(false)
                    }}
                    className="block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors text-white/80"
                  >
                    ⚙ 字幕样式设置
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 字幕辅助按钮组 */}
        <div className="flex items-center gap-0.5">
          {/* 在线搜索字幕 */}
          {onOnlineSearch && (
            <button
              onClick={() => onToggleOnlineSearch?.()}
              className="text-white/50 hover:text-anibox-accent transition-colors px-0.5"
              title="在线搜索字幕 (O)"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
          {/* 双语字幕切换 */}
          {onSecondarySubtitleChange && (
            <button
              onClick={() => {
                // 循环切换副字幕
                const tracks = subtitleTracks || []
                const primaryIdx = selectedSubtitleIdx
                const secondaryIdx = selectedSecondarySubIdx ?? -1
                if (tracks.length <= 1 || (primaryIdx ?? -1) < 0) return
                let next =
                  secondaryIdx < 0 ? tracks.findIndex((_, i) => i !== primaryIdx) : secondaryIdx + 1
                while (
                  next >= 0 &&
                  next < tracks.length &&
                  (next === secondaryIdx || next === primaryIdx)
                )
                  next++
                if (next >= tracks.length) next = -1
                if (next === primaryIdx) next = -1
                onSecondarySubtitleChange(next)
              }}
              className={`transition-colors px-0.5 ${
                (selectedSecondarySubIdx ?? -1) >= 0
                  ? 'text-anibox-accent'
                  : 'text-white/50 hover:text-white'
              }`}
              title="双语字幕 (D)"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="2" width="20" height="8" rx="1" />
                <rect x="2" y="13" width="20" height="8" rx="1" opacity="0.5" />
                <line x1="6" y1="6" x2="18" y2="6" strokeWidth="1" />
                <line x1="6" y1="17" x2="18" y2="17" strokeWidth="1" opacity="0.5" />
              </svg>
            </button>
          )}
          {/* 字幕样式设置 */}
          {onToggleSubtitleSettings && (
            <button
              onClick={() => onToggleSubtitleSettings?.()}
              className={`transition-colors px-0.5 ${
                showSubtitleSettings ? 'text-anibox-accent' : 'text-white/50 hover:text-white'
              }`}
              title="字幕样式 (G)"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="4,7 4,4 20,4 20,7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
            </button>
          )}
        </div>

        {/* 在线字幕搜索面板 */}
        {showOnlineSearch && (
          <div
            className="absolute bottom-16 right-4 w-80 bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl z-50 max-h-72 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-white">在线字幕搜索</span>
                {isSearchingOnline && (
                  <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                )}
              </div>
              <div className="flex items-center gap-1">
                <input
                  className="w-28 bg-white/5 border border-neutral-600 rounded px-2 py-0.5 text-[11px] text-white placeholder:text-white/30
                    focus:outline-none focus:border-anibox-accent"
                  placeholder="搜索关键词..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onOnlineSearch?.((e.target as HTMLInputElement).value)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={() => {
                    onOnlineSearch?.()
                    setShowSubtitleMenu(false)
                  }}
                  className="text-[11px] px-2 py-0.5 bg-anibox-accent hover:bg-anibox-accent-hover text-white rounded"
                >
                  搜索
                </button>
                <button
                  onClick={() => onToggleOnlineSearch?.()}
                  className="text-white/40 hover:text-white ml-1"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {onlineSearchResults && onlineSearchResults.length === 0 && !isSearchingOnline && (
                <p className="text-xs text-neutral-400 py-4 text-center">
                  未找到字幕，尝试更换关键词
                </p>
              )}
              {onlineSearchResults?.map((r: any, i: number) => (
                <div
                  key={r.id || i}
                  className="flex items-center justify-between px-3 py-2 hover:bg-white/5 border-b border-neutral-700/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{r.fileName || r.title}</p>
                    <p className="text-[10px] text-neutral-400">
                      {r.languageLabel || r.language}
                      {r.source ? ` · ${r.source}` : ''}
                      {r.downloads ? ` · ↓${r.downloads}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onOnlineSubDownload?.(r)
                    }}
                    className="ml-2 text-[11px] px-2 py-0.5 bg-anibox-accent/80 hover:bg-anibox-accent text-white rounded shrink-0"
                  >
                    下载
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 字幕样式设置面板 */}
        {showSubtitleSettings && subtitleStyle && onSubtitleStyleChange && (
          <div
            className="absolute bottom-16 right-4 w-64 bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
              <span className="text-xs font-medium text-white">字幕样式</span>
              <button
                onClick={() => onToggleSubtitleSettings?.()}
                className="text-white/40 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="px-3 py-2 space-y-2 text-xs">
              {/* 字体大小 */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">字体大小</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      onSubtitleStyleChange({ fontSize: Math.max(14, subtitleStyle.fontSize - 2) })
                    }
                    className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
                  >
                    −
                  </button>
                  <span className="text-white w-8 text-center">{subtitleStyle.fontSize}</span>
                  <button
                    onClick={() =>
                      onSubtitleStyleChange({ fontSize: Math.min(48, subtitleStyle.fontSize + 2) })
                    }
                    className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
              {/* 副字幕字体大小 */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">副字幕大小</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      onSubtitleStyleChange({
                        secondaryFontSize: Math.max(12, subtitleStyle.secondaryFontSize - 2),
                      })
                    }
                    className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
                  >
                    −
                  </button>
                  <span className="text-white w-8 text-center">
                    {subtitleStyle.secondaryFontSize}
                  </span>
                  <button
                    onClick={() =>
                      onSubtitleStyleChange({
                        secondaryFontSize: Math.min(40, subtitleStyle.secondaryFontSize + 2),
                      })
                    }
                    className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
              {/* 描边粗细 */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">描边粗细</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      onSubtitleStyleChange({
                        strokeWidth: Math.max(0, subtitleStyle.strokeWidth - 1),
                      })
                    }
                    className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
                  >
                    −
                  </button>
                  <span className="text-white w-8 text-center">{subtitleStyle.strokeWidth}</span>
                  <button
                    onClick={() =>
                      onSubtitleStyleChange({
                        strokeWidth: Math.min(6, subtitleStyle.strokeWidth + 1),
                      })
                    }
                    className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
              {/* 位置 */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">显示位置</span>
                <select
                  value={subtitleStyle.position}
                  onChange={(e) =>
                    onSubtitleStyleChange({ position: e.target.value as 'top' | 'bottom' })
                  }
                  className="bg-white/5 border border-neutral-600 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none"
                >
                  <option value="bottom">底部</option>
                  <option value="top">顶部</option>
                </select>
              </div>
              {/* 文字颜色 */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">文字颜色</span>
                <input
                  type="color"
                  value={subtitleStyle.textColor}
                  onChange={(e) => onSubtitleStyleChange({ textColor: e.target.value })}
                  className="w-6 h-5 bg-transparent border border-neutral-600 rounded cursor-pointer"
                />
              </div>
              {/* 背景不透明度 */}
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">背景不透明度</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={(() => {
                    try {
                      const m = subtitleStyle.bgColor.match(
                        /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/,
                      )
                      return m ? Math.round(parseFloat(m[1]) * 100) : 50
                    } catch {
                      return 50
                    }
                  })()}
                  onChange={(e) => {
                    const alpha = parseInt(e.target.value) / 100
                    onSubtitleStyleChange?.({ bgColor: `rgba(0,0,0,${alpha.toFixed(1)})` })
                  }}
                  className="w-20 h-3"
                />
              </div>
            </div>
          </div>
        )}

        {/* 弹幕设置面板 */}
        {showDanmakuSettings && danmakuConfig && onDanmakuConfigChange && (
          <div
            className="absolute bottom-16 right-4 w-72 bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
              <span className="text-xs font-medium text-white">
                弹幕设置 ({danmakuCount ?? 0}条)
              </span>
              <button
                onClick={() => onToggleDanmakuSettings?.()}
                className="text-white/40 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="px-3 py-2 space-y-2 text-xs max-h-80 overflow-y-auto">
              <label className="flex items-center justify-between">
                <span className="text-neutral-400">启用弹幕</span>
                <input
                  type="checkbox"
                  checked={danmakuConfig.enabled}
                  onChange={(e) => onDanmakuConfigChange({ enabled: e.target.checked })}
                  className="accent-anibox-accent"
                />
              </label>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">密度</span>
                <input
                  type="range"
                  min="0.2"
                  max="2"
                  step="0.1"
                  value={danmakuConfig.density}
                  onChange={(e) => onDanmakuConfigChange({ density: parseFloat(e.target.value) })}
                  className="w-24 h-3"
                />
                <span className="text-white w-6 text-right">{danmakuConfig.density}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">速度</span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={danmakuConfig.speed}
                  onChange={(e) => onDanmakuConfigChange({ speed: parseFloat(e.target.value) })}
                  className="w-24 h-3"
                />
                <span className="text-white w-6 text-right">{danmakuConfig.speed}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">透明度</span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={danmakuConfig.opacity}
                  onChange={(e) => onDanmakuConfigChange({ opacity: parseFloat(e.target.value) })}
                  className="w-24 h-3"
                />
                <span className="text-white w-6 text-right">{danmakuConfig.opacity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">字体缩放</span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={danmakuConfig.fontScale}
                  onChange={(e) => onDanmakuConfigChange({ fontScale: parseFloat(e.target.value) })}
                  className="w-24 h-3"
                />
                <span className="text-white w-6 text-right">{danmakuConfig.fontScale}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">时间偏移(ms)</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      onDanmakuConfigChange({
                        offsetMs: Math.max(-5000, (danmakuConfig.offsetMs ?? 0) - 200),
                      })
                    }
                    className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
                  >
                    −
                  </button>
                  <span className="text-white w-10 text-center">{danmakuConfig.offsetMs ?? 0}</span>
                  <button
                    onClick={() =>
                      onDanmakuConfigChange({
                        offsetMs: Math.min(5000, (danmakuConfig.offsetMs ?? 0) + 200),
                      })
                    }
                    className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="border-t border-neutral-700 pt-1.5 flex gap-3">
                <label className="flex items-center gap-1 text-neutral-400">
                  <input
                    type="checkbox"
                    checked={danmakuConfig.showScroll}
                    onChange={(e) => onDanmakuConfigChange({ showScroll: e.target.checked })}
                    className="accent-anibox-accent"
                  />
                  滚动
                </label>
                <label className="flex items-center gap-1 text-neutral-400">
                  <input
                    type="checkbox"
                    checked={danmakuConfig.showTop}
                    onChange={(e) => onDanmakuConfigChange({ showTop: e.target.checked })}
                    className="accent-anibox-accent"
                  />
                  顶部
                </label>
                <label className="flex items-center gap-1 text-neutral-400">
                  <input
                    type="checkbox"
                    checked={danmakuConfig.showBottom}
                    onChange={(e) => onDanmakuConfigChange({ showBottom: e.target.checked })}
                    className="accent-anibox-accent"
                  />
                  底部
                </label>
              </div>
              <div className="border-t border-neutral-700 pt-1.5 space-y-1.5">
                <div className="text-[10px] text-neutral-500 uppercase">屏蔽过滤</div>
                <input
                  type="text"
                  value={danmakuFilterText || ''}
                  placeholder="屏蔽关键词（用|分隔）"
                  onChange={(e) => onDanmakuFilterText?.(e.target.value)}
                  className="w-full bg-white/5 border border-neutral-600 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:border-anibox-accent"
                />
                <input
                  type="text"
                  value={danmakuFilterRegex || ''}
                  placeholder="正则过滤"
                  onChange={(e) => onDanmakuFilterRegex?.(e.target.value)}
                  className="w-full bg-white/5 border border-neutral-600 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:border-anibox-accent"
                />
              </div>
              {onSendDanmaku && (
                <div className="border-t border-neutral-700 pt-1.5">
                  <div className="text-[10px] text-neutral-500 uppercase mb-1">发送弹幕</div>
                  <div className="flex gap-1">
                    <input
                      type="color"
                      defaultValue="#FFFFFF"
                      className="w-7 h-6 bg-transparent border border-neutral-600 rounded cursor-pointer shrink-0"
                      id="danmaku-color"
                    />
                    <select
                      defaultValue="scroll"
                      className="bg-white/5 border border-neutral-600 rounded px-1 text-[11px] text-white shrink-0"
                      id="danmaku-mode"
                    >
                      <option value="scroll">滚动</option>
                      <option value="top">顶部</option>
                      <option value="bottom">底部</option>
                    </select>
                    <input
                      type="text"
                      placeholder="说点什么..."
                      className="flex-1 bg-white/5 border border-neutral-600 rounded px-2 py-0.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-anibox-accent"
                      id="danmaku-input"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const i = e.target as HTMLInputElement
                          const c = document.getElementById('danmaku-color') as HTMLInputElement
                          const m = document.getElementById('danmaku-mode') as HTMLSelectElement
                          onSendDanmaku(i.value, c?.value || '#FFFFFF', m?.value || 'scroll')
                          i.value = ''
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const i = document.getElementById('danmaku-input') as HTMLInputElement
                        const c = document.getElementById('danmaku-color') as HTMLInputElement
                        const m = document.getElementById('danmaku-mode') as HTMLSelectElement
                        if (i && c && m) {
                          onSendDanmaku(i.value, c.value || '#FFFFFF', m.value || 'scroll')
                          i.value = ''
                        }
                      }}
                      className="text-[11px] px-2 bg-anibox-accent hover:bg-anibox-accent-hover text-white rounded shrink-0"
                    >
                      发送
                    </button>
                  </div>
                </div>
              )}
              {onDanmakuExport && (danmakuCount ?? 0) > 0 && (
                <button
                  onClick={onDanmakuExport}
                  className="w-full text-[11px] py-1 bg-white/5 hover:bg-white/10 border border-neutral-600 rounded text-neutral-300"
                >
                  导出弹幕文件 (.xml)
                </button>
              )}
            </div>
          </div>
        )}

        {/* 音轨选择 */}
        {audioTracks && audioTracks.length > 1 && onAudioChange && (
          <div className="relative" ref={audioMenuRef}>
            <button
              onClick={() => setShowAudioMenu(!showAudioMenu)}
              className={`text-xs transition-colors px-1 py-0.5 rounded ${
                selectedAudioIdx > 0 ? 'text-anibox-accent' : 'text-white/60 hover:text-white'
              }`}
              title="音轨 (A)"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 10v4m4-8v12m4-10v8m4-12v16m4-14v12m4-10v8" />
              </svg>
            </button>
            {showAudioMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-anibox-overlay border border-neutral-700 rounded-md shadow-xl py-1 z-50 min-w-[120px]">
                {audioTracks.map((track, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onAudioChange(track.index)
                      setShowAudioMenu(false)
                    }}
                    className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors whitespace-nowrap ${
                      selectedAudioIdx === track.index
                        ? 'text-anibox-accent font-medium'
                        : 'text-white/80'
                    }`}
                  >
                    {track.label}
                    {track.language ? (
                      <span className="text-white/30 ml-1">({track.language})</span>
                    ) : (
                      ''
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 画面比例 */}
        {onAspectCycle && (
          <button
            onClick={onAspectCycle}
            className={`text-xs transition-colors px-1 py-0.5 rounded ${
              aspectMode && aspectMode !== 'auto'
                ? 'text-anibox-accent'
                : 'text-white/60 hover:text-white'
            }`}
            title={`画面比例: ${aspectMode || 'auto'} (R)`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M8 3v18M3 8h18" strokeWidth="0.5" strokeDasharray="2 2" />
            </svg>
          </button>
        )}

        {/* 截图 */}
        {onScreenshot && (
          <button
            onClick={onScreenshot}
            className="text-white/60 hover:text-white transition-colors"
            title="截图 (S)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        )}

        {/* 画中画 */}
        {onPiP && (
          <button
            onClick={onPiP}
            className={`transition-colors ${isPiP ? 'text-anibox-accent' : 'text-white/60 hover:text-white'}`}
            title="画中画 (P)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <rect
                x="11"
                y="8"
                width="10"
                height="8"
                rx="1"
                strokeWidth="1.5"
                fill="currentColor"
                fillOpacity="0.2"
              />
            </svg>
          </button>
        )}

        {/* 播放模式 */}
        {onCyclePlayMode && playMode && (
          <button
            onClick={onCyclePlayMode}
            className={`text-xs transition-colors px-1 py-0.5 rounded ${
              playMode !== 'sequential' ? 'text-anibox-accent' : 'text-white/60 hover:text-white'
            }`}
            title={`播放模式: ${{ sequential: '顺序', 'loop-one': '单集循环', 'loop-all': '列表循环', shuffle: '随机' }[playMode] || playMode} (L)`}
          >
            {playMode === 'sequential' && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9,6 15,12 9,18" />
              </svg>
            )}
            {playMode === 'loop-one' && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11v-1a4 4 0 014-4h14" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v1a4 4 0 01-4 4H3" />
              </svg>
            )}
            {playMode === 'loop-all' && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11v-1a4 4 0 014-4h14" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v1a4 4 0 01-4 4H3" />
                <circle cx="12" cy="12" r="1" fill="currentColor" />
              </svg>
            )}
            {playMode === 'shuffle' && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="16,3 21,3 21,8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21,16 21,21 16,21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            )}
          </button>
        )}

        {/* 选集 */}
        {hasEpisodeList && (episodes || onEpisodeList) && (
          <button
            onClick={() => {
              if (episodes && episodes.length > 0) {
                setShowEpisodePanel((prev) => !prev)
              } else {
                onEpisodeList?.()
              }
            }}
            className="text-white/60 hover:text-white transition-colors"
            title="选集"
          >
            <svg
              width="16"
              height="16"
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
          </button>
        )}

        {/* 弹幕按钮 */}
        {onDanmakuFetch && (
          <div className="relative">
            <button
              onClick={() => onDanmakuFetch?.()}
              disabled={isLoadingDanmaku}
              className={`transition-colors ${
                isLoadingDanmaku
                  ? 'text-white/30 cursor-not-allowed'
                  : 'text-white/50 hover:text-white'
              }`}
              title={(danmakuCount ?? 0) > 0 ? `加载弹幕 (当前${danmakuCount}条)` : '加载弹幕'}
            >
              {isLoadingDanmaku ? (
                <div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <line x1="8" y1="9" x2="8" y2="9.01" />
                  <line x1="12" y1="9" x2="12" y2="9.01" />
                  <line x1="16" y1="9" x2="16" y2="9.01" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* 弹幕设置入口 */}
        {onDanmakuFetch && (danmakuCount ?? 0) > 0 && (
          <button
            onClick={() => onToggleDanmakuSettings?.()}
            className={`transition-colors ${showDanmakuSettings ? 'text-anibox-accent' : 'text-white/40 hover:text-white'}`}
            title="弹幕设置"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}

        {/* 生词点查 */}
        {onWordLookup && (
          <button
            onClick={onWordLookup}
            className="text-white/50 hover:text-anibox-accent transition-colors"
            title="生词点查 (W)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <line x1="12" y1="6" x2="12" y2="6.01" />
              <line x1="8" y1="6" x2="8" y2="6.01" />
              <line x1="16" y1="6" x2="16" y2="6.01" />
            </svg>
          </button>
        )}

        {/* Whisper 语音识别 */}
        {onWhisperTranscribe && (
          <button
            onClick={onWhisperTranscribe}
            className={`transition-colors ${isWhisperAvailable ? 'text-white/50 hover:text-anibox-accent' : 'text-white/20'}`}
            title={isWhisperAvailable ? '语音识别生成字幕 (Ctrl+W)' : 'Whisper 未配置'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}

        {/* 全屏切换 */}
        <button
          onClick={onToggleFullscreen}
          className="text-white/80 hover:text-white transition-colors"
          title={isFullscreen ? '退出全屏 (F)' : '全屏 (F)'}
        >
          {isFullscreen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          )}
        </button>
      </div>

      {/* 选集浮层面板 */}
      {showEpisodePanel && episodes && episodes.length > 0 && (
        <div
          className="absolute bottom-16 right-4 w-72 max-h-80 bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl z-50 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 shrink-0">
            <span className="text-xs font-medium text-white">选集</span>
            <button
              onClick={() => setShowEpisodePanel(false)}
              className="text-white/40 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-5 gap-1.5">
              {episodes.map((ep, i) => {
                const isCurrent = i === currentEpIndex
                return (
                  <button
                    key={ep.filePath}
                    onClick={() => {
                      onSelectEpisode?.(i)
                      setShowEpisodePanel(false)
                    }}
                    className={`aspect-square rounded text-xs font-medium transition-colors flex items-center justify-center
                      ${
                        isCurrent
                          ? 'bg-anibox-accent text-white'
                          : 'bg-white/5 text-white/70 hover:bg-white/15 hover:text-white'
                      }`}
                    title={ep.fileName}
                  >
                    {ep.epNumber ?? i + 1}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
