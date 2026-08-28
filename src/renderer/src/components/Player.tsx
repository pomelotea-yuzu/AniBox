/**
 * Player — 视频播放器组件（已重构）
 * 将原有 1900+ 行拆分为 8 个独立 hooks
 */
import { useRef, useCallback, useEffect, useMemo } from 'react'
import VideoDisplay, { type SubtitleTrackInfo, type VideoDisplayHandle } from './VideoDisplay'
import Controls from './Controls'
import SubtitleOverlay, { type SubtitleStyleConfig } from './SubtitleOverlay'
import DanmakuOverlay from './DanmakuOverlay'
import KeyboardHelp from './KeyboardHelp'
import type { SubtitleTrack } from '../../../main/subtitle'
import { formatTimeShort } from '../utils/format'
import { usePlayback } from '../hooks/usePlayback'
import { useSkipTimes } from '../hooks/useSkipTimes'
import { useSubtitles } from '../hooks/useSubtitles'
import { useEnhancement } from '../hooks/useEnhancement'
import { useAudio } from '../hooks/useAudio'
import { useDanmaku } from '../hooks/useDanmaku'
import { usePlayerExtras } from '../hooks/usePlayerExtras'

interface PlayerProps {
  mediaUrl: string
  filePath: string
  folderPath?: string
  savedPosition: number
  subtitleTracks?: SubtitleTrack[]
  playMode?: string
  nextEpisodeTitle?: string
  prevEpisodeTitle?: string
  onNextEpisode?: () => void
  onPrevEpisode?: () => void
  onCyclePlayMode?: () => void
  onFallback?: () => void
  onEpisodeList?: () => void
  /** 播放器内选集面板数据 */
  episodes?: Array<{ fileName: string; filePath: string; epNumber?: number }>
  currentEpIndex?: number
  onSelectEpisode?: (index: number) => void
  onOpenSettings?: () => void
  onPositionChange: (position: number) => void
  onDurationChange: (duration: number) => void
  onPlayStateChange: (isPlaying: boolean) => void
}

