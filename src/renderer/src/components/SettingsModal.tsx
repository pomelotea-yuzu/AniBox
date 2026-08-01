/**
 * SettingsModal — 全局设置页面
 * 模态浮层：主题 / 字幕默认样式 / 播放偏好 / 快捷键 / 关于
 */
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../context/ThemeContext'
import type { SubtitleStyleConfig } from './SubtitleOverlay'

interface SettingsModalProps {
  visible: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { key: 'Space', desc: '播放 / 暂停' },
  { key: '← →', desc: '快退 / 快进 5 秒' },
  { key: 'Shift + ←→', desc: '逐帧后退 / 前进' },
  { key: '↑ ↓', desc: '音量增减 5%' },
  { key: 'F', desc: '全屏切换' },
  { key: 'M', desc: '静音' },
  { key: '0–9', desc: '跳转到 0%–90%' },
  { key: ', .', desc: '上一帧 / 下一帧' },
  { key: 'Ctrl + , .', desc: '音频延迟 ±50ms' },
  { key: 'V', desc: '字幕开关' },
  { key: 'D', desc: '双语字幕切换' },
  { key: 'A', desc: '音轨切换' },
  { key: 'O', desc: '在线字幕搜索' },
  { key: 'G', desc: '字幕样式设置' },
  { key: 'R', desc: '画面比例循环' },
  { key: 'S', desc: '截图' },
  { key: 'P', desc: '画中画' },
  { key: 'L', desc: '播放模式循环' },
  { key: 'E', desc: '画质增强开关' },
  { key: 'B', desc: 'A/B 增强对比' },
  { key: '[ ]', desc: 'AB 循环起止' },
  { key: 'W', desc: '生词点查' },
  { key: 'Ctrl + W', desc: 'Whisper 语音识别' },
  { key: '?', desc: '快捷键帮助' },
]

