import { forwardRef, useRef, useImperativeHandle } from 'react'

export interface SubtitleTrackInfo {
  label: string
  language: string
  src: string
  default?: boolean
}

export interface VideoDisplayHandle {
  video: HTMLVideoElement | null
  previewVideo: HTMLVideoElement | null
}

interface VideoDisplayProps {
  src: string
  subtitleTracks?: SubtitleTrackInfo[]
  crossOrigin?: string
  aspectMode?: string
  hideNativeSubtitles?: boolean
}

/**
 * 视频渲染组件 —— 包含主视频 + 用于预览的隐藏视频
 */
const VideoDisplay = forwardRef<VideoDisplayHandle, VideoDisplayProps>(
  ({ src, subtitleTracks, crossOrigin, aspectMode, hideNativeSubtitles }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const previewRef = useRef<HTMLVideoElement>(null)

    useImperativeHandle(ref, () => ({
      get video() {
        return videoRef.current
      },
      get previewVideo() {
        return previewRef.current
      },
    }))

    const objectFit =
      aspectMode === 'stretch'
        ? 'object-fill'
        : aspectMode === 'cover'
          ? 'object-cover'
          : 'object-contain'

    const containerStyle: React.CSSProperties = {}
    if (aspectMode === '4:3') containerStyle.aspectRatio = '4 / 3'
    else if (aspectMode === '16:9') containerStyle.aspectRatio = '16 / 9'

    const mainVideo = (
      <video
        ref={(el) => {
          ;(videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
          if (el)
            console.log(
              '[AniBox] Video element mounted, src:',
              el.src,
              'readyState:',
              el.readyState,
            )
        }}
        src={src}
        className={`w-full h-full ${objectFit}`}
        preload="auto"
        crossOrigin={crossOrigin}
      >
        {!hideNativeSubtitles &&
          subtitleTracks?.map((track, i) => (
            <track
              key={i}
              kind="subtitles"
              label={track.label}
              srcLang={track.language}
              src={track.src}
              default={track.default}
            />
          ))}
      </video>
    )

    // 用于预览的隐藏视频
    // 加 ?preview 参数区分两个 video 元素，避免同源资源共享冲突
    const previewVideo = (
      <video
        ref={previewRef}
        src={src.includes('?') ? src + '&preview' : src + '?preview'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
        preload="auto"
        muted
      />
    )

    if (aspectMode === '4:3' || aspectMode === '16:9') {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <div style={containerStyle} className="max-w-full max-h-full">
            {mainVideo}
          </div>
          {previewVideo}
        </div>
      )
    }

    return (
      <>
        {mainVideo}
        {previewVideo}
      </>
    )
  },
)

VideoDisplay.displayName = 'VideoDisplay'

export default VideoDisplay
