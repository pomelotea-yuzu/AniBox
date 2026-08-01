/**
 * usePlayerExtras — 截图、画中画、AB循环、预览缩略图、画面比例、生词点查、Whisper
 */
import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { formatTimeShort } from '../utils/format'
import type { SubtitleTrackInfo } from '../components/VideoDisplay'

interface UsePlayerExtrasOptions {
  filePath: string
  videoRef: React.RefObject<HTMLVideoElement | null>
  showToast: (msg: string) => void
  primaryVttContentRef: React.MutableRefObject<string>
}

export function usePlayerExtras(opts: UsePlayerExtrasOptions) {
  const { filePath, videoRef, showToast, primaryVttContentRef } = opts

  // 画面比例
  const aspectModes = ['auto', '4:3', '16:9', 'stretch', 'cover'] as const
  const [aspectModeIdx, setAspectModeIdx] = useState(0)
  const cycleAspectRatio = useCallback(
    () => setAspectModeIdx((prev) => (prev + 1) % aspectModes.length),
    [aspectModes.length],
  )

  // 截图
  const screenshotCanvasRef = useRef<HTMLCanvasElement>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // 画中画
  const [isPiP, setIsPiP] = useState(false)

  // AB 循环
  const [loopA, setLoopA] = useState<number | null>(null)
  const [loopB, setLoopB] = useState<number | null>(null)
  const loopRef = useRef<{ a: number | null; b: number | null }>({ a: null, b: null })
  useEffect(() => {
    loopRef.current = { a: loopA, b: loopB }
  }, [loopA, loopB])

  // 预览缩略图
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const previewCleanupRef = useRef<(() => void) | null>(null)

  // 生词点查
  const [wordLookup, setWordLookup] = useState<{
    word: string
    entries: Array<{
      word: string
      reading: string
      meanings: Array<{ pos: string; gloss: string }>
    }>
  } | null>(null)
  const [showWordLookup, setShowWordLookup] = useState(false)
  const wordLookupPos = useRef({ x: 0, y: 0 })

  // Whisper 状态
  const [whisperAvailable, setWhisperAvailable] = useState(false)
  useEffect(() => {
    window.electronAPI
      .whisperStatus()
      .then((s) => setWhisperAvailable(s.available))
      .catch(() => {})
  }, [])

  // —— 本地 showToast ——
  const localShowToast = useCallback((msg: string, duration = 2500) => {
    setToastMessage(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration)
  }, [])

  // 合并外部 showToast + 本地 toast
  useEffect(() => {
    /* no-op, localShowToast used as supplement */
  }, [localShowToast])

  // —— 截图 ——
  const handleScreenshot = useCallback(() => {
    const v = videoRef.current
    const canvas = screenshotCanvasRef.current
    if (!v || !canvas || v.videoWidth === 0) return
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/png')
    window.electronAPI.saveScreenshot(dataUrl).then((saved) => {
      if (saved) showToast('截图已保存')
    })
  }, [videoRef, showToast])

  // —— 画中画 ——
  const handlePiP = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await v.requestPictureInPicture()
    } catch {
      /* PiP not supported */
    }
  }, [videoRef])

  // —— 预览缩略图 ——
  const handlePreviewHover = useCallback((time: number | null) => {
    setPreviewTime(time)
  }, [])

  // —— 生词点查 ——
  const handleWordLookup = useCallback(async (text: string, e?: React.MouseEvent) => {
    if (!text.trim() || text.length > 20) return
    if (e) wordLookupPos.current = { x: e.clientX, y: e.clientY }
    try {
      const entries = await window.electronAPI.dictLookup(text)
      if (entries.length > 0) {
        setWordLookup({ word: text, entries })
        setShowWordLookup(true)
      }
    } catch {
      /* skip */
    }
  }, [])

  // 解析 VTT 用于查词
  const parseVttForWordLookup = useCallback(
    (vtt: string): Array<{ start: number; end: number; text: string }> => {
      const cues: Array<{ start: number; end: number; text: string }> = []
      const blocks = vtt.replace(/^WEBVTT\s*\n*/i, '').split(/\n\n+/)
      for (const block of blocks) {
        const lines = block.trim().split('\n')
        if (lines.length < 2) continue
        const m = lines[0].match(
          /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/,
        )
        if (!m) continue
        const start =
          parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 1000
        const end =
          parseInt(m[5]) * 3600 + parseInt(m[6]) * 60 + parseInt(m[7]) + parseInt(m[8]) / 1000
        const text = lines.slice(1).join('\n').trim()
        if (text) cues.push({ start, end, text })
      }
      return cues
    },
    [],
  )

  const handleWordLookupFromUI = useCallback(() => {
    const vttContent = primaryVttContentRef.current
    if (!vttContent) {
      showToast('需要先加载字幕')
      return
    }
    const cues = parseVttForWordLookup(vttContent)
    const now = videoRef.current?.currentTime || 0
    const currentCue = cues.find((c) => now >= c.start && now <= c.end)
    if (currentCue) {
      wordLookupPos.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      handleWordLookup(currentCue.text)
    } else {
      showToast('当前无字幕文本')
    }
  }, [showToast, parseVttForWordLookup, handleWordLookup, videoRef, primaryVttContentRef])

  // —— Whisper ——
  const handleWhisperTranscribe = useCallback(
    (onSubtitleRescan?: (tracks: SubtitleTrackInfo[]) => void) => {
      if (!filePath) return
      if (
        !window.confirm(
          '将使用 Whisper 离线识别当前视频语音并生成字幕。\n此过程需要 whisper.cpp 和模型文件，可能耗时较长。\n继续？',
        )
      )
        return
      showToast('正在启动 Whisper 识别...')
      window.electronAPI
        .whisperTranscribe(filePath)
        .then((result) => {
          if (result) {
            showToast(`识别完成！共 ${result.segments.length} 段`)
            onSubtitleRescan?.()
          } else {
            showToast('识别失败，请检查 Whisper 配置')
          }
        })
        .catch((err) => {
          showToast('识别失败: ' + (err.message || '未知错误'))
        })
    },
    [filePath, showToast],
  )

  // 片尾提示
  const nearEnd = useMemo(() => false, []) // 在 Player.tsx 中基于 duration/currentTime 计算

  return {
    aspectModeIdx,
    aspectModes,
    loopA,
    loopB,
    loopRef,
    toastMessage,
    previewTime,
    previewImage,
    setPreviewImage,
    isPiP,
    wordLookup,
    showWordLookup,
    whisperAvailable,
    screenshotCanvasRef,
    toastTimerRef,
    previewCanvasRef,
    previewTimerRef,
    previewCleanupRef,
    wordLookupPos,
    cycleAspectRatio,
    handleScreenshot,
    handlePiP,
    handlePreviewHover,
    handleWordLookup,
    handleWordLookupFromUI,
    handleWhisperTranscribe,
    parseVttForWordLookup,
    setLoopA,
    setLoopB,
    setToastMessage,
    setIsPiP,
    setShowWordLookup,
    localShowToast,
  }
}
