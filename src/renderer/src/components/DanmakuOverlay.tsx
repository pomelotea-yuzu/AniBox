import { useEffect, useRef } from 'react'
import DanmakuEngine, { type DanmakuItem, type DanmakuConfig } from './DanmakuEngine'

interface DanmakuOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  config: DanmakuConfig
  items: DanmakuItem[]
  onConfigChange?: (partial: Partial<DanmakuConfig>) => void
}

export default function DanmakuOverlay({
  videoRef,
  config,
  items,
  onConfigChange
}: DanmakuOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<DanmakuEngine | null>(null)

  // 初始化引擎
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const engine = new DanmakuEngine(canvas)
    engine.setConfig(config)
    engineRef.current = engine
    engine.start()

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, []) // 只在挂载时创建一次

  // 同步配置
  useEffect(() => {
    engineRef.current?.setConfig(config)
  }, [config])

  // 同步弹幕数据
  useEffect(() => {
    engineRef.current?.setPool(items)
  }, [items])

  // 同步视频时间
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onTimeUpdate = () => {
      engineRef.current?.setVideoTime(v.currentTime)
    }

    v.addEventListener('timeupdate', onTimeUpdate)
    return () => v.removeEventListener('timeupdate', onTimeUpdate)
  }, [videoRef])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      style={{ display: config.enabled ? 'block' : 'none' }}
    />
  )
}
