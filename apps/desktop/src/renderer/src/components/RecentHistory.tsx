/**
 * RecentHistory — 最近观看历史下拉面板
 * 显示最近播放过的番剧，点击直接跳转续播
 */
import { useState, useEffect, useCallback } from 'react'

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

interface RecentHistoryProps {
  visible: boolean
  onClose: () => void
  onPlay: (folderPath: string, filePath: string, position: number) => void
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMin = Math.floor((now - then) / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function RecentHistory({ visible, onClose, onPlay }: RecentHistoryProps) {
  const [items, setItems] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const recent = await window.electronAPI.getRecentProgress()
      setItems(recent)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (visible) load()
  }, [visible, load])

  if (!visible) return null

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute top-full right-0 z-50 mt-1 w-72 bg-anibox-surface border border-anibox-border
        rounded-lg shadow-xl overflow-hidden animate-dropdown"
      >
        <div className="px-3 py-2 border-b border-anibox-border/50">
          <h4 className="text-xs font-semibold text-anibox-text">最近观看</h4>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-anibox-text-muted text-center py-6">加载中...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-anibox-text-muted text-center py-6">暂无观看记录</p>
          ) : (
            items.map((item) => (
              <button
                key={item.episodeId}
                onClick={() => {
                  onPlay(item.folderPath, item.filePath, item.position)
                  onClose()
                }}
                className="w-full text-left px-3 py-2 hover:bg-anibox-bg/60 transition-colors border-b border-anibox-border/20 last:border-0"
              >
                <p className="text-xs text-anibox-text truncate font-medium">{item.seriesTitle}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-anibox-text-muted">
                    第 {item.epNumber} 话 · {item.fileName}
                  </span>
                  <span className="text-[10px] text-anibox-text-muted ml-2 shrink-0">
                    {relativeTime(item.updatedAt)}
                  </span>
                </div>
                {/* 进度条 */}
                <div className="mt-1 h-0.5 bg-anibox-border/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-anibox-accent/50 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((item.position / (item.position + 300)) * 100))}%`,
                    }}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes dropdown {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-dropdown { animation: dropdown 0.15s ease-out; }
      `}</style>
    </>
  )
}
