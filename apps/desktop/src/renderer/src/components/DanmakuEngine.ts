/**
 * 弹幕渲染引擎
 * Canvas 2D 实现，支持滚动/顶部/底部三种模式
 */

export interface DanmakuItem {
  text: string
  time: number // 视频时间（秒），弹幕出现时刻
  mode: 'scroll' | 'top' | 'bottom'
  color: string // 十六进制颜色，如 '#FFFFFF'
  fontSize: number // 字体大小，默认 25
  timestamp: number // B站弹幕时间戳（微秒）
}

interface ScrollTrack {
  danmaku: DanmakuItem
  x: number // 当前 x 坐标
  width: number // 弹幕文本宽度
  y: number // 所在轨道 y 坐标
  speed: number // 每秒移动像素
}

interface StaticDanmaku {
  danmaku: DanmakuItem
  opacity: number // 0→1 淡入淡出
  elapsed: number // 已显示秒数
  y: number
}

export interface DanmakuConfig {
  enabled: boolean
  density: number // 0.1-2.0, 轨道密度倍率
  speed: number // 0.5-2.0, 滚动速度倍率
  opacity: number // 0.1-1.0, 全局透明度
  fontScale: number // 0.5-2.0, 字体缩放
  showScroll: boolean // 显示滚动弹幕
  showTop: boolean // 显示顶部弹幕
  showBottom: boolean // 显示底部弹幕
  offsetMs: number // 时间偏移（毫秒），用于微调对齐
}

const DEFAULT_CONFIG: DanmakuConfig = {
  enabled: true,
  density: 0.8,
  speed: 1.0,
  opacity: 0.8,
  fontScale: 1.0,
  showScroll: true,
  showTop: true,
  showBottom: true,
  offsetMs: 0,
}

const ROW_HEIGHT = 36 // 每行弹幕高度
const FONT_FAMILY = 'SimHei, "Microsoft YaHei", sans-serif'
const STATIC_DURATION = 5000 // 顶部/底部弹幕持续显示 ms
const FADE_DURATION = 300 // 淡入淡出 ms
const TRACK_PADDING_RIGHT = 60 // 滚动弹幕右侧边距

