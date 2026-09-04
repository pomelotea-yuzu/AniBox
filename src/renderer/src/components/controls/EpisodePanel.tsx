import type { ControlsProps } from './controlsData'

type Episode = NonNullable<ControlsProps['episodes']>[number]

interface EpisodePanelProps {
  episodes: Episode[]
  currentEpIndex: number
  onSelect: (index: number) => void
  onClose: () => void
}

/** 选集浮层面板（锚定控制栏右下，5 列网格） */
export default function EpisodePanel({
  episodes,
  currentEpIndex,
  onSelect,
  onClose,
}: EpisodePanelProps) {
  return (
    <div
      className="absolute bottom-16 right-4 w-72 max-h-80 bg-anibox-overlay border border-neutral-700 rounded-lg shadow-xl z-50 flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 shrink-0">
        <span className="text-xs font-medium text-white">选集</span>
        <button onClick={onClose} className="text-white/40 hover:text-white">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-5 gap-1.5">
          {episodes.map((ep, i) => {
            const isCurrent = i === currentEpIndex
            return (
              <button
                key={ep.filePath}
                onClick={() => {
                  onSelect(i)
                  onClose()
                }}
                className={`aspect-square rounded text-xs font-medium transition-colors flex items-center justify-center
                  ${
                    isCurrent
                      ? 'bg-anibox-accent text-white'
                      : 'bg-white/5 text-white/70 hover:bg-white/15 hover:text-white'
                  }`}
                title={ep.fileName}
              >
                {ep.epNumber ?? i + 1}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
