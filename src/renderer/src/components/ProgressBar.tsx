import { useRef, useCallback, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const IMG_WIDTH = 160 // 缩略图宽
const IMG_HEIGHT = 90 // 缩略图高
const BORDER = 2 // 外容器 border (1px * 2)
const TEXT_HEIGHT = 28 // 时间文字行高（px-2 py-1 = 8+8+12 ≈ 28）
const POPUP_EST_W = IMG_WIDTH + BORDER // 弹窗估算宽度
const POPUP_EST_H = IMG_HEIGHT + BORDER + TEXT_HEIGHT // 弹窗估算高度
const EDGE_PAD = 8 // 视口边缘最小间距

/** 稳定取视口宽度 */
function vpW(): number {
  return document.documentElement.clientWidth || window.innerWidth
}

interface ProgressBarProps {
  currentTime: number
  duration: number
  bufferProgress?: number
  loopA?: number | null
  loopB?: number | null
  previewTime?: number | null
  previewImage?: string | null
  onSeek: (time: number) => void
  onPreviewHover?: (time: number | null) => void
}

export default function ProgressBar({
  currentTime,
  duration,
  bufferProgress = 0,
  loopA,
  loopB,
  previewTime,
  previewImage,
  onSeek,
  onPreviewHover,
}: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // 弹窗实测宽高，render 后用 useLayoutEffect 更新 ref，不触发重渲染
  const popupSize = useRef({ w: POPUP_EST_W, h: POPUP_EST_H })

  const [hoverPercent, setHoverPercent] = useState<number | null>(null)
  const [popupLeft, setPopupLeft] = useState(0)
  const [popupTop, setPopupTop] = useState(0)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const aPos = loopA != null && duration > 0 ? (loopA / duration) * 100 : null
  const bPos = loopB != null && duration > 0 ? (loopB / duration) * 100 : null

  const calcSeekTime = useCallback(
    (clientX: number): number => {
      if (!barRef.current || duration <= 0) return 0
      const rect = barRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return ratio * duration
    },
    [duration],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onSeek(calcSeekTime(e.clientX))
    },
    [calcSeekTime, onSeek],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || duration <= 0) return
      const rect = barRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      setHoverPercent(ratio * 100)

      const vw = vpW()
      const pw = popupSize.current.w
      const ph = popupSize.current.h

      // 弹窗左边缘 = 鼠标 X - 半宽（视觉居中于鼠标）
      let left = e.clientX - pw / 2
      // 钳制：左不超视口左边，右不超视口右边
      if (left < EDGE_PAD) left = EDGE_PAD
      if (left + pw > vw - EDGE_PAD) left = vw - pw - EDGE_PAD
      setPopupLeft(left)

      // 弹窗顶边缘 = 进度条上方 8px 再往上弹窗全高
      let top = rect.top - ph - 8
      if (top < EDGE_PAD) top = EDGE_PAD
      setPopupTop(top)

      onPreviewHover?.(ratio * duration)
    },
    [duration, onPreviewHover],
  )

  const handleMouseLeave = useCallback(() => {
    setHoverPercent(null)
    onPreviewHover?.(null)
  }, [onPreviewHover])

  // 弹窗渲染到 DOM 后立即测量真实尺寸，写入 ref 供下一次 mousemove 使用；
  // 同时校验当前帧位置是否因尺寸偏差而越界，越界则修正 popupLeft/popupTop。
  useLayoutEffect(() => {
    const el = popupRef.current
    if (!el || hoverPercent === null) return
    const r = el.getBoundingClientRect()
    const vw = vpW()

    // 更新实测尺寸
    const w = Math.round(r.width)
    const h = Math.round(r.height)
    if (w > 0) popupSize.current.w = w
    if (h > 0) popupSize.current.h = h

    // 修正越界
    let fixed = false
    let newLeft = popupLeft
    let newTop = popupTop
    if (r.right > vw - 1) {
      newLeft = Math.max(EDGE_PAD, vw - w - EDGE_PAD)
      fixed = true
    } else if (r.left < EDGE_PAD) {
      newLeft = EDGE_PAD
      fixed = true
    }
    if (r.top < EDGE_PAD) {
      newTop = EDGE_PAD
      fixed = true
    }
    if (fixed) {
      setPopupLeft(newLeft)
      setPopupTop(newTop)
    }
  }, [hoverPercent, popupLeft, popupTop, previewImage])

  // ---- 弹窗内容 ----
  const popupContent =
    hoverPercent !== null ? (
      <div
        ref={popupRef}
        className="fixed z-[9999] pointer-events-none"
        style={{ left: popupLeft, top: popupTop }}
      >
        <div className="bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl overflow-hidden">
          {/* 缩略图区域——始终占位 160×90，避免图片未加载时高度跳变 */}
          <div style={{ width: IMG_WIDTH, height: IMG_HEIGHT }} className="bg-black relative">
            {previewImage ? (
              <img src={previewImage} alt="" className="w-full h-full object-cover block" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            )}
          </div>
          {/* 时间标签 */}
          <div className="px-2 py-1 text-xs text-neutral-200 tabular-nums text-center">
            {previewTime != null ? formatTime(previewTime) : '--:--'}
          </div>
        </div>
      </div>
    ) : null

  return (
    <div
      ref={barRef}
      className="relative w-full h-5 flex items-center cursor-pointer group"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* 轨道 */}
      <div className="relative w-full h-1 bg-white/20 rounded-full group-hover:h-1.5 transition-all">
        {/* 缓冲进度 */}
        {bufferProgress > 0 && (
          <div
            className="absolute top-0 left-0 h-full bg-white/15 rounded-full"
            style={{ width: `${bufferProgress}%` }}
          />
        )}
        {/* AB 循环区间 */}
        {aPos != null && bPos != null && (
          <div
            className="absolute top-0 h-full bg-yellow-400/30 rounded-full"
            style={{ left: `${aPos}%`, width: `${bPos - aPos}%` }}
          />
        )}
        {/* 播放进度 */}
        <div
          className="absolute top-0 left-0 h-full bg-anibox-accent rounded-full"
          style={{ width: `${progress}%` }}
        />
        {/* 拖拽圆点 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-anibox-accent rounded-full transition-opacity opacity-0 group-hover:opacity-100"
          style={{ left: `${progress}%` }}
        />
      </div>

      {/* 悬浮预览 — Portal 到 body，fixed 定位 */}
      {popupContent && createPortal(popupContent, document.body)}
    </div>
  )
}
