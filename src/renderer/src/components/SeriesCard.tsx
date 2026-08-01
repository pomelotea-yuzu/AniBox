import type { SeriesInfo } from '../../../main/scanner'

interface SeriesCardProps {
  series: SeriesInfo
  selected: boolean
  watched: number
  onClick: () => void
  isFavorited?: boolean
  onToggleFavorite?: () => void
}

// 莫兰迪配色 — 8 组淡色色板
const MORANDI_PALETTE = [
  { bg: '#DCDED6', fg: '#6B6D66' }, // 浅鼠尾草
  { bg: '#D3D8DC', fg: '#63686C' }, // 浅灰蓝
  { bg: '#DED6D6', fg: '#6D6666' }, // 浅玫瑰
  { bg: '#D8DCD2', fg: '#686C64' }, // 浅橄榄
  { bg: '#D8D6DE', fg: '#68666D' }, // 浅薰衣草
  { bg: '#DEDAD4', fg: '#6D6A64' }, // 浅驼色
  { bg: '#D2D8DC', fg: '#62686C' }, // 浅雾蓝
  { bg: '#DED6D8', fg: '#6D6668' }, // 浅灰粉
]

function hashColor(title: string) {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash << 5) - hash + title.charCodeAt(i)
  return MORANDI_PALETTE[Math.abs(hash) % MORANDI_PALETTE.length]
}

export default function SeriesCard({
  series,
  selected,
  watched,
  onClick,
  isFavorited,
  onToggleFavorite,
}: SeriesCardProps) {
  const total = series.episodes.length
  const label = series.season > 1 ? `S${series.season}\u00B7${total}\u8BDD` : `${total}\u8BDD`
  const pct = total > 0 ? (watched / total) * 100 : 0
  const done = watched >= total && total > 0

  const coverUrl = series.coverPath ? window.electronAPI.getCoverUrl(series.coverPath) : null

  const palette = hashColor(series.title)

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-xl overflow-hidden card-hover
        bg-anibox-surface border
        ${selected ? 'border-anibox-accent ring-2 ring-anibox-accent/20' : 'border-anibox-border hover:border-anibox-text-muted'}`}
    >
      <div className="aspect-[2/3] relative overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={series.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center p-3"
            style={{ backgroundColor: palette.bg }}
          >
            <span
              className="font-bold text-center leading-snug select-none"
              style={{ color: palette.fg, fontSize: 'clamp(11px, 1.4vw, 15px)' }}
            >
              {series.title}
            </span>
          </div>
        )}

        {series.season > 1 && (
          <span className="absolute top-2 left-2 bg-black/60 text-white/80 text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
            S{series.season}
          </span>
        )}

        {/* 收藏星标 */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite()
            }}
            className={`absolute top-2 right-2 text-lg transition-colors ${
              isFavorited
                ? 'text-yellow-400 drop-shadow-[0_0_3px_rgba(250,204,21,0.5)]'
                : 'text-white/30 hover:text-yellow-400'
            }`}
            title={isFavorited ? '取消收藏' : '收藏'}
          >
            ★
          </button>
        )}
        {done && (
          <span className="absolute top-2 right-2 bg-green-500/90 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
            已追完
          </span>
        )}
      </div>

      <div className="p-3">
        <h3
          className="text-sm text-anibox-text font-medium truncate leading-tight"
          title={series.title}
        >
          {series.title}
        </h3>
        <p className="text-xs text-anibox-text-muted mt-1">
          {watched > 0 && !done ? `${watched}/` : ''}
          {label}
        </p>
        {pct > 0 && !done && (
          <div className="mt-1.5 h-0.5 bg-anibox-accent/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-anibox-accent rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
