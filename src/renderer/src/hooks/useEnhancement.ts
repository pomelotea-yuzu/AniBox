/**
 * useEnhancement — Anime4K 实时超分处理器生命周期管理
 */
import { useRef, useState, useEffect } from 'react'
import { VideoProcessor, type Preset } from '../components/VideoProcessor'

export function useEnhancement(
  filePath: string,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const [enhanceEnabled, setEnhanceEnabled] = useState(false)
  const [enhancePreset, setEnhancePreset] = useState<Preset>('balanced')
  const [abCompare, setAbCompare] = useState(false)
  const enhanceCanvasRef = useRef<HTMLCanvasElement>(null)
  const processorRef = useRef<VideoProcessor | null>(null)

  // ref 版状态，供 filePath effect 换集时读取
  const enhanceEnabledRef = useRef(false)
  const enhancePresetRef = useRef<Preset>('balanced')
  useEffect(() => {
    enhanceEnabledRef.current = enhanceEnabled
  }, [enhanceEnabled])
  useEffect(() => {
    enhancePresetRef.current = enhancePreset
  }, [enhancePreset])

  // 处理器生命周期：创建/销毁
  useEffect(() => {
    if (!enhanceCanvasRef.current) return
    const proc = new VideoProcessor(enhanceCanvasRef.current)
    processorRef.current = proc
    proc.setPreset(enhancePresetRef.current)

    const v = videoRef.current
    if (v) proc.attach(v)

    if (enhanceEnabledRef.current) proc.setEnabled(true)

    return () => {
      proc.setEnabled(false)
      proc.destroy()
      processorRef.current = null
    }
  }, [filePath, videoRef])

  // 增强开关
  useEffect(() => {
    const proc = processorRef.current
    if (!proc) return
    proc.setEnabled(enhanceEnabled)
    if (enhanceEnabled && videoRef.current) proc.attach(videoRef.current)
  }, [enhanceEnabled, videoRef])

  // 预设切换
  useEffect(() => {
    processorRef.current?.setPreset(enhancePreset)
  }, [enhancePreset])

  // A/B 对比
  useEffect(() => {
    const proc = processorRef.current
    if (!proc) return
    if (abCompare) proc.toggleAB()
    else if (proc.abMode) proc.toggleAB()
  }, [abCompare])

  return {
    enhanceEnabled,
    enhancePreset,
    abCompare,
    enhanceCanvasRef,
    processorRef,
    setEnhanceEnabled,
    setEnhancePreset,
    setAbCompare,
    enhanceEnabledRef,
    enhancePresetRef,
  }
}
