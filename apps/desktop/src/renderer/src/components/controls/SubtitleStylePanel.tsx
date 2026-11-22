import type { ControlsProps } from './controlsData'

type SubtitleStyle = NonNullable<ControlsProps['subtitleStyle']>

interface SubtitleStylePanelProps {
  style: SubtitleStyle
  onChange: (style: any) => void
  onClose: () => void
}

/** 字幕样式浮层面板（锚定控制栏右下） */
export default function SubtitleStylePanel({ style, onChange, onClose }: SubtitleStylePanelProps) {
  return (
    <div
      className="absolute bottom-16 right-4 w-64 bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl z-50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
        <span className="text-xs font-medium text-white">字幕样式</span>
        <button onClick={onClose} className="text-white/40 hover:text-white">
          ✕
        </button>
      </div>
      <div className="px-3 py-2 space-y-2 text-xs">
        {/* 字体大小 */}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">字体大小</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChange({ fontSize: Math.max(14, style.fontSize - 2) })}
              className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
            >
              −
            </button>
            <span className="text-white w-8 text-center">{style.fontSize}</span>
            <button
              onClick={() => onChange({ fontSize: Math.min(48, style.fontSize + 2) })}
              className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
            >
              +
            </button>
          </div>
        </div>
        {/* 副字幕字体大小 */}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">副字幕大小</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChange({ secondaryFontSize: Math.max(12, style.secondaryFontSize - 2) })}
              className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
            >
              −
            </button>
            <span className="text-white w-8 text-center">{style.secondaryFontSize}</span>
            <button
              onClick={() => onChange({ secondaryFontSize: Math.min(40, style.secondaryFontSize + 2) })}
              className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
            >
              +
            </button>
          </div>
        </div>
        {/* 描边粗细 */}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">描边粗细</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChange({ strokeWidth: Math.max(0, style.strokeWidth - 1) })}
              className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
            >
              −
            </button>
            <span className="text-white w-8 text-center">{style.strokeWidth}</span>
            <button
              onClick={() => onChange({ strokeWidth: Math.min(6, style.strokeWidth + 1) })}
              className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
            >
              +
            </button>
          </div>
        </div>
        {/* 位置 */}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">显示位置</span>
          <select
            value={style.position}
            onChange={(e) => onChange({ position: e.target.value as 'top' | 'bottom' })}
            className="bg-white/5 border border-neutral-600 rounded px-1.5 py-0.5 text-white text-xs focus:outline-none"
          >
            <option value="bottom">底部</option>
            <option value="top">顶部</option>
          </select>
        </div>
        {/* 文字颜色 */}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">文字颜色</span>
          <input
            type="color"
            value={style.textColor}
            onChange={(e) => onChange({ textColor: e.target.value })}
            className="w-6 h-5 bg-transparent border border-neutral-600 rounded cursor-pointer"
          />
        </div>
        {/* 背景不透明度 */}
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">背景不透明度</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={(() => {
              try {
                const m = style.bgColor.match(
                  /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/,
                )
                return m ? Math.round(parseFloat(m[1]) * 100) : 50
              } catch {
                return 50
              }
            })()}
            onChange={(e) => {
              const alpha = parseInt(e.target.value) / 100
              onChange({ bgColor: `rgba(0,0,0,${alpha.toFixed(1)})` })
            }}
            className="w-20 h-3"
          />
        </div>
      </div>
    </div>
  )
}
