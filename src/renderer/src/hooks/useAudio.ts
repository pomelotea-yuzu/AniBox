/**
 * useAudio — 音频管线（延迟、音量均衡）
 */
import { useRef, useState, useCallback, useEffect } from 'react'

export function useAudio(filePath: string) {
  const [audioDelay, setAudioDelay] = useState(0)
  const [volumeNormalization, setVolumeNormalization] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const delayNodeRef = useRef<DelayNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)

  const audioDelayRef = useRef(0)
  useEffect(() => { audioDelayRef.current = audioDelay }, [audioDelay])
  const volumeNormRef = useRef(false)
  useEffect(() => { volumeNormRef.current = volumeNormalization }, [volumeNormalization])

  // —— 创建 AudioContext ——
  const ensureAudioContext = useCallback((video: HTMLVideoElement): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current
    try {
      const ctx = new AudioContext()
      const source = ctx.createMediaElementSource(video)
      audioCtxRef.current = ctx
      audioSourceRef.current = source
      source.connect(ctx.destination)
      return ctx
    } catch (err) {
      console.warn('[AniBox] AudioContext creation failed:', err)
      return null
    }
  }, [])

  // —— 重建音频链路 ——
  const updateAudioChain = useCallback(() => {
    const ctx = audioCtxRef.current
    const source = audioSourceRef.current
    if (!ctx || !source) return

    if (delayNodeRef.current) { try { delayNodeRef.current.disconnect() } catch { /* ok */ } }
    if (compressorRef.current) { try { compressorRef.current.disconnect() } catch { /* ok */ } }
    source.disconnect()

    let lastNode: AudioNode = source

    if (volumeNormalization) {
      if (!compressorRef.current) {
        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -24
        comp.knee.value = 30
        comp.ratio.value = 12
        comp.attack.value = 0.003
        comp.release.value = 0.25
        compressorRef.current = comp
      }
      lastNode.connect(compressorRef.current)
      lastNode = compressorRef.current
    }

    if (audioDelay > 0) {
      if (!delayNodeRef.current) delayNodeRef.current = ctx.createDelay(1.0)
      delayNodeRef.current.delayTime.value = audioDelay / 1000
      lastNode.connect(delayNodeRef.current)
      lastNode = delayNodeRef.current
    }

    lastNode.connect(ctx.destination)
  }, [audioDelay, volumeNormalization])

  // —— audioDelay 变化 ——
  useEffect(() => {
    if (!audioCtxRef.current) return
    if (delayNodeRef.current) {
      delayNodeRef.current.delayTime.value = audioDelay / 1000
    }
    if (audioDelay > 0 && !delayNodeRef.current) updateAudioChain()
    if (audioDelay === 0 && !volumeNormalization && audioCtxRef.current) {
      try {
        if (delayNodeRef.current) delayNodeRef.current.disconnect()
        if (compressorRef.current) compressorRef.current.disconnect()
        audioSourceRef.current?.disconnect()
        audioSourceRef.current?.connect(audioCtxRef.current.destination)
      } catch { /* ok */ }
    }
  }, [audioDelay, volumeNormalization, updateAudioChain])

  // —— volumeNormalization 变化 ——
  useEffect(() => {
    if (!audioCtxRef.current) return
    updateAudioChain()
  }, [volumeNormalization, updateAudioChain])

  // —— 换集/卸载时清理 ——
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try {
          if (delayNodeRef.current) delayNodeRef.current.disconnect()
          if (compressorRef.current) compressorRef.current.disconnect()
          if (audioSourceRef.current) audioSourceRef.current.disconnect()
          audioCtxRef.current.close()
        } catch { /* ok */ }
        audioCtxRef.current = null
        audioSourceRef.current = null
        delayNodeRef.current = null
        compressorRef.current = null
      }
    }
  }, [filePath])

  // —— 外部可调用的延迟修改器 ——
  const handleAudioDelayChange = useCallback((delayMs: number, video: HTMLVideoElement | null) => {
    setAudioDelay(delayMs)
    if (delayMs > 0 || volumeNormalization) {
      if (video) ensureAudioContext(video)
    }
  }, [ensureAudioContext, volumeNormalization])

  const handleVolumeNormalizationToggle = useCallback((video: HTMLVideoElement | null) => {
    setVolumeNormalization(prev => {
      const next = !prev
      if (next && video) ensureAudioContext(video)
      return next
    })
  }, [ensureAudioContext])

  return {
    audioDelay, volumeNormalization, setAudioDelay, setVolumeNormalization,
    audioCtxRef, audioSourceRef, delayNodeRef, compressorRef,
    ensureAudioContext, updateAudioChain, handleAudioDelayChange,
    handleVolumeNormalizationToggle, audioDelayRef, volumeNormRef
  }
}
