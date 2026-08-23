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

type Tab = 'theme' | 'subtitle' | 'playback' | 'shortcuts' | 'api' | 'download' | 'stream' | 'about'

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { theme, themeList, setTheme } = useTheme()
  const [tab, setTab] = useState<Tab>('theme')

  // 字幕默认样式
  const [subStyle, setSubStyle] = useState<SubtitleStyleConfig>({
    fontSize: 24,
    fontFamily: 'sans-serif',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    bgColor: 'rgba(0,0,0,0.5)',
    position: 'bottom',
    secondaryFontSize: 20,
    dualSubtitleGap: 4,
  })

  // 播放偏好（持久化到 anibox-store.json playbackSettings）
  const [defaultVolume, setDefaultVolume] = useState(80)
  const [defaultSpeed, setDefaultSpeed] = useState(1)
  const [autoNextEp, setAutoNextEp] = useState(true)
  const [saveProgressInterval, setSaveProgressInterval] = useState(5)
  const [skipShortcutDefault, setSkipShortcutDefault] = useState(false)

  // AI API
  const [apiKey, setApiKey] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)

  // qBittorrent
  const [qbHost, setQbHost] = useState('127.0.0.1')
  const [qbPort, setQbPort] = useState(8080)
  const [qbUser, setQbUser] = useState('admin')
  const [qbPass, setQbPass] = useState('')
  const [qbSavepath, setQbSavepath] = useState('')
  const [qbStatus, setQbStatus] = useState('')
  const [qbSaved, setQbSaved] = useState(false)
  // 应用版本（关于页）
  const [appInfo, setAppInfo] = useState<{ version: string; electron: string } | null>(null)

  // 局域网串流
  const [streamEnabled, setStreamEnabled] = useState(false)
  const [streamPort, setStreamPort] = useState(8321)
  const [streamRequireToken, setStreamRequireToken] = useState(true)
  const [streamToken, setStreamToken] = useState('')
  const [streamState, setStreamState] = useState<{
    running: boolean
    port: number
    urls: string[]
    error?: string
  }>({ running: false, port: 0, urls: [] })
  const [streamSaved, setStreamSaved] = useState(false)
  const [cacheInfo, setCacheInfo] = useState('')
  const [engineInfo, setEngineInfo] = useState<any>(null)

  // 加载当前设置
  useEffect(() => {
    if (!visible) return
    window.electronAPI
      .subtitleGetStyle()
      .then((s) => {
        if (s) setSubStyle((prev) => ({ ...prev, ...s }))
      })
      .catch(() => {})
    window.electronAPI
      .getAIKey()
      .then((k) => { if (k) setApiKey(k) })
      .catch(() => {})
    window.electronAPI
      .qbGetConfig()
      .then((c) => {
        if (c) {
          setQbHost(c.host || '127.0.0.1')
          setQbPort(c.port || 8080)
          setQbUser(c.username || 'admin')
          setQbSavepath(c.savepath || '')
          // getConfig 返回时密码会被打码，保持为空让用户决定是否重填
          setQbPass('')
        }
      })
      .catch(() => {})
    // 播放偏好
    window.electronAPI
      .getPlaybackSettings()
      .then((s) => {
        if (s) {
          setDefaultVolume(s.defaultVolume)
          setDefaultSpeed(s.defaultSpeed)
          setAutoNextEp(s.autoNextEp)
          setSaveProgressInterval(s.saveProgressInterval)
          setSkipShortcutDefault(s.skipShortcutDefault)
        }
      })
      .catch(() => {})
    // 应用版本
    window.electronAPI
      .getAppVersion()
      .then((v) => setAppInfo(v || null))
      .catch(() => {})
    // 局域网串流
    window.electronAPI
      .streamGetSettings()
      .then((s) => {
        if (s) {
          setStreamEnabled(!!s.enabled)
          setStreamPort(s.port || 8321)
          setStreamRequireToken(s.requireToken !== false)
          setStreamToken(s.token || '')
          if (s.state) setStreamState(s.state)
        }
      })
      .catch(() => {})
    window.electronAPI
      .streamEngineInfo()
      .then((e) => setEngineInfo(e))
      .catch(() => {})
    // 下载 ffmpeg 期间轮询进度
    const poll = setInterval(() => {
      window.electronAPI
        .streamEngineInfo()
        .then((e) => setEngineInfo(e))
        .catch(() => {})
    }, 1500)
    return () => clearInterval(poll)
  }, [visible])

  // 保存字幕样式
  const saveSubStyle = useCallback(
    (partial: Partial<SubtitleStyleConfig>) => {
      const merged = { ...subStyle, ...partial }
      setSubStyle(merged)
      window.electronAPI.subtitleSetStyle(merged).catch(() => {})
    },
    [subStyle],
  )

  // 播放偏好：改动即存（store 层 500ms debounce 落盘）
  const savePlayback = useCallback(
    (partial: {
      defaultVolume?: number
      defaultSpeed?: number
      autoNextEp?: boolean
      saveProgressInterval?: number
      skipShortcutDefault?: boolean
    }) => {
      window.electronAPI.setPlaybackSettings(partial).catch(() => {})
    },
    [],
  )

  // 串流设置：改动即存，主进程按需重启服务器并回传最新状态
  const saveStream = useCallback((patch: { enabled?: boolean; port?: number; requireToken?: boolean; token?: string }) => {
    window.electronAPI
      .streamSetSettings(patch)
      .then((r) => {
        if (r?.state) setStreamState(r.state)
      })
      .catch(() => {})
  }, [])

  // Esc 关闭
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, onClose])

  if (!visible) return null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'theme', label: '主题' },
    { key: 'subtitle', label: '字幕' },
    { key: 'playback', label: '播放' },
    { key: 'shortcuts', label: '快捷键' },
    { key: 'api', label: 'API' },
    { key: 'download', label: '下载' },
    { key: 'stream', label: '串流' },
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
          <button
            onClick={onClose}
            className="text-anibox-text-muted hover:text-anibox-text transition-colors px-1"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab 导航 */}
        <div className="flex border-b border-anibox-border/50 px-3">
          {tabs.map((t) => (
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
                {themeList.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setTheme(t.name)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                      theme === t.name
                        ? 'border-anibox-accent bg-anibox-accent/5'
                        : 'border-transparent hover:border-anibox-border hover:bg-anibox-bg/50'
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-full shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
                        boxShadow: theme === t.name ? `0 0 0 2px ${t.accent}40` : 'none',
                      }}
                    />
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
                  type="range"
                  min="14"
                  max="40"
                  value={subStyle.fontSize}
                  onChange={(e) => saveSubStyle({ fontSize: Number(e.target.value) })}
                  className="w-full accent-anibox-accent"
                />
                <span className="text-xs text-anibox-text">{subStyle.fontSize}px</span>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">描边宽度</label>
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="0.5"
                  value={subStyle.strokeWidth}
                  onChange={(e) => saveSubStyle({ strokeWidth: Number(e.target.value) })}
                  className="w-full accent-anibox-accent"
                />
                <span className="text-xs text-anibox-text">{subStyle.strokeWidth}px</span>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">主文字颜色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={subStyle.textColor}
                    onChange={(e) => saveSubStyle({ textColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs text-anibox-text">{subStyle.textColor}</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">描边颜色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={subStyle.strokeColor}
                    onChange={(e) => saveSubStyle({ strokeColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs text-anibox-text">{subStyle.strokeColor}</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">字幕位置</label>
                <div className="flex gap-2">
                  {(['bottom', 'top'] as const).map((pos) => (
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
                  type="range"
                  min="12"
                  max="36"
                  value={subStyle.secondaryFontSize}
                  onChange={(e) => saveSubStyle({ secondaryFontSize: Number(e.target.value) })}
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
                <label className="text-xs text-anibox-text-muted block mb-1">
                  默认音量 ({defaultVolume}%)
                </label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={defaultVolume}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setDefaultVolume(v)
                    savePlayback({ defaultVolume: v })
                  }}
                  className="w-full accent-anibox-accent"
                />
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">默认播放速度</label>
                <div className="flex gap-1.5">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setDefaultSpeed(s)
                        savePlayback({ defaultSpeed: s })
                      }}
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
                  type="checkbox"
                  checked={autoNextEp}
                  onChange={(e) => {
                    setAutoNextEp(e.target.checked)
                    savePlayback({ autoNextEp: e.target.checked })
                  }}
                  className="accent-anibox-accent w-4 h-4"
                />
                <span className="text-xs text-anibox-text">自动播放下一集</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipShortcutDefault}
                  onChange={(e) => {
                    setSkipShortcutDefault(e.target.checked)
                    savePlayback({ skipShortcutDefault: e.target.checked })
                  }}
                  className="accent-anibox-accent w-4 h-4"
                />
                <span className="text-xs text-anibox-text">默认开启 OP/ED 跳过</span>
              </label>
              <p className="text-[10px] text-anibox-text-muted leading-relaxed">
                开启后每次播放默认启用「⏭ 跳过」：播放中连按 3 次
                <kbd className="px-1 py-0.5 bg-anibox-bg rounded text-[10px] font-mono">→</kbd>
                跳过 80 秒（含前两次快进，总效果约 90 秒）。仍可在控制条随时手动开关。
              </p>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">
                  进度保存间隔 ({saveProgressInterval} 秒)
                </label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={saveProgressInterval}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setSaveProgressInterval(v)
                    savePlayback({ saveProgressInterval: v })
                  }}
                  className="w-full accent-anibox-accent"
                />
              </div>
            </div>
          )}

          {/* === 快捷键 === */}
          {tab === 'shortcuts' && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {SHORTCUTS.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between py-1 border-b border-anibox-border/20"
                >
                  <kbd className="px-1.5 py-0.5 bg-anibox-bg rounded text-[11px] text-anibox-text font-mono">
                    {s.key}
                  </kbd>
                  <span className="text-[11px] text-anibox-text-muted">{s.desc}</span>
                </div>
              ))}
            </div>
          )}

          {/* === API === */}
          {tab === 'api' && (
            <div className="space-y-4">
              <p className="text-xs text-anibox-text-muted">
                配置 DeepSeek API Key 后，新番标题和番剧简介将使用 AI 翻译（日→中）。<br />
                Key 仅存储在本地，不会上传。<br />
                <a href="https://platform.deepseek.com/api_keys" target="_blank" className="text-anibox-accent hover:underline">获取 Key →</a>
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setApiKeySaved(false) }}
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  className="flex-1 px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
                />
                <button
                  onClick={async () => {
                    await window.electronAPI.configureAI(apiKey.trim())
                    setApiKeySaved(true)
                    setTimeout(() => setApiKeySaved(false), 2000)
                  }}
                  className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                    apiKeySaved
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-anibox-accent text-white hover:bg-anibox-accent/80'
                  }`}
                >
                  {apiKeySaved ? '✓ 已保存' : '保存'}
                </button>
              </div>
              {apiKey && (
                <p className="text-[10px] text-anibox-text-muted">
                  当前 Key: {apiKey.substring(0, 8)}...{apiKey.substring(apiKey.length - 4)}
                </p>
              )}
            </div>
          )}

          {/* === 下载 (qBittorrent) === */}
          {tab === 'download' && (
            <div className="space-y-4">
              <p className="text-xs text-anibox-text-muted">
                配置 qBittorrent WebUI 后，可在<b className="text-anibox-text">新番时间表 → 获取资源</b>中一键发送磁力下载或添加 RSS 订阅。
                <br />
                需在 qBittorrent 中开启 <b className="text-anibox-accent">工具 → 选项 → Web UI</b>（默认端口 8080，用户名 admin）。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-anibox-text-muted block mb-1">WebUI 地址</label>
                  <input
                    value={qbHost}
                    onChange={(e) => setQbHost(e.target.value)}
                    placeholder="127.0.0.1"
                    className="w-full px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-anibox-text-muted block mb-1">端口</label>
                  <input
                    type="number"
                    value={qbPort}
                    onChange={(e) => setQbPort(Number(e.target.value))}
                    placeholder="8080"
                    className="w-full px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-anibox-text-muted block mb-1">用户名</label>
                  <input
                    value={qbUser}
                    onChange={(e) => setQbUser(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-anibox-text-muted block mb-1">密码</label>
                  <input
                    type="password"
                    value={qbPass}
                    onChange={(e) => setQbPass(e.target.value)}
                    placeholder="留空则保留已保存的密码"
                    className="w-full px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-anibox-text-muted block mb-1">默认保存路径（可选）</label>
                <input
                  value={qbSavepath}
                  onChange={(e) => setQbSavepath(e.target.value)}
                  placeholder="如 D:\Downloads（留空使用 qBittorrent 默认）"
                  className="w-full px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    setQbStatus('测试中…')
                    const cfg = { host: qbHost.trim(), port: qbPort, username: qbUser.trim(), password: qbPass }
                    const r = await window.electronAPI.qbTest(cfg)
                    setQbStatus(r.ok ? `✓ ${r.message}${r.version ? ` (v${r.version})` : ''}` : `✗ ${r.message}`)
                  }}
                  className="px-4 py-2 text-sm rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40 transition-colors"
                >
                  测试连接
                </button>
                <button
                  onClick={async () => {
                    if (!qbHost.trim()) { setQbStatus('✗ 请填写地址'); return }
                    await window.electronAPI.qbSetConfig({
                      host: qbHost.trim(),
                      port: qbPort,
                      username: qbUser.trim(),
                      password: qbPass,
                      savepath: qbSavepath.trim(),
                    })
                    setQbSaved(true)
                    setQbStatus('✓ 配置已保存')
                    setTimeout(() => setQbSaved(false), 2000)
                  }}
                  className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                    qbSaved
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-anibox-accent text-white hover:bg-anibox-accent/80'
                  }`}
                >
                  {qbSaved ? '✓ 已保存' : '保存配置'}
                </button>
              </div>
              {qbStatus && (
                <p className={`text-xs ${qbStatus.startsWith('✓') ? 'text-emerald-500' : 'text-red-400'}`}>{qbStatus}</p>
              )}
              <p className="text-[10px] text-anibox-text-muted/60">
                配置仅存储在本地 (qb-config.json)。RSS 订阅由 AniBox 本地生成（镜像站 feed.xml 不可用），
                <b className="text-anibox-accent">添加订阅后需保持 AniBox 运行</b>；
                自动下载还需在 qBittorrent 中为该订阅设置下载规则。
              </p>
            </div>
          )}

          {/* === 串流（局域网 HTTP） === */}
          {tab === 'stream' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={streamEnabled}
                  onChange={(e) => {
                    const v = e.target.checked
                    setStreamEnabled(v)
                    saveStream({ enabled: v })
                  }}
                  className="accent-anibox-accent w-4 h-4"
                />
                <span className="text-xs text-anibox-text">启用局域网串流</span>
              </label>
              <p className="text-[10px] text-anibox-text-muted leading-relaxed">
                开启后手机连同一 WiFi，浏览器打开下方地址即可浏览番剧库并播放。
                <br />
                mp4/webm 直接播放；mkv 自动转封装（秒级）；HEVC 等不兼容编码自动转码（首次较慢，之后缓存）。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-anibox-text-muted block mb-1">端口</label>
                  <input
                    type="number"
                    min="1024"
                    max="65535"
                    value={streamPort}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setStreamPort(v)
                      saveStream({ port: v })
                    }}
                    className="w-full px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text focus:outline-none focus:border-anibox-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-anibox-text-muted block mb-1">状态</label>
                  <p
                    className={`px-3 py-2 text-sm rounded-lg border ${
                      streamState.running
                        ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5'
                        : 'text-anibox-text-muted border-anibox-border bg-anibox-bg'
                    }`}
                  >
                    {streamState.error
                      ? `✗ ${streamState.error}`
                      : streamState.running
                        ? `● 运行中 · 端口 ${streamState.port}`
                        : '○ 未启动'}
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={streamRequireToken}
                  onChange={(e) => {
                    const v = e.target.checked
                    setStreamRequireToken(v)
                    saveStream({ requireToken: v })
                  }}
                  className="accent-anibox-accent w-4 h-4"
                />
                <span className="text-xs text-anibox-text">要求访问口令</span>
              </label>
              {streamRequireToken && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text font-mono">
                    {streamToken || '—'}
                  </code>
                  <button
                    onClick={() => {
                      const t = Math.random().toString(36).slice(2, 8)
                      setStreamToken(t)
                      saveStream({ token: t })
                    }}
                    className="px-3 py-2 text-xs rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40 transition-colors"
                  >
                    重置
                  </button>
                </div>
              )}
              {streamState.urls.length > 0 && (
                <div>
                  <label className="text-xs text-anibox-text-muted block mb-1">访问地址（点按复制）</label>
                  <div className="space-y-1.5">
                    {streamState.urls.map((u) => (
                      <button
                        key={u}
                        onClick={() => {
                          navigator.clipboard?.writeText(u).catch(() => {})
                          setStreamSaved(true)
                          setTimeout(() => setStreamSaved(false), 1500)
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs bg-anibox-bg border border-anibox-border rounded-lg text-anibox-accent font-mono hover:border-anibox-accent/40 transition-colors"
                      >
                        <span>{u}</span>
                        <span className="text-anibox-text-muted">{streamSaved ? '✓ 已复制' : '复制'}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-anibox-text-muted mt-1">
                    手机与电脑需在同一局域网；若无法访问，请允许 Windows 防火墙放行该端口。
                  </p>
                </div>
              )}
              {!streamState.urls.length && (
                <p className="text-[10px] text-anibox-text-muted">
                  {streamEnabled ? '服务器启动中…' : '启用串流后这里会显示局域网访问地址'}
                </p>
              )}
              <div className="border-t border-anibox-border/40 pt-3">
                <label className="text-xs text-anibox-text-muted block mb-1">转码引擎 (ffmpeg)</label>
                <div className="flex items-center gap-2">
                  {engineInfo?.ffmpeg ? (
                    <span className="text-[11px] text-emerald-500">✓ 可用{engineInfo.ffmpegPath ? ` · ${engineInfo.ffmpegPath}` : ''}</span>
                  ) : engineInfo?.download?.state === 'downloading' ? (
                    <span className="text-[11px] text-anibox-accent">
                      正在下载 {Math.round((engineInfo.download.progress || 0) * 100)}%（约 80MB，仅首次需要）…
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-500">
                      {engineInfo?.download?.state === 'error'
                        ? `下载失败：${engineInfo.download.message || '未知错误'}`
                        : '未检测到，mkv/HEVC 转码需要 ffmpeg（首次播放时自动下载）'}
                    </span>
                  )}
                  {engineInfo && !engineInfo.ffmpeg && (
                    <button
                      onClick={async () => {
                        const r = await window.electronAPI.streamFfmpegRetry()
                        setEngineInfo(r)
                      }}
                      className="px-2 py-1 text-[11px] rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text transition-colors"
                    >
                      重试下载
                    </button>
                  )}
                </div>
                <label className="text-xs text-anibox-text-muted block mb-1 mt-3">转码缓存</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const r = await window.electronAPI.streamCacheInfo()
                      setCacheInfo(r ? `当前缓存 ${r.cacheMB} MB` : '')
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text transition-colors"
                  >
                    查看
                  </button>
                  <button
                    onClick={async () => {
                      const r = await window.electronAPI.streamCacheClean(100)
                      setCacheInfo(r ? `✓ 已清理 ${r.removed} 个文件，释放 ${r.freedMB} MB` : '✗ 清理失败')
                    }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text transition-colors"
                  >
                    清理缓存
                  </button>
                  {cacheInfo && <span className="text-[11px] text-anibox-text-muted">{cacheInfo}</span>}
                </div>
                <p className="text-[10px] text-anibox-text-muted/60 mt-1">
                  转封装/转码产物存储在 userData/stream-cache，同一文件再次播放秒开。
                </p>
              </div>
            </div>
          )}

          {/* === 关于 === */}
          {tab === 'about' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-anibox-bg border border-anibox-border mx-auto flex items-center justify-center">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  className="text-anibox-accent"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <circle cx="8" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-anibox-text">AniBox</h3>
                <p className="text-xs text-anibox-text-muted mt-0.5">本地番剧库管理 & 播放器</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 max-w-[420px] mx-auto">
                {[
                  'HTML5 + libmpv + mpv 三引擎',
                  'Anime4K 实时超分',
                  'AI 翻译 · DeepSeek',
                  '新番时间表',
                  '弹幕',
                  '双语字幕',
                  'OP/ED 一键跳过',
                  'AniList + Bangumi 刮削',
                  'AnimeGarden 资源下载',
                ].map((f) => (
                  <span
                    key={f}
                    className="text-[10px] px-2 py-1 rounded-full bg-anibox-bg border border-anibox-border text-anibox-text-muted"
                  >
                    {f}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-anibox-text-muted/60">
                Electron {appInfo?.electron || '33'} · React 19 · Tailwind CSS
              </p>
              <p className="text-[10px] text-anibox-text-muted/40">
                v{appInfo?.version || '1.1.4'} · 2026 · MIT License
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
