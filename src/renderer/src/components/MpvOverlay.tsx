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
}

/** mpv 兜底播放——HTML5 解不了时自动切换，内置字幕/音轨控制 */
export default function MpvOverlay({ filePath, onClose }: MpvOverlayProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [subtitleTracks, setSubtitleTracks] = useState<MpvTrack[]>([])
  const [audioTracks, setAudioTracks] = useState<MpvTrack[]>([])
  const [showControls, setShowControls] = useState(false)

  const handleCommand = useCallback((cmd: any[]) => {
    window.electronAPI.mpvCommand(cmd).catch(() => {})
  }, [])

  useEffect(() => {
    window.electronAPI.mpvPlay(filePath)

    const offMpvEvent = window.electronAPI.mpvOnEvent((event) => {
      if (event.event === 'end-file' || event.event === 'end') {
        onCloseRef.current()
      } else if (event.event === 'tracks' && Array.isArray(event.data)) {
        const tracks = event.data as MpvTrack[]
        setSubtitleTracks(tracks.filter((t) => t.type === 'sub'))
        setAudioTracks(tracks.filter((t) => t.type === 'audio'))
      }
    })

    // 点击任意位置显示/隐藏控制
    const onClick = () => setShowControls((v) => !v)
    window.addEventListener('click', onClick)

    return () => {
      window.electronAPI.mpvQuit()
      offMpvEvent()
      window.removeEventListener('click', onClick)
    }
  }, [filePath, handleCommand])

  const fileName = filePath.split(/[/\\]/).pop() || filePath

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
              onClick={() => handleCommand(['set_property', 'sid', 'no'])}
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
                onClick={() => handleCommand(['set_property', 'sid', t.id])}
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
                onClick={() => handleCommand(['set_property', 'aid', t.id])}
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
