import type { ControlsProps } from './controlsData'

interface OnlineSearchPanelProps {
  results?: ControlsProps['onlineSearchResults']
  isSearching?: boolean
  onSearch?: (query?: string) => void
  onToggle?: () => void
  onDownload?: (result: any) => void
}

/** 在线字幕搜索浮层面板（锚定控制栏右下） */
export default function OnlineSearchPanel({
  results,
  isSearching,
  onSearch,
  onToggle,
  onDownload,
}: OnlineSearchPanelProps) {
  return (
    <div
      className="absolute bottom-16 right-4 w-80 bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl z-50 max-h-72 flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white">在线字幕搜索</span>
          {isSearching && (
            <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <input
            className="w-28 bg-white/5 border border-neutral-600 rounded px-2 py-0.5 text-[11px] text-white placeholder:text-white/30
                    focus:outline-none focus:border-anibox-accent"
            placeholder="搜索关键词..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearch?.((e.target as HTMLInputElement).value)
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => onSearch?.()}
            className="text-[11px] px-2 py-0.5 bg-anibox-accent hover:bg-anibox-accent-hover text-white rounded"
          >
            搜索
          </button>
          <button onClick={() => onToggle?.()} className="text-white/40 hover:text-white ml-1">
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {results && results.length === 0 && !isSearching && (
          <p className="text-xs text-neutral-400 py-4 text-center">未找到字幕，尝试更换关键词</p>
        )}
        {results?.map((r: any, i: number) => (
          <div
            key={r.id || i}
            className="flex items-center justify-between px-3 py-2 hover:bg-white/5 border-b border-neutral-700/50 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white truncate">{r.fileName || r.title}</p>
              <p className="text-[10px] text-neutral-400">
                {r.languageLabel || r.language}
                {r.source ? ` · ${r.source}` : ''}
                {r.downloads ? ` · ↓${r.downloads}` : ''}
              </p>
            </div>
            <button
              onClick={() => {
                onDownload?.(r)
              }}
              className="ml-2 text-[11px] px-2 py-0.5 bg-anibox-accent/80 hover:bg-anibox-accent text-white rounded shrink-0"
            >
              下载
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
