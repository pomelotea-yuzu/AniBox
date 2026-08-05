/**
 * usePlayback — 核心播放状态、视频事件、音轨/字幕轨道检测
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import { formatTimeShort, formatFileSize, formatBitrate } from '../utils/format'
import type { SubtitleTrackInfo } from '../components/VideoDisplay'

interface UsePlaybackOptions {
  filePath: string
  savedPosition: number
  folderPath?: string
  playMode?: string
  nextEpisodeTitle?: string
  onNextEpisode?: () => void
  onFallback?: () => void
  onPositionChange: (position: number) => void
  onDurationChange: (duration: number) => void
  onPlayStateChange: (isPlaying: boolean) => void
  showToast: (msg: string) => void
  subtitleDisplayTracks: SubtitleTrackInfo[]
}

export function usePlayback(opts: UsePlaybackOptions) {
  const {
    filePath,
    savedPosition,
    folderPath,
    playMode,
    nextEpisodeTitle,
    onNextEpisode,
    onFallback,
    onPositionChange,
    onDurationChange,
    onPlayStateChange,
    showToast,
    subtitleDisplayTracks,
  } = opts

  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const hasSeekedRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const errorFallbackTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const playbackRef = useRef({ position: 0, duration: 0, volume: 1, playing: false })

  // —— 播放核心状态 ——
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [bufferProgress, setBufferProgress] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [isPiP, setIsPiP] = useState(false)

  // 视频元信息
  const [videoMeta, setVideoMeta] = useState<{
    fileSize: number
    resolution: string
    codec: string
    fps: number
    bitrate: number
    isExact: boolean
  } | null>(null)

  // 内嵌轨道
  const [embeddedTextTracks, setEmbeddedTextTracks] = useState<
    { label: string; language: string; index: number; codec?: string }[]
  >([])
  const [audioTracks, setAudioTracks] = useState<
    { label: string; language: string; index: number }[]
  >([])
  const [selectedAudioIdx, setSelectedAudioIdx] = useState(0)
  const audioPrefsRef = useRef<{ audioIndex: number; audioDelay: number } | null>(null)

  // —— ref 同步 ——
  useEffect(() => {
    playbackRef.current.position = currentTime
  }, [currentTime])
  useEffect(() => {
    playbackRef.current.duration = duration
  }, [duration])
  useEffect(() => {
    playbackRef.current.volume = volume
  }, [volume])
  useEffect(() => {
    playbackRef.current.playing = isPlaying
  }, [isPlaying])

  // —— 播放控制 ——
  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [])

  const handleSeek = useCallback((time: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(time, v.duration || 0))
  }, [])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setIsMuted(v.muted)
  }, [])

  const handleVolumeChange = useCallback((newVolume: number) => {
    const v = videoRef.current
    if (!v) return
    v.volume = newVolume
    setVolume(newVolume)
    if (newVolume > 0) {
      v.muted = false
      setIsMuted(false)
    }
  }, [])

  const handleSpeedChange = useCallback((speed: number) => {
    const v = videoRef.current
    if (!v) return
    v.playbackRate = speed
    setPlaybackRate(speed)
  }, [])

  const toggleFullscreen = useCallback(() => {
    window.electronAPI.toggleFullscreen()
  }, [])

  // —— 内嵌字幕轨道检测（textTracks + mpv 双重检测） ——
  const detectEmbeddedTracks = useCallback(() => {
    const v = videoRef.current
    console.log('[AniBox] detectEmbeddedTracks called, filePath:', filePath)

    // 方法1: 浏览器 textTracks API（Chromium 支持的格式：SRT/WebVTT 内封）
    const fromTextTracks = (): { label: string; language: string; index: number; codec?: string }[] => {
      if (!v || !v.textTracks) {
        console.log('[AniBox] textTracks: video element or textTracks not available')
        return []
      }
      const tracks = v.textTracks
      if (!tracks || tracks.length === 0) {
        console.log('[AniBox] textTracks: 0 tracks')
        return []
      }
      const embedded: { label: string; language: string; index: number; codec?: string }[] = []
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i]
        console.log(`[AniBox] textTrack[${i}]: kind=${t.kind} label="${t.label}" lang="${t.language}"`)
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          embedded.push({
            label: t.label || `轨道 ${i + 1}`,
            language: t.language || '',
            index: i,
            codec: 'browser',
          })
        }
      }
      return embedded
    }

    // 方法2: mpv JSON IPC 检测（支持 ASS/SSA/PGS 等 Chromium 不暴露的格式）
    const fromMpv = async (): Promise<{ label: string; language: string; index: number; codec?: string }[]> => {
      try {
        console.log('[AniBox] Calling detectEmbeddedSubtitles IPC...')
        const mpvTracks = await window.electronAPI.detectEmbeddedSubtitles(filePath)
        console.log('[AniBox] mpv detection returned', mpvTracks.length, 'tracks:', mpvTracks)
        return mpvTracks
      } catch (e) {
        console.error('[AniBox] mpv detection error:', e)
        return []
      }
    }

    // 合并去重 + 自动回退
    const mergeAndSet = (textTracks: typeof result, mpvTracks: Awaited<ReturnType<typeof fromMpv>>) => {
      const seen = new Set<string>()
      const merged: { label: string; language: string; index: number; codec?: string }[] = []

      // mpv 检测到的优先（覆盖更多格式）
      for (const t of mpvTracks) {
        const key = `${t.language}|${t.label}`
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(t)
        }
      }
      // textTracks 补充（可能检测到 mpv 漏掉的）
      for (const t of textTracks) {
        const key = `${t.language}|${t.label}`
        if (!seen.has(key)) {
          seen.add(key)
          merged.push(t)
        }
      }

      console.log('[AniBox] Merged embedded tracks:', merged.length, merged.map(t => `${t.label}(${t.codec})`))
      if (merged.length > 0) {
        setEmbeddedTextTracks(merged)

        // 自动回退：浏览器不识别的内封字幕（ASS/SSA/PGS 等）→ 直接切 mpv
        const needsMpv = mpvTracks.length > 0 && textTracks.length === 0
        if (needsMpv && onFallback) {
          console.log('[AniBox] Auto mpv fallback: embedded subtitles not supported by browser')
          // 小延迟，等 UI 状态更新
          setTimeout(() => onFallback(), 200)
        }
      }
    }

    // 先同步检测 textTracks
    const textResult = fromTextTracks()
    console.log('[AniBox] textTracks result:', textResult.length, 'tracks')
    // 异步调用 mpv 检测，结果合并
    fromMpv().then((mpvResult) => mergeAndSet(textResult, mpvResult))
    // 延迟再检测一次 textTracks（某些格式加载较慢）
    const timer = setTimeout(() => {
      const lateResult = fromTextTracks()
      if (lateResult.length > 0) {
        setEmbeddedTextTracks((prev) => {
          const seen = new Set(prev.map((t) => `${t.language}|${t.label}`))
          const newTracks = lateResult.filter(
            (t) => !seen.has(`${t.language}|${t.label}`),
          )
          return newTracks.length > 0 ? [...prev, ...newTracks] : prev
        })
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [filePath, onFallback])

  // —— 音轨检测与偏好恢复 ——
  const detectAudioTracks = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.audioTracks) return
    const check = () => {
      const tracks = v.audioTracks
      if (!tracks || tracks.length === 0) return

      const audio: { label: string; language: string; index: number }[] = []
      let anyEnabled = false
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i]
        audio.push({ label: t.label || `音轨 ${i + 1}`, language: t.language || '', index: i })
        if (t.enabled) anyEnabled = true
      }

      if (audio.length > 0) {
        console.log('[AniBox] Audio tracks detected:', audio.length, 'anyEnabled:', anyEnabled)
        setAudioTracks(audio)

        if (audioPrefsRef.current && audioPrefsRef.current.audioIndex < audio.length) {
          // 恢复已保存的音轨偏好
          for (let i = 0; i < tracks.length; i++) {
            tracks[i].enabled = i === audioPrefsRef.current.audioIndex
          }
          setSelectedAudioIdx(audioPrefsRef.current.audioIndex)
          console.log('[AniBox] Restored audio track:', audioPrefsRef.current.audioIndex)
        } else if (!anyEnabled && tracks.length > 0) {
          // 兜底：如果检测到音轨但没有一个启用，强制启用第一条
          tracks[0].enabled = true
          setSelectedAudioIdx(0)
          console.warn('[AniBox] No audio track enabled, forced track 0')
        } else {
          // 重置为 0，防止从多音轨切到单音轨时索引越界
          setSelectedAudioIdx(0)
        }
      }
    }
    check()
    const timer = setTimeout(check, 800)
    return () => clearTimeout(timer)
  }, [])

  // —— 音轨偏好加载 ——
  useEffect(() => {
    if (!folderPath) return
    window.electronAPI
      .audioGetPrefs(folderPath)
      .then((prefs) => {
        if (prefs) {
          audioPrefsRef.current = prefs
        }
      })
      .catch(() => {})
  }, [folderPath])

  // —— 音轨切换 + 保存偏好 ——
  const saveAudioPrefs = useCallback(
    (idx: number, delay: number) => {
      if (!folderPath) return
      const lang = audioTracks?.[idx]?.language || ''
      window.electronAPI
        .audioSetPrefs(folderPath, { audioIndex: idx, audioDelay: delay, language: lang })
        .catch(() => {})
    },
    [folderPath, audioTracks.length],
  )

  const handleAudioChange = useCallback(
    (idx: number) => {
      const v = videoRef.current
      if (!v || !v.audioTracks) return
      for (let i = 0; i < v.audioTracks.length; i++) {
        v.audioTracks[i].enabled = i === idx
      }
      setSelectedAudioIdx(idx)
      saveAudioPrefs(idx, 0 /* delay managed by useAudio hook */)
    },
    [saveAudioPrefs],
  )

  // —— 视频核心事件监听 ——
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    hasSeekedRef.current = false
    setVideoError(null)
    setIsLoading(true)

    const onError = () => {
      console.error('[AniBox] Video Error:', v.error?.code, v.error?.message)
      setIsLoading(false)
      setVideoError('编码不兼容，切换 mpv 播放...')
      errorFallbackTimerRef.current = setTimeout(() => onFallback?.(), 100)
    }

    const onMetaLoaded = () => {
      console.log('[AniBox] loadedmetadata:', v.duration, v.videoWidth, 'x', v.videoHeight)
      setIsLoading(false)
      // 确保音量和静音状态正常（防止浏览器意外静音）
      if (v.muted || v.volume === 0) {
        console.warn('[AniBox] Video muted or zero volume on load, resetting')
        v.muted = false
        v.volume = 1
        setIsMuted(false)
        setVolume(1)
      }
      if (v.videoWidth === 0 && v.videoHeight === 0) {
        console.warn('[AniBox] Zero-dimension, falling back to mpv')
        setVideoError('编码不兼容，切换 mpv 播放...')
        onFallback?.()
        return
      }
      window.electronAPI
        .getVideoInfo(filePath)
        .then((info) => {
          if (!info) return
          const res = `${v.videoWidth}×${v.videoHeight}`
          let codec = '—',
            bitrate: number,
            fps = 0,
            isExact = false
          if (info.videoMeta && info.videoMeta.exactBitrate > 0) {
            codec = info.videoMeta.codec
            bitrate = info.videoMeta.exactBitrate
            fps = info.videoMeta.fps || 0
            isExact = true
          } else {
            bitrate = v.duration > 0 ? Math.round((info.size * 8) / v.duration) : 0
          }
          setVideoMeta({ fileSize: info.size, resolution: res, codec, fps, bitrate, isExact })
        })
        .catch(() => {})
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = undefined
      }
      setDuration(v.duration)
      onDurationChange(v.duration)
      if (savedPosition > 0 && v.duration > 0 && !hasSeekedRef.current) {
        v.currentTime = savedPosition
        hasSeekedRef.current = true
      }
      detectEmbeddedTracks()
      detectAudioTracks()
    }

    const onDuration = () => {
      setDuration(v.duration)
      onDurationChange(v.duration)
    }

    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime)
      onPositionChange(v.currentTime)
    }

    const onPlay = () => {
      setIsPlaying(true)
      onPlayStateChange(true)
    }
    const onPause = () => {
      setIsPlaying(false)
      onPlayStateChange(false)
    }

    const onProgress = () => {
      if (v.buffered.length > 0) {
        const bufferedEnd = v.buffered.end(v.buffered.length - 1)
        if (v.duration > 0) setBufferProgress((bufferedEnd / v.duration) * 100)
      }
    }

    const onEnded = () => {
      setIsPlaying(false)
      onPlayStateChange(false)
      setShowControls(true)
      if (filePath) {
        window.electronAPI.savePosition(filePath, v.duration).catch(() => {})
      }
      if (playMode === 'loop-one') {
        v.currentTime = 0
        v.play().catch(() => {})
        return
      }
      if (onNextEpisode && nextEpisodeTitle) {
        showToast(`下一话: ${nextEpisodeTitle}`)
        setTimeout(() => onNextEpisode(), 400)
      }
    }

    fallbackTimerRef.current = setTimeout(() => {
      if (v.readyState < 1 || (v.videoWidth === 0 && v.videoHeight === 0)) {
        console.warn('[AniBox] Video stuck, falling back to mpv')
        setIsLoading(false)
        onFallback?.()
      }
    }, 3000)

    v.addEventListener('error', onError)
    v.addEventListener('loadedmetadata', onMetaLoaded)
    v.addEventListener('durationchange', onDuration)
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    v.addEventListener('progress', onProgress)

    const onEnterPiP = () => setIsPiP(true)
    const onLeavePiP = () => setIsPiP(false)
    v.addEventListener('enterpictureinpicture', onEnterPiP)
    v.addEventListener('leavepictureinpicture', onLeavePiP)

    if (v.readyState >= 1) {
      console.log('[AniBox] Metadata already loaded on effect start, readyState:', v.readyState)
      onMetaLoaded()
    }

    return () => {
      v.removeEventListener('error', onError)
      v.removeEventListener('loadedmetadata', onMetaLoaded)
      v.removeEventListener('durationchange', onDuration)
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
      v.removeEventListener('progress', onProgress)
      v.removeEventListener('enterpictureinpicture', onEnterPiP)
      v.removeEventListener('leavepictureinpicture', onLeavePiP)
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current)
        fallbackTimerRef.current = undefined
      }
      if (errorFallbackTimerRef.current) {
        clearTimeout(errorFallbackTimerRef.current)
        errorFallbackTimerRef.current = undefined
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, savedPosition])

  // —— 全屏监听 ——
  useEffect(() => {
    return window.electronAPI.onFullscreenChanged((fs: boolean) => setIsFullscreen(fs))
  }, [])

  // —— 控制栏自动隐藏 ——
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [isPlaying])

  useEffect(() => {
    resetHideTimer()
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isPlaying, resetHideTimer])

  // —— 字幕选择应用 ——
  useEffect(() => {
    const v = videoRef.current
    if (!v || !v.textTracks) return
    for (let i = 0; i < v.textTracks.length; i++) {
      v.textTracks[i].mode = 'hidden'
    }
  }, [filePath])

  return {
    videoRef,
    previewVideoRef,
    playbackRef,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isFullscreen,
    showControls,
    bufferProgress,
    isLoading,
    videoError,
    videoMeta,
    isPiP,
    embeddedTextTracks,
    audioTracks,
    selectedAudioIdx,
    togglePlay,
    handleSeek,
    toggleMute,
    handleVolumeChange,
    handleSpeedChange,
    toggleFullscreen,
    resetHideTimer,
    handleAudioChange,
    saveAudioPrefs,
    setSelectedAudioIdx,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setIsFullscreen,
    setShowControls,
    setVolume,
    setPlaybackRate,
    setBufferProgress,
    setIsLoading,
    setIsMuted,
    setIsPiP,
    detectionRefs: { hasSeekedRef, hideTimerRef, fallbackTimerRef, errorFallbackTimerRef },
  }
}
