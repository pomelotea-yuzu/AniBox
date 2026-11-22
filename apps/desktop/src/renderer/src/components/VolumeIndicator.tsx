/**
 * VolumeIndicator — 音量调节反馈：画面正中的圆形百分比指示
 * 上下键调音量时浮现，1 秒后自动淡出；纯展示，不拦截鼠标事件
 */
interface VolumeIndicatorProps {
  /** 音量 0-100 */
  volume: number
  muted: boolean
  visible: boolean
}

export default function VolumeIndicator({ volume, muted, visible }: VolumeIndicatorProps) {
  const pct = muted ? 0 : Math.round(volume)
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center pointer-events-none z-50 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* 尺寸对齐暂停大按钮（w-16），底色更透 */}
      <div className="w-16 h-16 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 flex flex-col items-center justify-center gap-0.5">
        {/* 喇叭图标：静音 / 低音量 / 正常音量三态 */}
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-90"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white" />
          {muted ? (
            <>
              <line x1="22" y1="9" x2="16" y2="15" />
              <line x1="16" y1="9" x2="22" y2="15" />
            </>
          ) : (
            <>
              {pct > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
              {pct > 50 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
            </>
          )}
        </svg>
        <span className="text-white text-[13px] font-medium leading-none tabular-nums">{pct}%</span>
      </div>
    </div>
  )
}
