import { useState } from 'react'
import type { ControlsProps } from './controlsData'

type DanmakuConfig = NonNullable<ControlsProps['danmakuConfig']>

interface DanmakuSettingsPanelProps {
  config: DanmakuConfig
  onConfigChange: (partial: any) => void
  count?: number
  onClose: () => void
  filterText?: string
  onFilterText?: (text: string) => void
  filterRegex?: string
  onFilterRegex?: (re: string) => void
  onSend?: (text: string, color: string, mode: string) => void
  onExport?: () => void
}

/** 弹幕设置浮层面板（锚定控制栏右下） */
export default function DanmakuSettingsPanel({
  config,
  onConfigChange,
  count,
  onClose,
  filterText,
  onFilterText,
  filterRegex,
  onFilterRegex,
  onSend,
  onExport,
}: DanmakuSettingsPanelProps) {
  // 弹幕输入（受控，避免 getElementById 跨组件取值/多实例 id 冲突）
  const [danmakuText, setDanmakuText] = useState('')
  const [danmakuColor, setDanmakuColor] = useState('#FFFFFF')
  const [danmakuMode, setDanmakuMode] = useState('scroll')

  return (
    <div
      className="absolute bottom-16 right-4 w-72 bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl z-50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
        <span className="text-xs font-medium text-white">弹幕设置 ({count ?? 0}条)</span>
        <button onClick={onClose} className="text-white/40 hover:text-white">
          ✕
        </button>
      </div>
      <div className="px-3 py-2 space-y-2 text-xs max-h-80 overflow-y-auto">
        <label className="flex items-center justify-between">
          <span className="text-neutral-400">启用弹幕</span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onConfigChange({ enabled: e.target.checked })}
            className="accent-anibox-accent"
          />
        </label>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">密度</span>
          <input
            type="range"
            min="0.2"
            max="2"
            step="0.1"
            value={config.density}
            onChange={(e) => onConfigChange({ density: parseFloat(e.target.value) })}
            className="w-24 h-3"
          />
          <span className="text-white w-6 text-right">{config.density}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">速度</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={config.speed}
            onChange={(e) => onConfigChange({ speed: parseFloat(e.target.value) })}
            className="w-24 h-3"
          />
          <span className="text-white w-6 text-right">{config.speed}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">透明度</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={config.opacity}
            onChange={(e) => onConfigChange({ opacity: parseFloat(e.target.value) })}
            className="w-24 h-3"
          />
          <span className="text-white w-6 text-right">{config.opacity}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">字体缩放</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={config.fontScale}
            onChange={(e) => onConfigChange({ fontScale: parseFloat(e.target.value) })}
            className="w-24 h-3"
          />
          <span className="text-white w-6 text-right">{config.fontScale}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-neutral-400">时间偏移(ms)</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onConfigChange({ offsetMs: Math.max(-5000, (config.offsetMs ?? 0) - 200) })}
              className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
            >
              −
            </button>
            <span className="text-white w-10 text-center">{config.offsetMs ?? 0}</span>
            <button
              onClick={() => onConfigChange({ offsetMs: Math.min(5000, (config.offsetMs ?? 0) + 200) })}
              className="w-5 h-5 bg-white/10 hover:bg-white/20 rounded text-white/60 text-xs"
            >
              +
            </button>
          </div>
        </div>
        <div className="border-t border-neutral-700 pt-1.5 flex gap-3">
          <label className="flex items-center gap-1 text-neutral-400">
            <input
              type="checkbox"
              checked={config.showScroll}
              onChange={(e) => onConfigChange({ showScroll: e.target.checked })}
              className="accent-anibox-accent"
            />
            滚动
          </label>
          <label className="flex items-center gap-1 text-neutral-400">
            <input
              type="checkbox"
              checked={config.showTop}
              onChange={(e) => onConfigChange({ showTop: e.target.checked })}
              className="accent-anibox-accent"
            />
            顶部
          </label>
          <label className="flex items-center gap-1 text-neutral-400">
            <input
              type="checkbox"
              checked={config.showBottom}
              onChange={(e) => onConfigChange({ showBottom: e.target.checked })}
              className="accent-anibox-accent"
            />
            底部
          </label>
        </div>
        <div className="border-t border-neutral-700 pt-1.5 space-y-1.5">
          <div className="text-[10px] text-neutral-500 uppercase">屏蔽过滤</div>
          <input
            type="text"
            value={filterText || ''}
            placeholder="屏蔽关键词（用|分隔）"
            onChange={(e) => onFilterText?.(e.target.value)}
            className="w-full bg-white/5 border border-neutral-600 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:border-anibox-accent"
          />
          <input
            type="text"
            value={filterRegex || ''}
            placeholder="正则过滤"
            onChange={(e) => onFilterRegex?.(e.target.value)}
            className="w-full bg-white/5 border border-neutral-600 rounded px-2 py-1 text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:border-anibox-accent"
          />
        </div>
        {onSend && (
          <div className="border-t border-neutral-700 pt-1.5">
            <div className="text-[10px] text-neutral-500 uppercase mb-1">发送弹幕</div>
            <div className="flex gap-1">
              <input
                type="color"
                value={danmakuColor}
                onChange={(e) => setDanmakuColor(e.target.value)}
                className="w-7 h-6 bg-transparent border border-neutral-600 rounded cursor-pointer shrink-0"
              />
              <select
                value={danmakuMode}
                onChange={(e) => setDanmakuMode(e.target.value)}
                className="bg-white/5 border border-neutral-600 rounded px-1 text-[11px] text-white shrink-0"
              >
                <option value="scroll">滚动</option>
                <option value="top">顶部</option>
                <option value="bottom">底部</option>
              </select>
              <input
                type="text"
                placeholder="说点什么..."
                value={danmakuText}
                onChange={(e) => setDanmakuText(e.target.value)}
                className="flex-1 bg-white/5 border border-neutral-600 rounded px-2 py-0.5 text-[11px] text-white placeholder:text-white/30 focus:outline-none focus:border-anibox-accent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && danmakuText.trim()) {
                    onSend(danmakuText.trim(), danmakuColor, danmakuMode)
                    setDanmakuText('')
                  }
                }}
              />
              <button
                onClick={() => {
                  if (danmakuText.trim()) {
                    onSend(danmakuText.trim(), danmakuColor, danmakuMode)
                    setDanmakuText('')
                  }
                }}
                className="text-[11px] px-2 bg-anibox-accent hover:bg-anibox-accent-hover text-white rounded shrink-0"
              >
                发送
              </button>
            </div>
          </div>
        )}
        {onExport && (count ?? 0) > 0 && (
          <button
            onClick={onExport}
            className="w-full text-[11px] py-1 bg-white/5 hover:bg-white/10 border border-neutral-600 rounded text-neutral-300"
          >
            导出弹幕文件 (.xml)
          </button>
        )}
      </div>
    </div>
  )
}