export default function Player({
  mediaUrl,
  filePath,
  folderPath,
  savedPosition,
  subtitleTracks,
  playMode,
  nextEpisodeTitle,
  prevEpisodeTitle,
  onNextEpisode,
  onPrevEpisode,
  onCyclePlayMode,
  onFallback,
  onEpisodeList,
  episodes,
  currentEpIndex,
  onSelectEpisode,
  onOpenSettings,
  onPositionChange,
  onDurationChange,
  onPlayStateChange,
}: PlayerProps) {
  // ============ 组合 Hooks ============

  // Toast（最先创建，供其他 hooks 使用）
  const toast = usePlayerExtras({
    filePath,
    videoRef: { current: null } as unknown as React.RefObject<HTMLVideoElement>,
    showToast: () => {},
    primaryVttContentRef: { current: '' },
  })
  const showToast = useCallback((msg: string) => toast.localShowToast(msg), [toast.localShowToast])

  // 全局播放偏好：挂载时异步拉取，供 usePlayback（默认音量/倍速/自动下一集）与
  // OP/ED 默认开关使用；keydown handler 空依赖下经 ref 访问最新值
  const playbackSettingsRef = useRef<any>(null)

  // 核心播放
  const playback = usePlayback({
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
    subtitleDisplayTracks: [], // will be updated later
    settingsRef: playbackSettingsRef,
  })

  // OP/ED 跳过（快捷键模式：连按 3 次 → 跳过 90 秒）
  const skiptimes = useSkipTimes()

  // 全局播放偏好：挂载时异步拉取，供 usePlayback（默认音量/倍速/自动下一集）与
  // OP/ED 默认开关使用；keydown handler 空依赖下经 ref 访问最新值
  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .getPlaybackSettings()
      .then((s) => {
        if (cancelled || !s) return
        playbackSettingsRef.current = s
        // 默认开启 OP/ED 跳过（设置页「播放」tab）
        if (s.skipShortcutDefault) skiptimes.setSkipShortcutEnabled(true)
        // 竞争兜底：若 loadedmetadata 早于设置返回触发（onMetaLoaded 已按 100%/1x 应用），
        // 这里视频已就绪时再补一次默认音量/倍速
        const v = playback.videoRef.current
        if (v && v.readyState >= 1) {
          const vol = typeof s.defaultVolume === 'number' ? s.defaultVolume / 100 : 1
          if (v.muted) v.muted = false
          v.volume = vol
          v.playbackRate = typeof s.defaultSpeed === 'number' ? s.defaultSpeed : 1
          playback.setVolume(vol)
          playback.setPlaybackRate(v.playbackRate)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skiptimes.setSkipShortcutEnabled])

  // keydown handler 空依赖，经 ref 访问最新开关
  const skipShortcutEnabledRef = useRef(skiptimes.skipShortcutEnabled)
  useEffect(() => {
    skipShortcutEnabledRef.current = skiptimes.skipShortcutEnabled
  }, [skiptimes.skipShortcutEnabled])
  // 三连按右键时间戳（600ms 窗口）
  const rightPressesRef = useRef<number[]>([])

  // 字幕
  const subs = useSubtitles({ subtitleTracks, filePath, showToast })

  // 增强
  const enh = useEnhancement(
    filePath,
    playback.videoRef as React.RefObject<HTMLVideoElement | null>,
  )

  // 增强画布 contain 显示：objectFit 对 canvas 无效，手动按容器尺寸等比缩放并居中
  useEffect(() => {
    const canvas = enh.enhanceCanvasRef.current
    if (!canvas) return
    const container = canvas.parentElement as HTMLElement | null
    if (!container) return
    const update = () => {
      if (!canvas.width || !canvas.height) return
      const cw = container.clientWidth
      const ch = container.clientHeight
      if (!cw || !ch) return
      const scale = Math.min(cw / canvas.width, ch / canvas.height)
      canvas.style.width = `${Math.floor(canvas.width * scale)}px`
      canvas.style.height = `${Math.floor(canvas.height * scale)}px`
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    ro.observe(canvas) // canvas.width/height 变化（预设切换）时重算
    return () => ro.disconnect()
  }, [enh.enhanceCanvasRef])

  // 音频管线
  const audio = useAudio(filePath)

  // 弹幕
  const danmaku = useDanmaku({ filePath, folderPath, showToast })

  // 额外功能（截图、PiP、AB循环等）
  const extras = usePlayerExtras({
    filePath,
    videoRef: playback.videoRef as React.RefObject<HTMLVideoElement | null>,
    showToast,
    primaryVttContentRef: subs.subRefs.primaryVttContentRef,
  })

  // ============ AB 循环检查 ============
  useEffect(() => {
    if (extras.loopA === null || extras.loopB === null) return
    if (playback.currentTime >= extras.loopB) {
      const v = playback.videoRef.current
      if (v) v.currentTime = extras.loopA
    }
  }, [playback.currentTime, extras.loopA, extras.loopB])

  // ============ 预览缩略图 ============
  useEffect(() => {
    if (extras.previewTime === null) {
      extras.setPreviewImage?.(null)
      return
    }
    const pv = playback.previewVideoRef.current
    if (!pv) return

    if (extras.previewTimerRef.current) clearTimeout(extras.previewTimerRef.current)
    if (extras.previewCleanupRef.current) {
      extras.previewCleanupRef.current()
      extras.previewCleanupRef.current = null
    }

    const capture = () => {
      const canvas = extras.previewCanvasRef.current
      if (!canvas) return
      canvas.width = pv.videoWidth || 320
      canvas.height = pv.videoHeight || 180
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      try {
        ctx.drawImage(pv, 0, 0, canvas.width, canvas.height)
        extras.setPreviewImage?.(canvas.toDataURL('image/jpeg', 0.7))
      } catch (e) {
        console.warn('[AniBox] Preview capture failed:', e)
        extras.setPreviewImage?.(null)
      }
    }

    const seekAndCapture = () => {
      let cancelled = false
      const handleSeeked = () => {
        if (cancelled) return
        extras.previewCleanupRef.current = null
        capture()
      }
      pv.addEventListener('seeked', handleSeeked, { once: true })
      extras.previewCleanupRef.current = () => {
        cancelled = true
        pv.removeEventListener('seeked', handleSeeked)
      }
      if ('fastSeek' in pv && typeof (pv as any).fastSeek === 'function') {
        ;(pv as any).fastSeek(extras.previewTime)
      } else {
        pv.currentTime = extras.previewTime!
      }
    }

    if (pv.readyState >= 2) {
      extras.previewTimerRef.current = setTimeout(seekAndCapture, 60)
    } else {
      // 等视频就绪后再捕获
      const onReady = () => {
        pv.removeEventListener('loadedmetadata', onReady)
        pv.removeEventListener('canplay', onReady)
        extras.previewTimerRef.current = setTimeout(seekAndCapture, 100)
      }
      pv.addEventListener('loadedmetadata', onReady)
      pv.addEventListener('canplay', onReady)
      extras.previewCleanupRef.current = () => {
        pv.removeEventListener('loadedmetadata', onReady)
        pv.removeEventListener('canplay', onReady)
      }
    }
  }, [extras.previewTime])

  // ============ 字幕 + 内嵌轨道合并 ============
  // subs needs embeddedTextTracks from playback
  useEffect(() => {
    subs.setEmbeddedTextTracksFromSubtitle(playback.embeddedTextTracks)
  }, [playback.embeddedTextTracks, subs])

  const allSubtitleTracksForControls = useMemo(
    () => [
      ...subs.subtitleDisplayTracks.map((t) => ({
        label: t.label,
        language: t.language,
        type: 'external' as const,
      })),
      ...playback.embeddedTextTracks.map((t) => ({
        label: t.label,
        language: t.language,
        type: 'embedded' as const,
        codec: (t as any).codec as string | undefined,
      })),
    ],
    [subs.subtitleDisplayTracks, playback.embeddedTextTracks],
  )

  // —— 字幕切换包装：mpv 检测到的内封字幕（ASS/PGS 等）需要切到 mpv 播放 ——
  const handleSubtitleChangeWrapped = useCallback(
    (idx: number) => {
      // 检查选中的字幕是否需要 mpv
      if (idx >= 0 && idx < allSubtitleTracksForControls.length) {
        const track = allSubtitleTracksForControls[idx]
        if (
          track.type === 'embedded' &&
          (track as any).codec &&
          (track as any).codec !== 'browser'
        ) {
          // 浏览器不支持的格式（ASS/SSA/PGS/DVB 等），切到 mpv 回退
          console.log('[AniBox] Embedded subtitle needs mpv, triggering fallback:', track.label)
          onFallback?.()
          return
        }
      }
      subs.handleSubtitleChange(idx)
    },
    [allSubtitleTracksForControls, subs, onFallback],
  )

  // ============ 有副字幕的 ref ============
  const hasSubtitleRef = useRef(false)
  useEffect(() => {
    hasSubtitleRef.current = allSubtitleTracksForControls.length > 0
  }, [allSubtitleTracksForControls.length])

  // ============ 键盘快捷键 ============
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const v = playback.videoRef.current
      if (!v) return

      switch (e.key) {
        case 'Escape':
          // 退出全屏（主进程自带 isFullScreen 检查，非全屏时为 no-op；
          // KeyboardHelp 面板开着时由它优先关闭，此处只处理全屏）
          e.preventDefault()
          window.electronAPI.exitFullscreen()
          break
        case ' ':
          e.preventDefault()
          if (v.paused) {
            v.play().catch(() => {})
          } else {
            v.pause()
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) v.currentTime = Math.max(0, v.currentTime - 0.1)
          else if (e.ctrlKey || e.metaKey) v.currentTime = Math.max(0, v.currentTime - 10)
          else v.currentTime = Math.max(0, v.currentTime - 5)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.repeat) {
            // 长按重复：只做普通快进，不参与三连按判定（否则长按会误触发 OP/ED 跳过、且 seek 被抑制）
            if (e.shiftKey) v.currentTime = Math.min(v.duration || 0, v.currentTime + 0.1)
            else if (e.ctrlKey || e.metaKey)
              v.currentTime = Math.min(v.duration || 0, v.currentTime + 10)
            else v.currentTime = Math.min(v.duration || 0, v.currentTime + 5)
            break
          }
          {
            // 三连按右键（600ms 窗口）= 总共跳过 90 秒（OP/ED 固定时长）。前两次按下已各快进 5 秒，
            // 第三次补 +80，总位移恰为 5+5+80=90 秒；开关关闭时回退普通快进
            const now = Date.now()
            rightPressesRef.current = rightPressesRef.current.filter((t) => now - t < 600)
            rightPressesRef.current.push(now)
            if (rightPressesRef.current.length >= 3) {
              rightPressesRef.current = []
              if (skipShortcutEnabledRef.current) {
                v.currentTime = Math.min(v.duration || 0, v.currentTime + 80)
                showToast('⏭ 已跳过 90 秒')
                break
              }
            }
            if (e.shiftKey) v.currentTime = Math.min(v.duration || 0, v.currentTime + 0.1)
            else if (e.ctrlKey || e.metaKey)
              v.currentTime = Math.min(v.duration || 0, v.currentTime + 10)
            else v.currentTime = Math.min(v.duration || 0, v.currentTime + 5)
          }
          break
        case ',':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const newDelay = Math.max(0, audio.audioDelayRef.current - 50)
            audio.setAudioDelay(newDelay)
            showToast(`音频延迟: ${newDelay}ms`)
          } else {
            e.preventDefault()
            v.pause()
            v.currentTime = Math.max(0, v.currentTime - 0.04)
          }
          break
        case '.':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const newDelay = Math.min(500, audio.audioDelayRef.current + 50)
            audio.setAudioDelay(newDelay)
            showToast(`音频延迟: ${newDelay}ms`)
          } else {
            e.preventDefault()
            v.pause()
            v.currentTime = Math.min(v.duration || 0, v.currentTime + 0.04)
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          v.volume = Math.min(1, Math.round((v.volume + 0.05) * 20) / 20)
          v.muted = false
          playback.setIsMuted(false)
          playback.setVolume(v.volume)
          showToast(`🔊 ${Math.round(v.volume * 100)}%`)
          break
        case 'ArrowDown':
          e.preventDefault()
          v.volume = Math.max(0, Math.round((v.volume - 0.05) * 20) / 20)
          v.muted = false
          playback.setIsMuted(false)
          playback.setVolume(v.volume)
          showToast(`🔉 ${Math.round(v.volume * 100)}%`)
          break
        case 'f':
        case 'F':
          e.preventDefault()
          window.electronAPI.toggleFullscreen()
          break
        case 'm':
        case 'M':
          e.preventDefault()
          v.muted = !v.muted
          playback.setIsMuted(v.muted)
          break
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          if (v.duration > 0) v.currentTime = (parseInt(e.key) / 10) * v.duration
          break
        case 'v':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          if (hasSubtitleRef.current) subs.setSelectedSubtitleIdx((prev) => (prev < 0 ? 0 : -1))
          break
        case 'a':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          if (v.audioTracks && v.audioTracks.length > 1) {
            let curIdx = 0
            for (let i = 0; i < v.audioTracks.length; i++) {
              if (v.audioTracks[i].enabled) {
                curIdx = i
                break
              }
            }
            const nextIdx = (curIdx + 1) % v.audioTracks.length
            for (let i = 0; i < v.audioTracks.length; i++) {
              v.audioTracks[i].enabled = i === nextIdx
            }
            playback.setSelectedAudioIdx(nextIdx)
          }
          break
        case 'r':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          extras.cycleAspectRatio()
          break
        case 's':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          extras.handleScreenshot()
          break
        case 'p':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          extras.handlePiP()
          break
        case 'l':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          onCyclePlayMode?.()
          break
        case '[':
          e.preventDefault()
          {
            const { a, b } = extras.loopRef.current
            if (a !== null && b !== null) {
              extras.setLoopA(null)
              extras.setLoopB(null)
              showToast('AB 循环已取消')
            } else {
              extras.setLoopA(v.currentTime)
              extras.setLoopB(null)
              showToast(`A 点: ${formatTimeShort(v.currentTime)}`)
            }
          }
          break
        case ']':
          e.preventDefault()
          {
            const { a } = extras.loopRef.current
            if (a !== null && a < v.currentTime) {
              extras.setLoopB(v.currentTime)
              showToast(`B 点: ${formatTimeShort(v.currentTime)} — AB 循环中`)
            }
          }
          break
        case 'e':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          enh.setEnhanceEnabled((prev) => !prev)
          showToast(enh.enhanceEnabled ? '画质增强已关闭' : '画质增强已开启')
          break
        case 'b':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          enh.setAbCompare((prev) => !prev)
          showToast(enh.abCompare ? 'A/B 对比已关闭' : 'A/B 对比已开启')
          break
        case 'd':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          {
            const tracks = subs.subRefs.subtitleDisplayTracksRef.current
            const primaryIdx = subs.subRefs.selectedSubtitleIdxRef.current
            if (tracks.length <= 1 || primaryIdx < 0) {
              showToast('需要先开启主字幕')
            } else {
              const secondaryIdx = subs.subRefs.selectedSecondarySubIdxRef.current
              let next = -1
              if (secondaryIdx < 0) {
                next = tracks.findIndex((_: any, i: number) => i !== primaryIdx)
              } else {
                next = secondaryIdx + 1
                while (next < tracks.length && next === secondaryIdx) next++
                if (next >= tracks.length) next = -1
              }
              if (next === primaryIdx) next = -1
              subs.setSelectedSecondarySubIdx(next)
              if (next >= 0) {
                const track = tracks[next] as any
                if (track._vttContent) subs.setSecondaryVttContent(track._vttContent)
                else
                  fetch(track.src)
                    .then((r) => r.text())
                    .then((vtt) => subs.setSecondaryVttContent(vtt))
                    .catch(() => {})
              } else {
                subs.setSecondaryVttContent('')
              }
              showToast(
                next >= 0 ? `双语副字幕: ${tracks[next]?.label || '开启'}` : '双语字幕已关闭',
              )
            }
          }
          break
        case 'o':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          {
            const newState = !subs.subRefs.showOnlineSearchRef.current
            subs.setShowOnlineSearch(newState)
            if (newState) {
              const parts = filePath?.replace(/\\/g, '/').split('/') || []
              const folderName = parts.length > 1 ? parts[parts.length - 2] : ''
              subs.setIsSearchingOnline(true)
              window.electronAPI
                .subtitleSearchOnline({
                  title: folderName,
                  videoPath: filePath,
                  preferredLanguages: ['zh', 'ja'],
                })
                .then((results) => {
                  subs.setOnlineSearchResults(results)
                  subs.setIsSearchingOnline(false)
                })
                .catch(() => subs.setIsSearchingOnline(false))
            }
          }
          break
        case 'g':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          subs.setShowSubtitleSettings((prev) => !prev)
          break
        case 'w':
          if (e.ctrlKey) {
            e.preventDefault()
            extras.handleWhisperTranscribe(async () => {
              if (!filePath) return
              const newTracks = await window.electronAPI.subtitleRescan(filePath)
              const tracks: SubtitleTrackInfo[] = []
              for (const st of newTracks) {
                try {
                  const vttContent = await window.electronAPI.subtitleReadVtt(st.filePath)
                  if (!vttContent.trim()) continue
                  const blob = new Blob([vttContent], { type: 'text/vtt' })
                  const blobUrl = URL.createObjectURL(blob)
                  subs.blobUrlsRef.current.push(blobUrl)
                  tracks.push({
                    label: st.label,
                    language: st.language,
                    src: blobUrl,
                    _vttContent: vttContent,
                  })
                } catch {
                  /* skip */
                }
              }
              subs.setSubtitleDisplayTracks(tracks)
            })
          } else {
            e.preventDefault()
            extras.handleWordLookupFromUI()
          }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 空依赖：通过 ref 访问最新值

  // ============ 计算派生状态 ============

  const nearEnd = useMemo(
    () =>
      playback.duration > 0 &&
      playback.currentTime > 0 &&
      playback.duration - playback.currentTime <= 10 &&
      playback.duration > 120 &&
      !!nextEpisodeTitle &&
      !!onNextEpisode,
    [playback.duration, playback.currentTime, nextEpisodeTitle, onNextEpisode],
  )

  // ============ 渲染 ============

  return (
    <div className="relative w-full h-full bg-black">
      {/* 视频加载指示器 */}
      {playback.isLoading && !playback.videoError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black gap-3">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          <p className="text-sm text-neutral-400">正在加载视频...</p>
        </div>
      )}

      {/* 视频错误提示 */}
      {playback.videoError && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 gap-3">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-1">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-sm text-neutral-200 font-medium">{playback.videoError}</p>
          <p className="text-xs text-neutral-400 max-w-xs text-center">
            此视频的编码格式可能不被当前解码器支持。
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onFallback?.()
            }}
            className="mt-2 px-4 py-1.5 text-sm bg-anibox-accent hover:bg-anibox-accent-hover text-white rounded transition-colors"
          >
            使用 mpv 播放
          </button>
        </div>
      )}
      <div
        className="relative w-full h-full"
        onMouseMove={playback.resetHideTimer}
        onClick={playback.togglePlay}
        onDoubleClick={playback.togglePlay}
      >
        <VideoDisplay
          ref={(handle: VideoDisplayHandle | null) => {
            ;(playback.videoRef as React.MutableRefObject<HTMLVideoElement | null>).current =
              handle?.video ?? null
            playback.previewVideoRef.current = handle?.previewVideo ?? null
          }}
          src={mediaUrl}
          subtitleTracks={subs.subtitleDisplayTracks}
          aspectMode={extras.aspectModes[extras.aspectModeIdx]}
          hideNativeSubtitles={subs.useCustomOverlay}
        />

        {/* 自定义双字幕叠加层 */}
        <SubtitleOverlay
          videoRef={playback.videoRef as React.RefObject<HTMLVideoElement | null>}
          primaryVtt={subs.primaryVttContent}
          secondaryVtt={subs.secondaryVttContent}
          style={subs.subtitleStyle}
          visible={
            subs.selectedSubtitleIdx >= 0 &&
            (subs.primaryVttContent.length > 0 || subs.secondaryVttContent.length > 0)
          }
        />

        {/* 弹幕叠加层 */}
        <DanmakuOverlay
          videoRef={playback.videoRef as React.RefObject<HTMLVideoElement | null>}
          config={danmaku.danmakuConfig}
          items={danmaku.filteredDanmakuItems}
          onConfigChange={danmaku.handleDanmakuConfigChange}
        />

        {/* Anime4K 增强画布（尺寸由 contain 计算 effect 设置，居中显示） */}
        <canvas
          ref={enh.enhanceCanvasRef}
          className="absolute inset-0 m-auto"
          style={{ display: enh.enhanceEnabled ? 'block' : 'none' }}
        />

        {/* 截图用隐藏 canvas */}
        <canvas ref={extras.screenshotCanvasRef} className="hidden" />
        {/* 预览用隐藏 canvas */}
        <canvas ref={extras.previewCanvasRef} className="hidden" />

        {!playback.isPlaying && playback.currentTime > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <polygon points="6,3 20,12 6,21" />
              </svg>
            </div>
          </div>
        )}

        {nearEnd && (
          <div
            className="absolute top-4 right-4 bg-anibox-overlay/95 backdrop-blur border border-anibox-accent/40
            rounded-lg px-3 py-2 text-xs flex items-center gap-2 z-40"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-neutral-400">下一话</span>
            <span className="text-neutral-200 font-medium truncate max-w-[200px]">
              {nextEpisodeTitle}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onNextEpisode?.()
              }}
              className="text-anibox-accent hover:text-anibox-accent-hover font-medium ml-1"
            >
              立即
            </button>
          </div>
        )}

        {/* Toast 通知 */}
        {extras.toastMessage && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 bg-anibox-overlay/95 backdrop-blur border border-neutral-700
            rounded-lg px-4 py-2 text-sm text-neutral-200 z-50 animate-pulse"
            onClick={(e) => e.stopPropagation()}
          >
            {extras.toastMessage}
          </div>
        )}

        {/* 生词点查弹窗 */}
        {extras.showWordLookup && extras.wordLookup && (
          <div
            className="absolute bg-anibox-overlay border border-neutral-600 rounded-lg shadow-xl z-50 p-3 max-w-[240px]"
            style={{
              left: Math.min(extras.wordLookupPos.current.x, window.innerWidth - 260),
              top: Math.max(extras.wordLookupPos.current.y - 200, 80),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-white">{extras.wordLookup.word}</span>
              <button
                onClick={() => extras.setShowWordLookup(false)}
                className="text-white/40 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            {extras.wordLookup.entries.map((e, i) => (
              <div key={i} className="mb-1.5 last:mb-0">
                {e.reading && e.reading !== e.word && (
                  <p className="text-[11px] text-anibox-accent">{e.reading}</p>
                )}
                {e.meanings.map((m, j) => (
                  <p key={j} className="text-[11px] text-neutral-300 leading-relaxed">
                    <span className="text-neutral-500 text-[10px]">[{m.pos}]</span> {m.gloss}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 设置入口（左上，hover 展开） */}
        <div
          className={`absolute top-4 left-4 z-40 transition-opacity duration-300 ${
            playback.showControls || !playback.isPlaying
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenSettings?.()
            }}
            className="w-9 h-9 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            title="设置"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        <Controls
          isPlaying={playback.isPlaying}
          currentTime={playback.currentTime}
          duration={playback.duration}
          volume={playback.volume}
          isMuted={playback.isMuted}
          playbackRate={playback.playbackRate}
          isFullscreen={playback.isFullscreen}
          visible={playback.showControls || !playback.isPlaying}
          subtitleTracks={allSubtitleTracksForControls}
          selectedSubtitleIdx={subs.selectedSubtitleIdx}
          selectedSecondarySubIdx={subs.selectedSecondarySubIdx}
          audioTracks={playback.audioTracks}
          selectedAudioIdx={playback.selectedAudioIdx}
          aspectMode={extras.aspectModes[extras.aspectModeIdx]}
          bufferProgress={playback.bufferProgress}
          onTogglePlay={playback.togglePlay}
          onSeek={playback.handleSeek}
          onToggleMute={playback.toggleMute}
          onVolumeChange={playback.handleVolumeChange}
          onSpeedChange={playback.handleSpeedChange}
          onToggleFullscreen={playback.toggleFullscreen}
          onSubtitleChange={handleSubtitleChangeWrapped}
          onSecondarySubtitleChange={subs.handleSecondarySubtitleChange}
          onAudioChange={playback.handleAudioChange}
          onAspectCycle={extras.cycleAspectRatio}
          onScreenshot={extras.handleScreenshot}
          onPiP={extras.handlePiP}
          isPiP={playback.isPiP}
          playMode={playMode}
          onCyclePlayMode={onCyclePlayMode}
          loopA={extras.loopA}
          loopB={extras.loopB}
          previewTime={extras.previewTime}
          previewImage={extras.previewImage}
          onPreviewHover={extras.handlePreviewHover}
          onPrevEpisode={onPrevEpisode}
          onNextEpisode={onNextEpisode}
          hasPrevEpisode={!!onPrevEpisode}
          hasNextEpisode={!!onNextEpisode}
          hasEpisodeList={!!(onEpisodeList || episodes?.length)}
          onEpisodeList={onEpisodeList}
          episodes={episodes}
          currentEpIndex={currentEpIndex}
          onSelectEpisode={onSelectEpisode}
          audioDelay={audio.audioDelay}
          onAudioDelayChange={(ms) => audio.handleAudioDelayChange(ms, playback.videoRef.current)}
          volumeNormalization={audio.volumeNormalization}
          onVolumeNormalizationToggle={() =>
            audio.handleVolumeNormalizationToggle(playback.videoRef.current)
          }
          // OP/ED 跳过（快捷键模式）：合并开关按钮，开启后连按 3 次 → 跳过 90 秒
          skipShortcutEnabled={skiptimes.skipShortcutEnabled}
          onSkipShortcutToggle={skiptimes.toggleSkipShortcut}
          enhanceEnabled={enh.enhanceEnabled}
          enhancePreset={enh.enhancePreset}
          onEnhanceToggle={() => enh.setEnhanceEnabled((prev) => !prev)}
          onEnhancePreset={() =>
            enh.setEnhancePreset((prev) =>
              prev === 'balanced' ? 'quality' : prev === 'quality' ? 'performance' : 'balanced',
            )
          }
          abCompare={enh.abCompare}
          onAbCompare={() => enh.setAbCompare((prev) => !prev)}
          subtitleStyle={subs.subtitleStyle}
          onSubtitleStyleChange={subs.handleSubtitleStyleChange}
          showSubtitleSettings={subs.showSubtitleSettings}
          onToggleSubtitleSettings={() => subs.setShowSubtitleSettings((prev) => !prev)}
          onOnlineSearch={subs.handleOnlineSearch}
          onlineSearchResults={subs.onlineSearchResults}
          isSearchingOnline={subs.isSearchingOnline}
          showOnlineSearch={subs.showOnlineSearch}
          onToggleOnlineSearch={() => subs.setShowOnlineSearch((prev) => !prev)}
          onOnlineSubDownload={subs.handleOnlineSubDownload}
          onWordLookup={extras.handleWordLookupFromUI}
          onWhisperTranscribe={() =>
            extras.handleWhisperTranscribe(async () => {
              if (!filePath) return
              const newTracks = await window.electronAPI.subtitleRescan(filePath)
              const tracks: SubtitleTrackInfo[] = []
              for (const st of newTracks) {
                try {
                  const vttContent = await window.electronAPI.subtitleReadVtt(st.filePath)
                  if (!vttContent.trim()) continue
                  const blob = new Blob([vttContent], { type: 'text/vtt' })
                  const blobUrl = URL.createObjectURL(blob)
                  subs.blobUrlsRef.current.push(blobUrl)
                  tracks.push({
                    label: st.label,
                    language: st.language,
                    src: blobUrl,
                    _vttContent: vttContent,
                  })
                } catch {
                  /* skip */
                }
              }
              subs.setSubtitleDisplayTracks(tracks)
            })
          }
          isWhisperAvailable={extras.whisperAvailable}
          danmakuConfig={danmaku.danmakuConfig}
          onDanmakuConfigChange={danmaku.handleDanmakuConfigChange}
          onDanmakuFetch={danmaku.handleDanmakuFetch}
          isLoadingDanmaku={danmaku.isLoadingDanmaku}
          danmakuCount={danmaku.danmakuItems.length}
          showDanmakuSettings={danmaku.showDanmakuSettings}
          onToggleDanmakuSettings={() => danmaku.setShowDanmakuSettings((prev) => !prev)}
          onSendDanmaku={(text, color, mode) =>
            danmaku.handleSendDanmaku(
              text,
              color,
              mode,
              playback.videoRef.current?.currentTime || 0,
            )
          }
          onDanmakuExport={danmaku.handleDanmakuExport}
          danmakuFilterText={danmaku.danmakuFilterText}
          onDanmakuFilterText={danmaku.setDanmakuFilterText}
          danmakuFilterRegex={danmaku.danmakuFilterRegex}
          onDanmakuFilterRegex={danmaku.setDanmakuFilterRegex}
        />
      </div>

      <KeyboardHelp />
    </div>
  )
}
