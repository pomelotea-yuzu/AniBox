// ===== 控制栏纯数据与类型（Controls / SettingsModal 共用的单一数据源） =====
// 设置页「播放」tab →「控制栏按钮」checkbox 列表与控制栏显隐共用这份定义。
// controlsLayout 数组里出现的 key 显示在栏内，其余可用的收进「更多 ⋯」菜单。

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

export interface ControlItemDef {
  key: string
  label: string
}

export const CONTROL_GROUPS: { name: string; items: ControlItemDef[] }[] = [
  {
    name: '切集',
    items: [
      { key: 'prevEp', label: '上一集' },
      { key: 'nextEp', label: '下一集' },
      { key: 'episodes', label: '选集' },
    ],
  },
  {
    name: '播放',
    items: [
      { key: 'speed', label: '倍速' },
      { key: 'playMode', label: '播放模式' },
      { key: 'aspect', label: '画面比例' },
      { key: 'screenshot', label: '截图' },
      { key: 'pip', label: '画中画' },
    ],
  },
  {
    name: '声音',
    items: [
      { key: 'audioTrack', label: '音轨' },
      { key: 'volumeNormalization', label: '音量均衡' },
      { key: 'audioDelay', label: '音频延迟' },
    ],
  },
  {
    name: '字幕',
    items: [
      { key: 'subtitle', label: '字幕选择' },
      { key: 'onlineSearch', label: '在线搜索字幕' },
      { key: 'dualSub', label: '双语字幕切换' },
      { key: 'subStyle', label: '字幕样式' },
    ],
  },
  {
    name: '弹幕',
    items: [
      { key: 'danmakuToggle', label: '弹幕开关' },
      { key: 'danmakuFetch', label: '加载弹幕' },
      { key: 'danmakuSettings', label: '弹幕设置' },
    ],
  },
  {
    name: '画质',
    items: [
      { key: 'enhance', label: 'Anime4K 增强' },
      { key: 'abCompare', label: 'A/B 对比' },
    ],
  },
  {
    name: '跳过',
    items: [{ key: 'skipShortcut', label: 'OP/ED 跳过开关' }],
  },
  {
    name: '学习',
    items: [
      { key: 'wordLookup', label: '生词点查' },
      { key: 'whisper', label: 'Whisper 语音识别' },
    ],
  },
]

export const CONTROL_ITEMS: ControlItemDef[] = CONTROL_GROUPS.flatMap((g) => g.items)

/** 精简默认：只保留高频项，其余收进「更多 ⋯」菜单 */
export const DEFAULT_CONTROLS_LAYOUT = [
  'prevEp',
  'nextEp',
  'episodes',
  'speed',
  'subtitle',
  'audioTrack',
  'danmakuToggle',
  'aspect',
  'screenshot',
  'playMode',
]

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

export interface ControlsProps {
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
  /** OP/ED 跳过（快捷键模式）：连按 3 次右方向键 = 跳过 skipSeconds 秒 */
  skipShortcutEnabled?: boolean
  /** OP/ED 跳过秒数（0-90，默认 90；仅用于按钮提示文案） */
  skipSeconds?: number
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
  /** 控制栏自定义：出现在栏内的按钮 key 列表；未列出的可用按钮收进「更多 ⋯」菜单 */
  controlsLayout?: string[]
}