type Tab = 'theme' | 'subtitle' | 'playback' | 'shortcuts' | 'about'

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { theme, themeList, setTheme } = useTheme()
  const [tab, setTab] = useState<Tab>('theme')

  // 字幕默认样式
  const [subStyle, setSubStyle] = useState<SubtitleStyleConfig>({
    fontSize: 24, fontFamily: 'sans-serif', textColor: '#FFFFFF',
    strokeColor: '#000000', strokeWidth: 2, bgColor: 'rgba(0,0,0,0.5)',
    position: 'bottom', secondaryFontSize: 20, dualSubtitleGap: 4
  })

  // 播放偏好
  const [defaultVolume, setDefaultVolume] = useState(80)
  const [defaultSpeed, setDefaultSpeed] = useState(1)
  const [autoNextEp, setAutoNextEp] = useState(true)
  const [saveProgressInterval, setSaveProgressInterval] = useState(5)

  // 加载当前设置
  useEffect(() => {
    if (!visible) return
    window.electronAPI.subtitleGetStyle().then(s => {
      if (s) setSubStyle(prev => ({ ...prev, ...s }))
    }).catch(() => {})
  }, [visible])

  // 保存字幕样式
  const saveSubStyle = useCallback((partial: Partial<SubtitleStyleConfig>) => {
    const merged = { ...subStyle, ...partial }
    setSubStyle(merged)
    window.electronAPI.subtitleSetStyle(merged).catch(() => {})
  }, [subStyle])

  // Esc 关闭
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, onClose])

  if (!visible) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'theme', label: '主题' },
    { key: 'subtitle', label: '字幕' },
    { key: 'playback', label: '播放' },
    { key: 'shortcuts', label: '快捷键' },
    { key: 'about', label: '关于' },
  ]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-anibox-surface border border-anibox-border rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col overflow-hidden mx-4 view-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-anibox-border">
          <h2 className="text-base font-semibold text-anibox-text">设置</h2>
          <button onClick={onClose} className="text-anibox-text-muted hover:text-anibox-text transition-colors px-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab 导航 */}
        <div className="flex border-b border-anibox-border/50 px-3">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-xs transition-colors border-b-2 -mb-[1px] ${
                tab === t.key
                  ? 'text-anibox-accent border-anibox-accent'
                  : 'text-anibox-text-muted border-transparent hover:text-anibox-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* === 主题 === */}
          {tab === 'theme' && (
            <div className="space-y-4">
              <p className="text-xs text-anibox-text-muted">选择莫兰迪配色方案，偏好自动保存</p>
              <div className="grid grid-cols-2 gap-2">
                {themeList.map(t => (
                  <button
                    key={t.name}
                    onClick={() => setTheme(t.name)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      theme === t.name
                        ? 'border-anibox-accent bg-anibox-accent/5'
                        : 'border-transparent hover:border-anibox-border hover:bg-anibox-bg/50'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full shrink-0" style={{
                      background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
                      boxShadow: theme === t.name ? `0 0 0 2px ${t.accent}40` : 'none'
                    }} />
                    <div>
                      <p className="text-sm text-anibox-text font-medium">{t.label}</p>
                      <p className="text-[10px] text-anibox-text-muted">{t.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* === 字幕 === */}
          {tab === 'subtitle' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">默认字体大小</label>
                <input
                  type="range" min="14" max="40" value={subStyle.fontSize}
                  onChange={e => saveSubStyle({ fontSize: Number(e.target.value) })}
                  className="w-full accent-anibox-accent"
                />
                <span className="text-xs text-anibox-text">{subStyle.fontSize}px</span>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">描边宽度</label>
                <input
                  type="range" min="0" max="6" step="0.5" value={subStyle.strokeWidth}
                  onChange={e => saveSubStyle({ strokeWidth: Number(e.target.value) })}
                  className="w-full accent-anibox-accent"
                />
                <span className="text-xs text-anibox-text">{subStyle.strokeWidth}px</span>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">主文字颜色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color" value={subStyle.textColor}
                    onChange={e => saveSubStyle({ textColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs text-anibox-text">{subStyle.textColor}</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">描边颜色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color" value={subStyle.strokeColor}
                    onChange={e => saveSubStyle({ strokeColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs text-anibox-text">{subStyle.strokeColor}</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">字幕位置</label>
                <div className="flex gap-2">
                  {(['bottom', 'top'] as const).map(pos => (
                    <button
                      key={pos}
                      onClick={() => saveSubStyle({ position: pos })}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${
                        subStyle.position === pos
                          ? 'border-anibox-accent text-anibox-accent bg-anibox-accent/5'
                          : 'border-anibox-border text-anibox-text-muted hover:text-anibox-text'
                      }`}
                    >
                      {pos === 'bottom' ? '底部' : '顶部'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">双语副字幕大小</label>
                <input
                  type="range" min="12" max="36" value={subStyle.secondaryFontSize}
                  onChange={e => saveSubStyle({ secondaryFontSize: Number(e.target.value) })}
                  className="w-full accent-anibox-accent"
                />
                <span className="text-xs text-anibox-text">{subStyle.secondaryFontSize}px</span>
              </div>
            </div>
          )}

          {/* === 播放 === */}
          {tab === 'playback' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">默认音量 ({defaultVolume}%)</label>
                <input
                  type="range" min="20" max="100" value={defaultVolume}
                  onChange={e => setDefaultVolume(Number(e.target.value))}
                  className="w-full accent-anibox-accent"
                />
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">默认播放速度</label>
                <div className="flex gap-1.5">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                    <button
                      key={s}
                      onClick={() => setDefaultSpeed(s)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        defaultSpeed === s
                          ? 'border-anibox-accent text-anibox-accent bg-anibox-accent/5'
                          : 'border-anibox-border text-anibox-text-muted hover:text-anibox-text'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={autoNextEp}
                  onChange={e => setAutoNextEp(e.target.checked)}
                  className="accent-anibox-accent w-4 h-4"
                />
                <span className="text-xs text-anibox-text">自动播放下一集</span>
              </label>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">
                  进度保存间隔 ({saveProgressInterval} 秒)
                </label>
                <input
                  type="range" min="1" max="30" value={saveProgressInterval}
                  onChange={e => setSaveProgressInterval(Number(e.target.value))}
                  className="w-full accent-anibox-accent"
                />
              </div>
            </div>
          )}

          {/* === 快捷键 === */}
          {tab === 'shortcuts' && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {SHORTCUTS.map(s => (
                <div key={s.key} className="flex items-center justify-between py-1 border-b border-anibox-border/20">
                  <kbd className="px-1.5 py-0.5 bg-anibox-bg rounded text-[11px] text-anibox-text font-mono">
                    {s.key}
                  </kbd>
                  <span className="text-[11px] text-anibox-text-muted">{s.desc}</span>
                </div>
              ))}
            </div>
          )}

          {/* === 关于 === */}
          {tab === 'about' && (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 rounded-2xl bg-anibox-bg border border-anibox-border mx-auto flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-anibox-accent">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <circle cx="8" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-anibox-text">AniBox</h3>
              <p className="text-xs text-anibox-text-muted">本地番剧库管理 & 播放器</p>
              <p className="text-[11px] text-anibox-text-muted/60">
                Electron 33 · React 19 · Tailwind CSS<br />
                莫兰迪配色 · Anime4K 画质增强<br />
                HTML5 Video + mpv 双引擎
              </p>
              <p className="text-[10px] text-anibox-text-muted/40">v0.1.0 · 2026</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
