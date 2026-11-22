import { useEffect, useRef, useState, useCallback } from 'react'

interface MpvTrack {
  id: number
  type: string
  lang: string
  title: string
  codec: string
  selected: boolean
}

interface MpvOverlayProps {
  filePath: string
  onClose: () => void
  /** 播放模式：sequential / loop-one / loop-all / shuffle */
  playMode?: string
  /** 下一话标题（用于连播提示） */
  nextEpisodeTitle?: string
  /** 播放下一集的回调（App 层复用 handleNextEpisode） */
  onNextEpisode?: () => void
}

/** mpv 兜底播放——HTML5 解不了时自动切换，内置字幕/音轨控制，支持自动连播 */
export default function MpvOverlay({
  filePath,
  onClose,
  playMode,
  nextEpisodeTitle,
  onNextEpisode,
}: MpvOverlayProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const playModeRef = useRef(playMode)
  playModeRef.current = playMode
  const onNextEpisodeRef = useRef(onNextEpisode)
  onNextEpisodeRef.current = onNextEpisode
  const offMpvEventRef = useRef<(() => void) | null>(null)

  const [subtitleTracks, setSubtitleTracks] = useState<MpvTrack[]>([])
  const [audioTracks, setAudioTracks] = useState<MpvTrack[]>([])
  const [showControls, setShowControls] = useState(false)

  const handleCommand = useCallback((cmd: any[]) => {
    window.electronAPI.mpvCommand(cmd).catch(() => {})
  }, [])

  useEffect(() => {
    window.electronAPI.mpvPlay(filePath)

    const offMpvEvent = window.electronAPI.mpvOnEvent((event) => {
      if (event.event === 'end-file') {
        // 仅当正常播放到末尾（eof）时触发连播；
        // stop（loadfile 替换产生）/error/quit 等忽略，避免误关
        if (event.reason === 'eof') {
          if (playModeRef.current === 'loop-one') {
            // 单集循环：重新加载当前文件（不重启进程）
            window.electronAPI.mpvCommand(['loadfile', filePath, 'replace']).catch(() => {})
          } else if (onNextEpisodeRef.current) {
            // 自动连播：先摘监听，防止后续 quit 触发的 end 事件误关播放器
            offMpvEventRef.current?.()
            onNextEpisodeRef.current()
          } else {
            onCloseRef.current()
          }
        }
      } else if (event.event === 'end') {
        // mpv 进程退出（用户手动关闭窗口等）
        onCloseRef.current()
      } else if (event.event === 'tracks' && Array.isArray(event.data)) {
        const tracks = event.data as MpvTrack[]
        setSubtitleTracks(tracks.filter((t) => t.type === 'sub'))
        setAudioTracks(tracks.filter((t) => t.type === 'audio'))
      }
    })
    offMpvEventRef.current = offMpvEvent

    // 点击任意位置显示/隐藏控制
    const onClick = () => setShowControls((v) => !v)
    window.addEventListener('click', onClick)

    return () => {
      offMpvEventRef.current = null
      window.electronAPI.mpvQuit().catch(() => {})
      offMpvEvent()
      window.removeEventListener('click', onClick)
    }
  }, [filePath, handleCommand])

  const fileName = filePath.split(/[/\\]/).pop() || filePath

  // 手动跳下一话
  const handleGotoNext = useCallback(() => {
    if (!onNextEpisodeRef.current) return
    offMpvEventRef.current?.()
    onNextEpisodeRef.current()
  }, [])

  const playModeLabel =
    playMode === 'loop-one'
      ? '单集循环'
      : playMode === 'loop-all'
        ? '列表循环'
        : playMode === 'shuffle'
          ? '随机播放'
          : '顺序播放'

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-anibox-bg select-none relative">
      {/* 播放指示器 */}
      <div
        className={`w-12 h-12 rounded-full bg-anibox-accent/10 flex items-center justify-center ${showControls ? '' : 'animate-pulse'}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-anibox-accent">
          <polygon points="5,3 19,12 5,21" />
        </svg>
      </div>
      <p className="text-sm text-anibox-text-muted">mpv 播放中</p>
      <p className="text-xs text-anibox-text-muted/60">{fileName}</p>

      {/* 播放模式 + 下一话提示 */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-anibox-surface text-anibox-text-muted">
          {playModeLabel}
        </span>
        {onNextEpisode && nextEpisodeTitle && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleGotoNext()
            }}
            className="text-[10px] px-2 py-0.5 rounded-full bg-anibox-accent/10 text-anibox-accent hover:bg-anibox-accent/20 transition-colors"
            title="播放下一话"
          >
            下一话：{nextEpisodeTitle} ›
          </button>
        )}
      </div>

      {/* 字幕轨道选择 */}
      {subtitleTracks.length > 0 && showControls && (
        <div className="mt-4 bg-anibox-surface/90 rounded-lg p-3 min-w-[200px]">
          <p className="text-xs text-anibox-text-muted mb-2">字幕轨道</p>
          <div className="flex flex-col gap-1">
            <button
              className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                subtitleTracks.every((t) => !t.selected)
                  ? 'bg-anibox-accent/20 text-anibox-accent'
                  : 'hover:bg-anibox-accent/10 text-anibox-text'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                handleCommand(['set_property', 'sid', 'no'])
              }}
            >
              关闭字幕
            </button>
            {subtitleTracks.map((t) => (
              <button
                key={t.id}
                className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                  t.selected
                    ? 'bg-anibox-accent/20 text-anibox-accent'
                    : 'hover:bg-anibox-accent/10 text-anibox-text'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCommand(['set_property', 'sid', t.id])
                }}
              >
                {t.title || t.lang || `轨道 ${t.id}`}
                <span className="text-[10px] text-anibox-text-muted/60 ml-1">
                  ({t.codec || t.lang})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 音轨选择 */}
      {audioTracks.length > 1 && showControls && (
        <div className="mt-2 bg-anibox-surface/90 rounded-lg p-3 min-w-[200px]">
          <p className="text-xs text-anibox-text-muted mb-2">音轨</p>
          <div className="flex flex-col gap-1">
            {audioTracks.map((t) => (
              <button
                key={t.id}
                className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                  t.selected
                    ? 'bg-anibox-accent/20 text-anibox-accent'
                    : 'hover:bg-anibox-accent/10 text-anibox-text'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleCommand(['set_property', 'aid', t.id])
                }}
              >
                {t.title || t.lang || `音轨 ${t.id}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 提示 */}
      {!showControls && (subtitleTracks.length > 0 || audioTracks.length > 1) && (
        <p className="text-[10px] text-anibox-text-muted/40 mt-1">点击画面切换字幕/音轨</p>
      )}
    </div>
  )
}
