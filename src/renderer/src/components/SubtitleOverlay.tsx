import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * 字幕样式配置
 */
export interface SubtitleStyleConfig {
  fontSize: number
  fontFamily: string
  textColor: string
  strokeColor: string
  strokeWidth: number
  bgColor: string
  position: 'bottom' | 'top'
  secondaryFontSize: number
  dualSubtitleGap: number
}

interface CueData {
  text: string
  startTime: number
  endTime: number
}

interface SubtitleOverlayProps {
  /** 主视频元素引用（用于读取 currentTime） */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** 主字幕 VTT 内容 */
  primaryVtt?: string
  /** 副字幕 VTT 内容（双语） */
  secondaryVtt?: string
  /** 字幕样式 */
  style: SubtitleStyleConfig
  /** 是否显示 */
  visible: boolean
}

/**
 * 独立字幕叠加层
 * 解析 VTT 并在 canvas 上渲染，支持双字幕同时显示、自定义样式
 */
export default function SubtitleOverlay({
  videoRef,
  primaryVtt,
  secondaryVtt,
  style,
  visible,
}: SubtitleOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const primaryCuesRef = useRef<CueData[]>([])
  const secondaryCuesRef = useRef<CueData[]>([])
  const rafRef = useRef<number>(0)

  // 解析 VTT 为 CueData 数组
  const parseVtt = useCallback((vtt: string): CueData[] => {
    const cues: CueData[] = []
    if (!vtt || !vtt.trim()) return cues

    const blocks = vtt.replace(/^WEBVTT\s*\n*/i, '').split(/\n\n+/)
    for (const block of blocks) {
      const lines = block.trim().split('\n')
      if (lines.length < 2) continue

      const tsLine = lines[0]
      const timeMatch = tsLine.match(
        /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/,
      )
      if (!timeMatch) continue

      const text = lines.slice(1).join('\n').trim()
      if (!text) continue

      cues.push({
        text,
        startTime: parseTimestamp(timeMatch[1]),
        endTime: parseTimestamp(timeMatch[2]),
      })
    }

    return cues
  }, [])

  function parseTimestamp(ts: string): number {
    const parts = ts.split(':')
    const seconds = parts[2].replace(',', '.')
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(seconds)
  }

  // 当 VTT 更新时重新解析
  useEffect(() => {
    primaryCuesRef.current = parseVtt(primaryVtt || '')
  }, [primaryVtt, parseVtt])

  useEffect(() => {
    secondaryCuesRef.current = parseVtt(secondaryVtt || '')
  }, [secondaryVtt, parseVtt])

  // 查找当前时间点的 cue
  function findCuesAtTime(cues: CueData[], time: number): CueData[] {
    return cues.filter((c) => time >= c.startTime && time <= c.endTime)
  }

  // Canvas 渲染循环
  useEffect(() => {
    if (!visible) return // 隐藏时不启动循环

    const canvas = canvasRef.current
    if (!canvas) return

    const render = () => {
      const v = videoRef.current
      const ctx = canvas?.getContext('2d')
      if (!v || !ctx || !canvas) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      // 同步 canvas 尺寸
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 0 && canvas.width !== rect.width * devicePixelRatio) {
        canvas.width = rect.width * devicePixelRatio
        canvas.height = rect.height * devicePixelRatio
      }

      if (canvas.width === 0 || canvas.height === 0) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const time = v.currentTime
      const primaryCues = findCuesAtTime(primaryCuesRef.current, time)
      const secondaryCues = findCuesAtTime(secondaryCuesRef.current, time)

      if (primaryCues.length === 0 && secondaryCues.length === 0) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      const scale = devicePixelRatio
      const cw = canvas.width / scale
      const ch = canvas.height / scale

      ctx.save()
      ctx.scale(scale, scale)

      // 计算字幕位置
      const isTop = style.position === 'top'
      const primaryFontSize = style.fontSize
      const secondaryFontSize = style.secondaryFontSize
      const gap = style.dualSubtitleGap
      const lineHeight = primaryFontSize + (style.strokeWidth || 0) * 2

      let baseY: number
      if (isTop) {
        baseY = 40
      } else {
        // 底部：从下往上计算
        const totalHeight =
          (primaryCues.length > 0 ? primaryFontSize + style.strokeWidth * 2 + 8 : 0) +
          (secondaryCues.length > 0 ? secondaryFontSize + style.strokeWidth * 2 + gap : 0)
        baseY = ch - totalHeight - 40
      }

      // 渲染主字幕
      if (primaryCues.length > 0) {
        const text = primaryCues.map((c) => c.text).join('\n')
        renderText(ctx, text, cw, baseY, primaryFontSize, style, 'primary')
        baseY += lineHeight + gap + 8
      }

      // 渲染副字幕
      if (secondaryCues.length > 0) {
        const text = secondaryCues.map((c) => c.text).join('\n')
        renderText(ctx, text, cw, baseY, secondaryFontSize, style, 'secondary')
      }

      ctx.restore()
      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [visible, style, videoRef])

  function renderText(
    ctx: CanvasRenderingContext2D,
    text: string,
    canvasWidth: number,
    y: number,
    fontSize: number,
    style: SubtitleStyleConfig,
    _type: 'primary' | 'secondary',
  ) {
    const lines = text.split('\n')

    // 字体设置
    ctx.font = `bold ${fontSize}px ${style.fontFamily || 'sans-serif'}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]
      const lineY = y + li * (fontSize + 4)

      // 背景色
      const metrics = ctx.measureText(line)
      const tw = metrics.width
      const padding = 12
      const bgH = fontSize + 6

      ctx.fillStyle = style.bgColor || 'rgba(0,0,0,0.5)'
      ctx.fillRect(canvasWidth / 2 - tw / 2 - padding, lineY - 3, tw + padding * 2, bgH)

      // 描边
      if (style.strokeWidth > 0) {
        ctx.strokeStyle = style.strokeColor || '#000'
        ctx.lineWidth = style.strokeWidth
        ctx.lineJoin = 'round'
        ctx.strokeText(line, canvasWidth / 2, lineY)
      }

      // 填充
      ctx.fillStyle = style.textColor || '#FFF'
      ctx.fillText(line, canvasWidth / 2, lineY)
    }
  }

  // Canvas 渲染字幕时，隐藏原生 track 字幕以避免重叠
  // 这是通过父组件传递的 className 控制的

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-30"
      style={{ display: visible ? 'block' : 'none' }}
    />
  )
}
