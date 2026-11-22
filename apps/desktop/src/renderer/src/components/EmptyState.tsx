import { useState, useEffect } from 'react'

interface RecentEntry {
  episodeId: string
  filePath: string
  fileName: string
  epNumber: number
  seriesTitle: string
  folderPath: string
  position: number
  updatedAt: string
}

interface EmptyStateProps {
  onOpenFolder: () => void
  onSearchAnime: () => void
  onOpenFile: () => void
  onPlayRecent?: (folderPath: string, filePath: string, position: number) => void
  onOpenSeason?: () => void
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}小时前`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

export default function EmptyState({
  onOpenFolder,
  onSearchAnime,
  onOpenFile,
  onPlayRecent,
  onOpenSeason,
}: EmptyStateProps) {
  const [recentItems, setRecentItems] = useState<RecentEntry[]>([])

  useEffect(() => {
    window.electronAPI
      .getRecentProgress()
      .then((items) => setRecentItems(items.slice(0, 5)))
      .catch(() => {})
  }, [])

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 select-none overflow-y-auto py-8">
      {/* 图标 */}
      <div className="w-24 h-24 rounded-2xl bg-anibox-surface border border-anibox-border flex items-center justify-center mb-2">
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          className="text-anibox-text-muted"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <circle cx="8" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="10.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="13" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </div>

      <h2 className="text-lg text-anibox-text font-medium">欢迎使用 AniBox</h2>
      <p className="text-sm text-anibox-text-muted text-center max-w-xs leading-relaxed">
        选择番剧目录，按文件夹自动归类扫描成海报墙
      </p>

      <div className="flex gap-3 mt-3">
        <button
          onClick={onOpenFolder}
          className="px-5 py-2.5 text-anibox-text-muted hover:text-anibox-accent hover:bg-anibox-border/30 text-sm
            rounded-lg transition-all duration-150 active:scale-95 flex items-center gap-2
            border border-anibox-border hover:border-anibox-accent/40"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          添加目录
        </button>

        <button
          onClick={onSearchAnime}
          className="px-5 py-2.5 text-anibox-text-muted hover:text-anibox-accent hover:bg-anibox-border/30 text-sm
            rounded-lg transition-all duration-150 active:scale-95 flex items-center gap-2
            border border-anibox-border hover:border-anibox-accent/40"
          title="搜索想要的番剧，获取资源并下载"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          搜索番剧
        </button>

        <button
          onClick={onOpenFile}
          className="px-5 py-2.5 text-anibox-text-muted hover:text-anibox-accent hover:bg-anibox-border/30 text-sm
            rounded-lg transition-all duration-150 active:scale-95 flex items-center gap-2
            border border-anibox-border hover:border-anibox-accent/40"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
          打开单个视频
        </button>

        {onOpenSeason && (
          <button
            onClick={onOpenSeason}
            className="px-5 py-2.5 text-anibox-text-muted hover:text-anibox-accent hover:bg-anibox-border/30 text-sm
              rounded-lg transition-all duration-150 active:scale-95 flex items-center gap-2
              border border-anibox-border hover:border-anibox-accent/40"
            title="新番时间表"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="10" y1="14" x2="14" y2="14" /><line x1="12" y1="14" x2="12" y2="18" />
            </svg>
            新番时间表
          </button>
        )}
      </div>

      {/* 最近观看 */}
      {recentItems.length > 0 && onPlayRecent && (
        <div className="mt-6 w-full max-w-sm px-4">
          <h4 className="text-xs font-semibold text-anibox-text-muted mb-2">继续观看</h4>
          <div className="space-y-1">
            {recentItems.map((item) => (
              <button
                key={item.episodeId}
                onClick={() => onPlayRecent(item.folderPath, item.filePath, item.position)}
                className="w-full text-left px-3 py-2 bg-anibox-surface hover:bg-anibox-border/60 border border-anibox-border/50 rounded-lg transition-all duration-150 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-anibox-text truncate font-medium">
                    {item.seriesTitle}
                  </span>
                  <span className="text-[10px] text-anibox-text-muted ml-2 shrink-0">
                    {relativeTime(item.updatedAt)}
                  </span>
                </div>
                <p className="text-[10px] text-anibox-text-muted mt-0.5">第 {item.epNumber} 话</p>
                <div className="mt-1 h-0.5 bg-anibox-border/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-anibox-accent/50 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((item.position / (item.position + 300)) * 100))}%`,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-anibox-text-muted mt-1">
        支持 MP4、MKV、AVI、FLV、MOV、WMV 等 28 种视频格式
      </p>
      <p className="text-[11px] text-anibox-text-muted/60">
        硬解优先 · 倍速原声 · 逐帧步进 · 音量均衡 · 续播记忆
      </p>
    </div>
  )
}
