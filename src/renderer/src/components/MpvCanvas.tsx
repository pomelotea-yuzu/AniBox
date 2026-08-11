import { useCallback, useEffect, useRef, useState } from 'react'

interface MpvTrack {
  id: number
  type: string
  lang: string
  title: string
  codec: string
  selected: boolean
}

interface MpvCanvasProps {
  filePath: string
  onClose: () => void
  /** 播放模式：sequential / loop-one / loop-all / shuffle */
  playMode?: string
  /** 下一话标题（用于连播提示） */
  nextEpisodeTitle?: string
  /** 播放下一集的回调（App 层复用 handleNextEpisode） */
  onNextEpisode?: () => void
  /** 主进程 libmpv 初始化失败时回调（App 层切回旧 mpv.exe 链路） */
  onFallbackToLegacy?: () => void
}

/** libmpv 内嵌播放（方案 A）——主进程软渲染取帧 → IPC → Canvas 显示，单窗口、叠加层可用 */
export default function MpvCanvas({
  filePath,
  onClose,
  playMode,
  nextEpisodeTitle,
  onNextEpisode,
  onFallbackToLegacy,
}: MpvCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const playModeRef = useRef(playMode)
  playModeRef.current = playMode
  const onNextEpisodeRef = useRef(onNextEpisode)
  onNextEpisodeRef.current = onNextEpisode
  const onFallbackToLegacyRef = useRef(onFallbackToLegacy)
  onFallbackToLegacyRef.current = onFallbackToLegacy
  const offMpvEventRef = useRef<(() => void) | null>(null)
  const offMpvFrameRef = useRef<(() => void) | null>(null)
  const pendingFrameRef = useRef(false)

  const [subtitleTracks, setSubtitleTracks] = useState<MpvTrack[]>([])
  const [audioTracks, setAudioTracks] = useState<MpvTrack[]>([])
  const [showControls, setShowControls] = useState(false)
  const [paused, setPaused] = useState(false)
  const [timePos, setTimePos] = useState(0)
  const [duration, setDuration] = useState(0)
  const [frameInfo, setFrameInfo] = useState<{ width: number; height: number } | null>(null)

  const handleCommand = useCallback((cmd: any[]) => {
    window.electronAPI.mpvCommand(cmd).catch(() => {})
  }, [])

  const togglePause = useCallback(() => {
    handleCommand(['cycle', 'pause'])
    setPaused((v) => !v)
  }, [handleCommand])

  // 逐帧绘制（异步 createImageBitmap，丢帧防堆积）
  const drawFrame = useCallback((data: Uint8Array, w: number, h: number) => {
    const canvas = canvasRef.current
    if (!canvas || pendingFrameRef.current) return
    pendingFrameRef.current = true
    createImageBitmap(new Blob([data]))
      .then((bmp) => {
        pendingFrameRef.current = false
        if (!canvasRef.current) {
          bmp.close()
          return
        }
        const ctx = canvasRef.current.getContext('2d')
        if (!ctx) {
          bmp.close()
          return
        }
        // 拉伸到画布实际尺寸（保持比例由 CSS object-fit 不可用，这里按 contain 计算）
        const cw = canvasRef.current.clientWidth
        const ch = canvasRef.current.clientHeight
        const scale = Math.min(cw / w, ch / h)
        const dw = Math.floor(w * scale)
        const dh = Math.floor(h * scale)
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, cw, ch)
        ctx.drawImage(bmp, Math.floor((cw - dw) / 2), Math.floor((ch - dh) / 2), dw, dh)
        bmp.close()
      })
      .catch(() => {
        pendingFrameRef.current = false
      })
  }, [])

  useEffect(() => {
    window.electronAPI.mpvPlay(filePath)

    const offMpvEvent = window.electronAPI.mpvOnEvent((event: any) => {
      if (event.event === 'end-file') {
        // 仅正常播放到末尾（eof）触发连播；stop/error/quit 忽略
        if (event.reason === 'eof') {
          if (playModeRef.current === 'loop-one') {
            window.electronAPI.mpvCommand(['loadfile', filePath, 'replace']).catch(() => {})
          } else if (onNextEpisodeRef.current) {
            offMpvEventRef.current?.()
            onNextEpisodeRef.current()
          } else {
            onCloseRef.current()
          }
        }
      } else if (event.event === 'end') {
        onCloseRef.current()
      } else if (event.event === 'tracks' && Array.isArray(event.data)) {
        const tracks = event.data as MpvTrack[]
        setSubtitleTracks(tracks.filter((t) => t.type === 'sub'))
        setAudioTracks(tracks.filter((t) => t.type === 'audio'))
      } else if (event.event === 'file-loaded') {
        setPaused(false)
        setTimePos(0)
      } else if (event.event === 'libmpv-fallback') {
        // 主进程 libmpv 不可用，切回旧 mpv.exe 链路（渲染旧 MpvOverlay）
        offMpvEventRef.current?.()
        onFallbackToLegacyRef.current?.()
      }
    })
    offMpvEventRef.current = offMpvEvent

    const offMpvFrame = window.electronAPI.mpvOnFrame((frame) => {
      if (!frame || !frame.data) return
      if (frame.width && frame.height) {
        setFrameInfo({ width: frame.width, height: frame.height })
      }
      drawFrame(frame.data, frame.width || 960, frame.height || 540)
    })
    offMpvFrameRef.current = offMpvFrame

    // 点击任意位置显示/隐藏控制
    const onClick = () => setShowControls((v) => !v)
    window.addEventListener('click', onClick)

    // 周期同步播放状态
    const stateTimer = setInterval(() => {
      window.electronAPI
        .mpvGetState()
        .then((s: any) => {
          if (!s) return
          setPaused(!!s.paused)
          if (typeof s.timePos === 'number') setTimePos(s.timePos)
          if (typeof s.duration === 'number') setDuration(s.duration)
        })
        .catch(() => {})
    }, 1000)

    return () => {
      offMpvEventRef.current = null
      offMpvFrameRef.current = null
      window.electronAPI.mpvQuit()
      offMpvEvent()
      offMpvFrame()
      window.removeEventListener('click', onClick)
      clearInterval(stateTimer)
    }
  }, [filePath, drawFrame])

  const fileName = filePath.split(/[/\\]/).pop() || filePath

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

  const fmt = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '00:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="relative w-full h-full bg-black select-none" onContextMenu={(e) => e.preventDefault()}>
      {/* 画面层 */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* 顶部信息 */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/60 to-transparent">
        <span className="text-xs text-neutral-300 truncate max-w-[60%]">{fileName}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-neutral-300">
          libmpv{frameInfo ? ` ${frameInfo.width}×${frameInfo.height}` : ''}
        </span>
      </div>

      {/* 底部控制条 */}
      <div
        className={`absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 进度 */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-neutral-400 tabular-nums">{fmt(timePos)}</span>
          <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-anibox-accent rounded-full"
              style={{ width: `${duration > 0 ? Math.min(100, (timePos / duration) * 100) : 0}%` }}
            />
          </div>
          <span className="text-[10px] text-neutral-400 tabular-nums">{fmt(duration)}</span>
        </div>
        {/* 控制按钮 + 模式 */}
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              togglePause()
            }}
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            title={paused ? '播放' : '暂停'}
          >
            {paused ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="3" width="5" height="18" rx="1" />
                <rect x="14" y="3" width="5" height="18" rx="1" />
              </svg>
            )}
          </button>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-neutral-300">
            {playModeLabel}
          </span>
          {onNextEpisode && nextEpisodeTitle && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleGotoNext()
              }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-anibox-accent/20 text-anibox-accent hover:bg-anibox-accent/30 transition-colors"
              title="播放下一话"
            >
              下一话：{nextEpisodeTitle} ›
            </button>
          )}
          <div className="flex-1" />
          {/* 字幕/音轨快捷切换（点击弹面板） */}
          {(subtitleTracks.length > 0 || audioTracks.length > 1) && (
            <span className="text-[10px] text-neutral-400">点击画面切换字幕/音轨</span>
          )}
        </div>
      </div>

      {/* 字幕轨道选择 */}
      {subtitleTracks.length > 0 && showControls && (
        <div className="absolute bottom-24 left-4 bg-black/80 rounded-lg p-3 min-w-[200px] backdrop-blur">
          <p className="text-xs text-neutral-300 mb-2">字幕轨道</p>
          <div className="flex flex-col gap-1">
            <button
              className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                subtitleTracks.every((t) => !t.selected)
                  ? 'bg-anibox-accent/30 text-anibox-accent'
                  : 'hover:bg-white/10 text-neutral-200'
              }`}
              onClick={() => handleCommand(['set_property', 'sid', 'no'])}
            >
              关闭字幕
            </button>
            {subtitleTracks.map((t) => (
              <button
                key={t.id}
                className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                  t.selected
                    ? 'bg-anibox-accent/30 text-anibox-accent'
                    : 'hover:bg-white/10 text-neutral-200'
                }`}
                onClick={() => handleCommand(['set_property', 'sid', t.id])}
              >
                {t.title || t.lang || `轨道 ${t.id}`}
                <span className="text-[10px] text-neutral-500 ml-1">({t.codec || t.lang})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 音轨选择 */}
      {audioTracks.length > 1 && showControls && (
        <div className="absolute bottom-24 right-4 bg-black/80 rounded-lg p-3 min-w-[200px] backdrop-blur">
          <p className="text-xs text-neutral-300 mb-2">音轨</p>
          <div className="flex flex-col gap-1">
            {audioTracks.map((t) => (
              <button
                key={t.id}
                className={`text-xs px-3 py-1.5 rounded text-left transition-colors ${
                  t.selected
                    ? 'bg-anibox-accent/30 text-anibox-accent'
                    : 'hover:bg-white/10 text-neutral-200'
                }`}
                onClick={() => handleCommand(['set_property', 'aid', t.id])}
              >
                {t.title || t.lang || `音轨 ${t.id}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