export default class DanmakuEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private pool: DanmakuItem[] = []
  private scrollTracks: (ScrollTrack | null)[] = []
  private staticDanmakus: StaticDanmaku[] = []
  private config: DanmakuConfig = { ...DEFAULT_CONFIG }
  private videoTime = 0
  private lastFrameTime = 0
  private animFrameId = 0
  private running = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  /** 设置弹幕池（从B站获取的全部弹幕） */
  setPool(items: DanmakuItem[]): void {
    this.pool = items.sort((a, b) => a.time - b.time)
    this.scrollTracks = []
    this.staticDanmakus = []
  }

  /** 清空弹幕 */
  clear(): void {
    this.pool = []
    this.scrollTracks = []
    this.staticDanmakus = []
  }

  /** 添加单条弹幕 */
  addDanmaku(item: DanmakuItem): void {
    this.pool.push(item)
  }

  /** 更新配置 */
  setConfig(partial: Partial<DanmakuConfig>): void {
    this.config = { ...this.config, ...partial }
    this.recalcTracks()
  }

  getConfig(): DanmakuConfig {
    return { ...this.config }
  }

  /** 开始渲染循环 */
  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrameTime = performance.now()
    this.loop()
  }

  /** 停止渲染循环 */
  stop(): void {
    this.running = false
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = 0
    }
  }

  /** 销毁引擎 */
  destroy(): void {
    this.stop()
    this.clear()
  }

  /** 更新视频时间（外部调用） */
  setVideoTime(time: number): void {
    this.videoTime = time
  }

  // ========== private ==========

  private loop(): void {
    if (!this.running) return
    this.animFrameId = requestAnimationFrame(() => this.loop())

    const now = performance.now()
    const dt = (now - this.lastFrameTime) / 1000
    this.lastFrameTime = now

    this.updateCanvasSize()
    this.emitCurrentDanmaku()
    this.updateScrollTracks(dt)
    this.updateStaticDanmakus(dt)
    this.render()
  }

  private updateCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width > 0 && this.canvas.width !== rect.width * devicePixelRatio) {
      this.canvas.width = rect.width * devicePixelRatio
      this.canvas.height = rect.height * devicePixelRatio
      this.recalcTracks()
    }
  }

  private recalcTracks(): void {
    const h = this.canvas.height / devicePixelRatio
    const rowH = ROW_HEIGHT * this.config.fontScale
    const trackCount = Math.floor(h / rowH)
    this.scrollTracks = new Array(trackCount).fill(null)
  }

  /** 将当前时刻的弹幕推入渲染队列 */
  private emitCurrentDanmaku(): void {
    if (!this.config.enabled) return

    const time = this.videoTime + this.config.offsetMs / 1000
    // 预加载未来 2 秒的弹幕
    const futureTime = time + 2

    for (const item of this.pool) {
      if (item.time > futureTime) break
      if (item.time < time - 0.1) continue

      if (item.mode === 'scroll' && this.config.showScroll) {
        this.emitScrollDanmaku(item)
      } else if (item.mode === 'top' && this.config.showTop) {
        this.emitStaticDanmaku(item, 'top')
      } else if (item.mode === 'bottom' && this.config.showBottom) {
        this.emitStaticDanmaku(item, 'bottom')
      }
    }
  }

  /** 发射一条滚动弹幕 */
  private emitScrollDanmaku(item: DanmakuItem): void {
    // 检查是否已发射（去重）
    for (const t of this.scrollTracks) {
      if (t && t.danmaku === item) return
    }

    const fontSize = (item.fontSize || 25) * this.config.fontScale
    this.ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    const textWidth = this.ctx.measureText(item.text).width
    const canvasWidth = this.canvas.width / devicePixelRatio

    // 基础速度：canvas 宽度在 8 秒内滚完
    const baseSpeed = (canvasWidth + textWidth) / 8
    const speed = baseSpeed * this.config.speed

    // 分配轨道（避开碰撞）
    const rowH = ROW_HEIGHT * this.config.fontScale
    const maxTracks = this.scrollTracks.length
    const densityLimit = Math.max(1, Math.floor(maxTracks * this.config.density))

    // 候选轨道：在密度限制范围内的空闲/即将空闲轨道
    let bestTrack = -1
    for (let i = 0; i < densityLimit; i++) {
      const track = this.scrollTracks[i]
      if (!track || track.x + track.width < canvasWidth - TRACK_PADDING_RIGHT) {
        bestTrack = i
        break
      }
    }

    if (bestTrack < 0) return // 无可用轨道

    this.scrollTracks[bestTrack] = {
      danmaku: item,
      x: canvasWidth,
      width: textWidth,
      y: bestTrack * rowH + rowH * 0.75,
      speed,
    }
  }

  /** 发射一条固定弹幕 */
  private emitStaticDanmaku(item: DanmakuItem, mode: 'top' | 'bottom'): void {
    for (const s of this.staticDanmakus) {
      if (s.danmaku === item) return
    }

    const fontSize = (item.fontSize || 25) * this.config.fontScale
    const rowH = ROW_HEIGHT * this.config.fontScale
    const h = this.canvas.height / devicePixelRatio
    const canvasWidth = this.canvas.width / devicePixelRatio
    this.ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`
    const textWidth = this.ctx.measureText(item.text).width

    // 找一个不重叠的轨道
    let trackIdx = 0
    while (true) {
      const y =
        mode === 'top'
          ? trackIdx * rowH + rowH * 0.7 + 10
          : h - (trackIdx + 1) * rowH + rowH * 0.7 - 10
      // 简单重叠检测
      const overlaps = this.staticDanmakus.some(
        (s) =>
          Math.abs(s.y - y) < rowH * 0.8 &&
          this.ctx.measureText(s.danmaku.text).width + textWidth > canvasWidth * 1.5,
      )
      if (!overlaps || trackIdx > 20) {
        this.staticDanmakus.push({
          danmaku: item,
          opacity: 0,
          elapsed: 0,
          y,
        })
        break
      }
      trackIdx++
      if (y < 0 || y > h) break
    }
  }

  private updateScrollTracks(dt: number): void {
    const canvasWidth = this.canvas.width / devicePixelRatio
    for (let i = 0; i < this.scrollTracks.length; i++) {
      const track = this.scrollTracks[i]
      if (!track) continue
      track.x -= track.speed * dt
      // 完全滚出屏幕左侧
      if (track.x + track.width < -20) {
        this.scrollTracks[i] = null
      }
    }
  }

  private updateStaticDanmakus(dt: number): void {
    for (let i = this.staticDanmakus.length - 1; i >= 0; i--) {
      const s = this.staticDanmakus[i]
      s.elapsed += dt * 1000

      // 淡入
      if (s.elapsed < FADE_DURATION) {
        s.opacity = s.elapsed / FADE_DURATION
      }
      // 淡出
      else if (s.elapsed > STATIC_DURATION - FADE_DURATION) {
        s.opacity = (STATIC_DURATION - s.elapsed) / FADE_DURATION
      }
      // 移除
      if (s.elapsed > STATIC_DURATION) {
        this.staticDanmakus.splice(i, 1)
      }
    }
  }

  private render(): void {
    const ctx = this.ctx
    const canvas = this.canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!this.config.enabled) return

    ctx.save()
    ctx.scale(devicePixelRatio, devicePixelRatio)
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = this.config.opacity

    // 渲染滚动弹幕
    for (const track of this.scrollTracks) {
      if (!track) continue
      const { danmaku, x, y } = track
      const fontSize = (danmaku.fontSize || 25) * this.config.fontScale
      ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`

      // 描边（增强可读性）
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeText(danmaku.text, x, y)

      // 填充
      ctx.fillStyle = danmaku.color || '#FFFFFF'
      ctx.fillText(danmaku.text, x, y)
    }

    // 渲染固定弹幕
    for (const s of this.staticDanmakus) {
      const { danmaku, opacity, y } = s
      if (opacity <= 0) continue

      const fontSize = (danmaku.fontSize || 25) * this.config.fontScale
      const canvasWidth = canvas.width / devicePixelRatio
      ctx.font = `bold ${fontSize}px ${FONT_FAMILY}`

      const alpha = Math.min(opacity, 1)
      const color = danmaku.color || '#FFFFFF'

      // 描边
      ctx.globalAlpha = this.config.opacity * alpha
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      const tw = ctx.measureText(danmaku.text).width
      ctx.strokeText(danmaku.text, (canvasWidth - tw) / 2, y)

      // 填充
      ctx.fillStyle = color
      ctx.fillText(danmaku.text, (canvasWidth - tw) / 2, y)
    }

    ctx.restore()
  }
}
