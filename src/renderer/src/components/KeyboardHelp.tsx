/**
 * KeyboardHelp — 键盘快捷键参考浮层
 * 按 ? 键呼出，显示所有播放器快捷键
 */
import { useState, useCallback, useEffect } from 'react'

const SHORTCUTS = [
  { key: 'Space', desc: '播放 / 暂停' },
  { key: '← / →', desc: '快退 / 快进 5 秒' },
  { key: '→ ×3', desc: '连按 3 次 → 跳过 OP/ED（秒数见设置）' },
  { key: 'Shift + ←/→', desc: '逐帧后退 / 前进' },
  { key: 'Ctrl + ←/→', desc: '快退 / 快进 10 秒' },
  { key: '↑ / ↓', desc: '音量增减 5%' },
  { key: 'F', desc: '全屏切换' },
  { key: 'Esc', desc: '退出全屏 / 关闭面板' },
  { key: 'M', desc: '静音切换' },
  { key: '0–9', desc: '跳转到 0%–90%' },
  { key: ',', desc: '上一帧' },
  { key: '.', desc: '下一帧' },
  { key: 'Ctrl + ,', desc: '音频延迟 -50ms' },
  { key: 'Ctrl + .', desc: '音频延迟 +50ms' },
  { key: 'V', desc: '字幕开关切换' },
  { key: 'D', desc: '双语字幕切换' },
  { key: 'A', desc: '音轨切换' },
  { key: 'O', desc: '在线字幕搜索' },
  { key: 'G', desc: '字幕样式设置' },
  { key: 'R', desc: '画面比例循环' },
  { key: 'S', desc: '截图保存' },
  { key: 'P', desc: '画中画' },
  { key: 'L', desc: '播放模式循环' },
  { key: 'E', desc: 'Anime4K 画质增强' },
  { key: 'B', desc: 'A/B 增强对比' },
  { key: '[', desc: 'AB 循环起点' },
  { key: ']', desc: 'AB 循环终点 / 取消' },
  { key: 'W', desc: '生词点查' },
  { key: 'Ctrl + W', desc: 'Whisper 语音识别' },
  { key: '?', desc: '显示 / 隐藏此帮助' },
]

export default function KeyboardHelp() {
  const [visible, setVisible] = useState(false)

  const toggle = useCallback(() => setVisible((v) => !v), [])
  const hide = useCallback(() => setVisible(false), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        toggle()
      }
      if (e.key === 'Escape' && visible) {
        e.preventDefault()
        hide()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, toggle, hide])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={hide}
    >
      <div
        className="bg-anibox-overlay border border-neutral-600 rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">键盘快捷键</h3>
          <button
            onClick={hide}
            className="text-white/40 hover:text-white transition-colors text-sm px-2"
          >
            ✕ Esc
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between text-xs py-1 border-b border-white/5"
            >
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] text-neutral-200 font-mono">
                {s.key}
              </kbd>
              <span className="text-neutral-400 ml-2 truncate">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
