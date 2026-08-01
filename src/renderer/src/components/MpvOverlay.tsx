import { useEffect, useRef } from 'react'

interface MpvOverlayProps {
  filePath: string
  onClose: () => void
}

/** mpv 兜底播放——HTML5 解不了时自动切换，AniBox 显示状态可随时返回 */
export default function MpvOverlay({ filePath, onClose }: MpvOverlayProps) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    window.electronAPI.mpvPlay(filePath)

    const offMpvEvent = window.electronAPI.mpvOnEvent((event) => {
      if (event.event === 'end-file' || event.event === 'end') {
        onCloseRef.current()
      }
    })

    return () => {
      window.electronAPI.mpvQuit()
      offMpvEvent()
    }
  }, [filePath])

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-anibox-bg select-none">
      <div className="w-12 h-12 rounded-full bg-anibox-accent/10 flex items-center justify-center animate-pulse">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-anibox-accent"
        >
          <polygon points="5,3 19,12 5,21" />
        </svg>
      </div>
      <p className="text-sm text-anibox-text-muted">mpv 播放中</p>
      <p className="text-xs text-anibox-text-muted/60">{filePath.split(/[/\\]/).pop()}</p>
    </div>
  )
}
