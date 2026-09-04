import { useState, useRef, useEffect } from 'react'
import {
  CONTROL_ITEMS,
  PLAYBACK_SPEEDS,
  DEFAULT_CONTROLS_LAYOUT,
  type ControlItemDef,
  type ControlsProps,
} from './controlsData'

/** 「更多 ⋯」菜单上下文：全部 props + 少量由 Controls 提供的交互回调 */
export interface MoreMenuCtx extends ControlsProps {
  /** 打开选集面板（菜单行内触发；关闭动作由菜单自己处理） */
  openEpisodes: () => void
  /** 双语字幕循环切换（栏内按钮与菜单行共用同一实现） */
  cycleSecondarySubtitle: () => void
}

/**
 * 更多 ⋯ 菜单：未放进控制栏的可用按钮收在这里。
 * 溢出为空时连触发按钮一起隐藏。
 */
export default function MoreMenu({ ctx }: { ctx: MoreMenuCtx }) {
  const [showMenu, setShowMenu] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
        setExpandedKey(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const layoutSet = new Set(ctx.controlsLayout ?? DEFAULT_CONTROLS_LAYOUT)

  const {
    episodes,
    onEpisodeList,
    playbackRate,
    onSpeedChange,
    playMode,
    onCyclePlayMode,
    aspectMode,
    onAspectCycle,
    onScreenshot,
    isPiP,
    onPiP,
    audioTracks,
    selectedAudioIdx,
    onAudioChange,
    volumeNormalization,
    onVolumeNormalizationToggle,
    audioDelay,
    onAudioDelayChange,
    subtitleTracks,
    selectedSubtitleIdx,
    onSubtitleChange,
    showOnlineSearch,
    onToggleOnlineSearch,
    selectedSecondarySubIdx,
    showSubtitleSettings,
    onToggleSubtitleSettings,
    danmakuCount,
    danmakuConfig,
    onDanmakuConfigChange,
    isLoadingDanmaku,
    onDanmakuFetch,
    showDanmakuSettings,
    onToggleDanmakuSettings,
    enhanceEnabled,
    onEnhanceToggle,
    enhancePreset,
    onEnhancePreset,
    abCompare,
    onAbCompare,
    skipShortcutEnabled,
    onSkipShortcutToggle,
    onWordLookup,
    isWhisperAvailable,
    onWhisperTranscribe,
  } = ctx

  // 某按钮当前是否具备出现条件（栏内与菜单同一套判断；配置只决定放哪，不决定有没有）
  const isItemAvailable = (key: string): boolean => {
    switch (key) {
      case 'prevEp':
        return !!(ctx.hasPrevEpisode && ctx.onPrevEpisode)
      case 'nextEp':
        return !!(ctx.hasNextEpisode && ctx.onNextEpisode)
      case 'episodes':
        return !!(ctx.hasEpisodeList && (episodes || onEpisodeList))
      case 'speed':
        return true
      case 'playMode':
        return !!(onCyclePlayMode && playMode)
      case 'aspect':
        return !!onAspectCycle
      case 'screenshot':
        return !!onScreenshot
      case 'pip':
        return !!onPiP
      case 'audioTrack':
        return !!(audioTracks && audioTracks.length > 1 && onAudioChange)
      case 'volumeNormalization':
        return !!onVolumeNormalizationToggle
      case 'audioDelay':
        return !!(onAudioDelayChange && audioDelay !== undefined)
      case 'subtitle':
        return !!(subtitleTracks && subtitleTracks.length > 0 && onSubtitleChange)
      case 'onlineSearch':
        return !!ctx.onOnlineSearch
      case 'dualSub':
        return !!ctx.onSecondarySubtitleChange
      case 'subStyle':
        return !!onToggleSubtitleSettings
      case 'danmakuToggle':
        return true
      case 'danmakuFetch':
        return !!onDanmakuFetch
      case 'danmakuSettings':
        return !!(onDanmakuFetch && (danmakuCount ?? 0) > 0)
      case 'enhance':
        return !!onEnhanceToggle
      case 'abCompare':
        return !!(onAbCompare && enhanceEnabled)
      case 'skipShortcut':
        return !!onSkipShortcutToggle
      case 'wordLookup':
        return !!onWordLookup
      case 'whisper':
        return !!onWhisperTranscribe
      default:
        return false
    }
  }

  // 未放进栏内、且当前可用的按钮 → 「更多 ⋯」菜单行
  const moreItems = CONTROL_ITEMS.filter((it) => !layoutSet.has(it.key) && isItemAvailable(it.key))

  if (moreItems.length === 0) return null

  const close = () => {
    setShowMenu(false)
    setExpandedKey(null)
  }

  // 「更多 ⋯」菜单行：行为与栏内按钮一致；纯开关保持菜单展开以便看到状态变化
  const renderMoreRow = (item: ControlItemDef) => {
    const rowCls = (active?: boolean) =>
      `w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-white/10 transition-colors text-left ${
        active ? 'text-anibox-accent' : 'text-white/80'
      }`
    const dot = (active: boolean) =>
      active ? <span className="w-1.5 h-1.5 rounded-full bg-anibox-accent shrink-0" /> : null
    const expandRowCls = (expanded: boolean) =>
      `w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-white/10 transition-colors text-left ${
        expanded ? 'text-anibox-accent' : 'text-white/80'
      }`

    switch (item.key) {
      case 'prevEp':
        return (
          <button
            key={item.key}
            className={rowCls()}
            onClick={() => {
              ctx.onPrevEpisode?.()
              close()
            }}
          >
            {item.label}
          </button>
        )
      case 'nextEp':
        return (
          <button
            key={item.key}
            className={rowCls()}
            onClick={() => {
              ctx.onNextEpisode?.()
              close()
            }}
          >
            {item.label}
          </button>
        )
      case 'episodes':
        return (
          <button
            key={item.key}
            className={rowCls()}
            onClick={() => {
              ctx.openEpisodes()
              close()
            }}
          >
            {item.label}
          </button>
        )
      case 'speed':
        return (
          <div key={item.key}>
            <button
              className={expandRowCls(expandedKey === 'speed')}
              onClick={() => setExpandedKey(expandedKey === 'speed' ? null : 'speed')}
            >
              {item.label}
              <span className="text-white/50 tabular-nums">{playbackRate}x</span>
            </button>
            {expandedKey === 'speed' && (
              <div className="bg-black/20 py-1">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => {
                      onSpeedChange(speed)
                      close()
                    }}
                    className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors whitespace-nowrap ${
                      playbackRate === speed ? 'text-anibox-accent font-medium' : 'text-white/80'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      case 'playMode':
        return (
          <button
            key={item.key}
            className={rowCls(!!playMode && playMode !== 'sequential')}
            onClick={onCyclePlayMode}
          >
            {item.label}
            <span className="text-white/40">
              {playMode === 'loop-one'
                ? '单集循环'
                : playMode === 'loop-all'
                  ? '列表循环'
                  : playMode === 'shuffle'
                    ? '随机'
                    : '顺序'}
            </span>
          </button>
        )
      case 'aspect':
        return (
          <button
            key={item.key}
            className={rowCls(!!aspectMode && aspectMode !== 'auto')}
            onClick={onAspectCycle}
          >
            {item.label}
            <span className="text-white/40">{aspectMode || 'auto'}</span>
          </button>
        )
      case 'screenshot':
        return (
          <button
            key={item.key}
            className={rowCls()}
            onClick={() => {
              onScreenshot?.()
              close()
            }}
          >
            {item.label}
          </button>
        )
      case 'pip':
        return (
          <button key={item.key} className={rowCls(!!isPiP)} onClick={onPiP}>
            {item.label}
            {dot(!!isPiP)}
          </button>
        )
      case 'audioTrack':
        return (
          <div key={item.key}>
            <button
              className={expandRowCls(expandedKey === 'audioTrack')}
              onClick={() => setExpandedKey(expandedKey === 'audioTrack' ? null : 'audioTrack')}
            >
              {item.label}
              <span className="text-white/50">{audioTracks?.[selectedAudioIdx ?? 0]?.label || '—'}</span>
            </button>
            {expandedKey === 'audioTrack' && audioTracks && onAudioChange && (
              <div className="bg-black/20 py-1">
                {audioTracks.map((track) => (
                  <button
                    key={track.index}
                    onClick={() => {
                      onAudioChange(track.index)
                      close()
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
        )
      case 'volumeNormalization':
        return (
          <button
            key={item.key}
            className={rowCls(!!volumeNormalization)}
            onClick={onVolumeNormalizationToggle}
          >
            {item.label}
            {dot(!!volumeNormalization)}
          </button>
        )
      case 'audioDelay':
        return (
          <div
            key={item.key}
            className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-white/80"
          >
            <span className="tabular-nums">
              {item.label} {audioDelay! > 0 ? `+${audioDelay}` : '0'}ms
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onAudioDelayChange!(Math.max(0, audioDelay! - 50))}
                disabled={audioDelay! <= 0}
                className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded disabled:opacity-30"
              >
                −50
              </button>
              <button
                onClick={() => onAudioDelayChange!(Math.min(500, audioDelay! + 50))}
                disabled={audioDelay! >= 500}
                className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 rounded disabled:opacity-30"
              >
                +50
              </button>
            </div>
          </div>
        )
      case 'subtitle':
        return (
          <div key={item.key}>
            <button
              className={expandRowCls(expandedKey === 'subtitle')}
              onClick={() => setExpandedKey(expandedKey === 'subtitle' ? null : 'subtitle')}
            >
              {item.label}
              <span className="text-white/50">
                {(selectedSubtitleIdx ?? -1) >= 0
                  ? subtitleTracks?.[selectedSubtitleIdx ?? -1]?.label || '—'
                  : '关闭'}
              </span>
            </button>
            {expandedKey === 'subtitle' && subtitleTracks && onSubtitleChange && (
              <div className="bg-black/20 py-1">
                <button
                  onClick={() => {
                    onSubtitleChange(-1)
                    close()
                  }}
                  className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                    (selectedSubtitleIdx ?? -1) < 0
                      ? 'text-anibox-accent font-medium'
                      : 'text-white/80'
                  }`}
                >
                  关闭字幕
                </button>
                {subtitleTracks.map((track, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onSubtitleChange(i)
                      close()
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
              </div>
            )}
          </div>
        )
      case 'onlineSearch':
        return (
          <button
            key={item.key}
            className={rowCls(!!showOnlineSearch)}
            onClick={() => {
              onToggleOnlineSearch?.()
              close()
            }}
          >
            {item.label}
            {dot(!!showOnlineSearch)}
          </button>
        )
      case 'dualSub':
        return (
          <button
            key={item.key}
            className={rowCls((selectedSecondarySubIdx ?? -1) >= 0)}
            onClick={ctx.cycleSecondarySubtitle}
          >
            {item.label}
            {dot((selectedSecondarySubIdx ?? -1) >= 0)}
          </button>
        )
      case 'subStyle':
        return (
          <button
            key={item.key}
            className={rowCls(!!showSubtitleSettings)}
            onClick={() => {
              onToggleSubtitleSettings?.()
              close()
            }}
          >
            {item.label}
            {dot(!!showSubtitleSettings)}
          </button>
        )
      case 'danmakuToggle': {
        const noDanmaku = (danmakuCount ?? 0) === 0
        return (
          <button
            key={item.key}
            className={`${rowCls(!!danmakuConfig?.enabled)} ${noDanmaku ? 'opacity-40' : ''}`}
            onClick={() => {
              if (noDanmaku) return
              onDanmakuConfigChange?.({ enabled: !danmakuConfig?.enabled })
            }}
          >
            {item.label}
            <span className="text-white/40">
              {noDanmaku ? '未加载' : danmakuConfig?.enabled ? '开' : '关'}
            </span>
          </button>
        )
      }
      case 'danmakuFetch':
        return (
          <button
            key={item.key}
            className={`${rowCls()} ${isLoadingDanmaku ? 'opacity-40' : ''}`}
            onClick={() => {
              onDanmakuFetch?.()
              close()
            }}
          >
            {item.label}
            <span className="text-white/40">{danmakuCount ?? 0} 条</span>
          </button>
        )
      case 'danmakuSettings':
        return (
          <button
            key={item.key}
            className={rowCls(!!showDanmakuSettings)}
            onClick={() => {
              onToggleDanmakuSettings?.()
              close()
            }}
          >
            {item.label}
            {dot(!!showDanmakuSettings)}
          </button>
        )
      case 'enhance':
        return (
          <div key={item.key}>
            <button className={rowCls(!!enhanceEnabled)} onClick={() => onEnhanceToggle?.()}>
              {item.label}
              {dot(!!enhanceEnabled)}
            </button>
            {enhanceEnabled && onEnhancePreset && (
              <div className="flex gap-1 px-3 py-1 bg-black/20">
                {['balanced', 'quality', 'performance'].map((p) => (
                  <button
                    key={p}
                    onClick={() => onEnhancePreset(p)}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      (enhancePreset || 'balanced') === p
                        ? 'bg-anibox-accent text-white'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {p === 'balanced' ? '均衡' : p === 'quality' ? '高质量' : '性能'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      case 'abCompare':
        return (
          <button key={item.key} className={rowCls(!!abCompare)} onClick={onAbCompare}>
            {item.label}
            {dot(!!abCompare)}
          </button>
        )
      case 'skipShortcut':
        return (
          <button
            key={item.key}
            className={rowCls(!!skipShortcutEnabled)}
            onClick={onSkipShortcutToggle}
          >
            {item.label}
            <span className="text-white/40">{skipShortcutEnabled ? '开' : '关'}</span>
          </button>
        )
      case 'wordLookup':
        return (
          <button
            key={item.key}
            className={rowCls()}
            onClick={() => {
              onWordLookup?.()
              close()
            }}
          >
            {item.label}
          </button>
        )
      case 'whisper':
        return (
          <button
            key={item.key}
            className={`${rowCls()} ${isWhisperAvailable ? '' : 'opacity-40'}`}
            onClick={() => {
              onWhisperTranscribe?.()
              close()
            }}
          >
            {item.label}
          </button>
        )
      default:
        return null
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          setShowMenu((v) => !v)
          setExpandedKey(null)
        }}
        className={`transition-colors ${showMenu ? 'text-white' : 'text-white/50 hover:text-white'}`}
        title="更多功能"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {showMenu && (
        <div
          className="absolute bottom-full right-0 mb-2 bg-anibox-overlay border border-neutral-700 rounded-md shadow-xl py-1 z-50 min-w-[190px] max-h-[60vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {moreItems.map((it) => renderMoreRow(it))}
        </div>
      )}
    </div>
  )
}
