/**
 * AnimeGardenPanel — 从新番时间表详情弹窗打开的资源搜索/下载面板
 *
 * 功能：
 * - 按番剧标题搜索 AnimeGarden（动漫花园聚合站）的 BT 资源
 * - 展示 标题/大小/字幕组/发布时间/类型，支持复制磁力链接
 * - 一键发送到 qBittorrent 下载（通过 WebUI API）
 * - 生成该番的 RSS 订阅链接（可复制，或直接添加到 qBittorrent 自动追番）
 */
import { useEffect, useState, useCallback, useRef } from 'react'

export interface AGCandidate {
  id: number
  provider: string
  providerId: string
  title: string
  href: string
  type: string
  magnet: string
  size: number // KB
  fansub?: { id: number; name: string } | null
  publisher?: { name: string } | null
  createdAt: string
}

interface Props {
  // 用于预填搜索词与生成 RSS 的番剧信息
  titles: { zh: string; romaji: string; english: string }
  onClose: () => void
  onOpenSettings?: () => void
}

function formatSize(kb: number): string {
  if (!kb || kb <= 0) return '未知'
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)} GB`
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${kb} KB`
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  } catch { return '' }
}

/** qBittorrent 下载规则名 */
function ruleNameOf(label: string): string {
  return `AniBox-${label}`
}

/** 翻译版本预设：label 展示 + 正则匹配字幕组标题里的翻译标记 */
const SUB_OPTIONS: { label: string; re: string }[] = [
  { label: '不限', re: '' },
  { label: '简体', re: '(?i)简体|简中|chs' },
  { label: '繁体', re: '(?i)繁体|繁中|cht' },
  { label: '简繁内嵌', re: '简繁' },
  { label: '简日', re: '简日' },
  { label: '繁日', re: '繁日' },
]

export default function AnimeGardenPanel({ titles, onClose, onOpenSettings }: Props) {
  const [keyword, setKeyword] = useState(titles.zh || titles.romaji || '')
  const [results, setResults] = useState<AGCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [qbConfigured, setQbConfigured] = useState(false)
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // 追番路径对话框
  const [pathDialog, setPathDialog] = useState<{
    label: string
    fansubId?: number
    fansubName?: string
  } | null>(null)
  const [pathValue, setPathValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [subChoice, setSubChoice] = useState('不限')
  const pathInputRef = useRef<HTMLInputElement>(null)

  const showNotice = useCallback((msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }, [])

  // 检查 qBittorrent 是否已配置
  useEffect(() => {
    window.electronAPI.qbGetConfig().then((c) => setQbConfigured(!!c)).catch(() => {})
  }, [])

  const search = useCallback(async (kw?: string) => {
    const q = (kw ?? keyword).trim()
    if (!q) { setError('请输入搜索关键词'); return }
    setLoading(true)
    setError('')
    const r = await window.electronAPI.animegardenSearch({
      search: q,
      type: '动画',
      pageSize: 30,
    })
    setLoading(false)
    if (!r.ok) { setError(r.error || '搜索失败'); setResults([]); return }
    setResults(r.resources || [])
  }, [keyword])

  // 打开时自动搜索（useState 初始值已是中文名，无需重复 setKeyword）
  useEffect(() => {
    const init = titles.zh || titles.romaji || ''
    if (init) search(init)
    setTimeout(() => inputRef.current?.focus(), 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copyMagnet = useCallback(async (m: string) => {
    try {
      await navigator.clipboard.writeText(m)
      showNotice('磁力链接已复制')
    } catch {
      showNotice('复制失败')
    }
  }, [showNotice])

  const downloadToQb = useCallback(async (m: string) => {
    if (!qbConfigured) {
      showNotice('请先在 设置 → 下载 中配置 qBittorrent')
      onOpenSettings?.()
      return
    }
    const r = await window.electronAPI.qbAddTorrent(m)
    showNotice(r.ok ? r.message : `⚠ ${r.message}`)
  }, [qbConfigured, showNotice, onOpenSettings])

  // 创建本地 RSS 订阅（镜像站 feed.xml 的 filter 不生效，由 AniBox 本地生成）
  const makeFeed = useCallback(
    async (opts: { fansubId?: number; fansubName?: string } = {}) => {
      const kw = keyword.trim()
      if (!kw) { showNotice('请先输入关键词'); return null }
      const name = opts.fansubName
        ? `${kw} · ${opts.fansubName}`
        : `${kw} · 全部字幕组`
      const r = await window.electronAPI.animegardenCreateFeed({
        name,
        search: kw,
        fansubId: opts.fansubId,
        fansubName: opts.fansubName,
        type: '动画',
      })
      if (!r.ok) { showNotice('创建订阅失败'); return null }
      return r.url
    },
    [keyword, showNotice],
  )

  const copyRss = useCallback(async () => {
    const url = await makeFeed()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      showNotice('RSS 订阅链接已复制（AniBox 本地生成，需保持 AniBox 运行）')
    } catch {
      showNotice(url)
    }
  }, [makeFeed, showNotice])

  // 订阅后自动创建下载规则（一键追番，支持翻译版本过滤）
  const addRuleAfterFeed = useCallback(async (feedPath: string | undefined, label: string, savepath: string, subLabel: string) => {
    try {
      const kw = keyword.trim()
      const opt = SUB_OPTIONS.find((o) => o.label === subLabel) || SUB_OPTIONS[0]
      // 选"不限"用番名关键词（普通匹配）；选版本用正则（仅匹配该翻译版本）
      const ruleName = `AniBox-${label}${opt.re ? `-${subLabel}` : ''}`
      const ruleRes = await window.electronAPI.qbAddRule(ruleName, {
        mustContain: opt.re || kw,
        useRegex: !!opt.re,
        savepath,
        affectedFeeds: feedPath ? [feedPath] : [],
      })
      return ruleRes
    } catch {
      return { ok: false, message: '自动创建下载规则失败' }
    }
  }, [keyword])

  // 打开追番路径对话框
  const openTrackDialog = useCallback((opts: { label: string; fansubId?: number; fansubName?: string }) => {
    setPathDialog(opts)
    setPathValue('')
    setSubChoice('不限')
    setSubmitting(false)
    setTimeout(() => pathInputRef.current?.focus(), 60)
  }, [])

  // 确认追番：创建订阅 + 自动下载规则（可指定该番保存路径与翻译版本）
  const confirmSubscribe = useCallback(async () => {
    if (!pathDialog) return
    if (submitting) return
    setSubmitting(true)
    try {
      const label = pathDialog.label
      const savepath = pathValue.trim()
      const url = await makeFeed({
        fansubId: pathDialog.fansubId,
        fansubName: pathDialog.fansubName,
      })
      if (!url) { setSubmitting(false); return }
      const r = await window.electronAPI.qbAddRss(url)
      if (!r.ok) { showNotice(`⚠ ${r.message}`); setSubmitting(false); return }
      const rule = await addRuleAfterFeed(r.path, label, savepath, subChoice)
      const scope = pathDialog.fansubName ? `（${pathDialog.fansubName}）` : ''
      const subTxt = subChoice === '不限' ? '' : ` / 仅${subChoice}`
      showNotice(rule.ok
        ? `✓ 订阅已添加${scope}，规则「${ruleNameOf(label)}${subChoice !== '不限' ? `-${subChoice}` : ''}」${subTxt}匹配即自动下载${savepath ? ` → ${savepath}` : '（qBittorrent 默认目录）'}`
        : `✓ 订阅已添加${scope}，但规则创建失败（${rule.message}）`)
      setPathDialog(null)
    } finally {
      setSubmitting(false)
    }
  }, [pathDialog, submitting, pathValue, subChoice, makeFeed, addRuleAfterFeed, showNotice])

  // 顶部「➕ 添加到 qBittorrent 订阅」：先弹路径框
  const addRssToQb = useCallback(async () => {
    if (!qbConfigured) {
      showNotice('请先在 设置 → 下载 中配置 qBittorrent')
      onOpenSettings?.()
      return
    }
    const kw = keyword.trim()
    if (!kw) { showNotice('请先输入关键词'); return }
    openTrackDialog({ label: kw })
  }, [qbConfigured, keyword, openTrackDialog, showNotice, onOpenSettings])

  // 按指定字幕组创建订阅并复制链接
  const subscribeFansub = useCallback(async (r: AGCandidate) => {
    if (!r.fansub?.id) { showNotice('该资源没有字幕组信息'); return }
    const url = await makeFeed({ fansubId: r.fansub.id, fansubName: r.fansub.name })
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      showNotice(`已复制 ${r.fansub.name} 的订阅链接（AniBox 本地生成）`)
    } catch {
      showNotice(url)
    }
  }, [makeFeed, showNotice])

  // 资源行「➕ 追番」：先弹路径框（可按字幕组订阅并指定该番保存目录）
  const subscribeFansubToQb = useCallback(async (r: AGCandidate) => {
    if (!qbConfigured) {
      showNotice('请先在 设置 → 下载 中配置 qBittorrent')
      onOpenSettings?.()
      return
    }
    if (!r.fansub?.id) { showNotice('该资源没有字幕组信息'); return }
    openTrackDialog({
      label: `${keyword.trim()}-${r.fansub.name}`,
      fansubId: r.fansub.id,
      fansubName: r.fansub.name,
    })
  }, [qbConfigured, keyword, openTrackDialog, showNotice, onOpenSettings])

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
        onClick={onClose}
      >
      <div
        className="bg-anibox-surface border border-anibox-border rounded-xl shadow-2xl w-[720px] max-w-[92vw] max-h-[85vh] flex flex-col overflow-hidden view-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-anibox-border shrink-0">
          <h3 className="text-sm font-semibold text-anibox-text">🔗 获取资源</h3>
          <span className="text-xs text-anibox-text-muted truncate max-w-[280px]" title={titles.zh}>
            {titles.zh || titles.romaji}
          </span>
          <div className="flex-1" />
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-anibox-text-muted hover:text-anibox-text hover:bg-anibox-border/40 transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="px-4 py-3 border-b border-anibox-border/60 shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="输入番剧名搜索（支持中/日/英文，空格分隔多词）"
              className="flex-1 px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
            />
            <button
              onClick={() => search()}
              disabled={loading}
              className="px-4 py-2 text-sm bg-anibox-accent text-white rounded-lg hover:bg-anibox-accent/80 transition-colors disabled:opacity-50"
            >
              {loading ? '搜索中…' : '搜索'}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button onClick={copyRss} className="px-2.5 py-1 text-[11px] rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40 transition-colors">
              📡 复制 RSS 订阅链接
            </button>
            <button onClick={addRssToQb} className="px-2.5 py-1 text-[11px] rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40 transition-colors">
              ➕ 添加到 qBittorrent 订阅
            </button>
            {!qbConfigured && (
              <span className="text-[10px] text-amber-500/80">
                qBittorrent 未配置（设置 → 下载）
              </span>
            )}
            {notice && <span className="text-[11px] text-emerald-500 ml-auto">{notice}</span>}
          </div>
        </div>

        {/* 结果列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading && (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-anibox-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-anibox-text-muted">正在搜索 AnimeGarden…</p>
            </div>
          )}
          {!loading && error && (
            <div className="py-12 text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <button onClick={() => search()} className="px-3 py-1 text-xs bg-anibox-accent text-white rounded">重试</button>
            </div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="py-12 text-center text-xs text-anibox-text-muted">
              没有找到匹配的资源，试试更换关键词（如罗马音/英文名）
            </div>
          )}
          {!loading && !error && results.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] text-anibox-text-muted">找到 {results.length} 个资源</p>
              {results.map((r) => (
                <div
                  key={r.id}
                  className="group flex items-center gap-3 p-2.5 rounded-lg border border-anibox-border/60 hover:border-anibox-accent/40 hover:bg-anibox-bg/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-anibox-text leading-snug line-clamp-2" title={r.title}>
                      {r.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-accent/10 text-anibox-accent">{r.type}</span>
                      <span className="text-[10px] text-anibox-text-muted">{formatSize(r.size)}</span>
                      {r.fansub?.name && <span className="text-[10px] text-anibox-text-muted">字幕组: {r.fansub.name}</span>}
                      {r.publisher?.name && <span className="text-[10px] text-anibox-text-muted/60">发布: {r.publisher.name}</span>}
                      <span className="text-[10px] text-anibox-text-muted/60">{formatDate(r.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                    {r.fansub?.id && (
                      <button
                        onClick={() => subscribeFansub(r)}
                        title={`复制 ${r.fansub.name} 的 RSS 订阅链接`}
                        className="px-2 py-1 text-[11px] rounded border border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40 transition-colors"
                      >
                        📡 订阅
                      </button>
                    )}
                    {r.fansub?.id && (
                      <button
                        onClick={() => subscribeFansubToQb(r)}
                        title={`将 ${r.fansub.name} 的订阅添加到 qBittorrent`}
                        className="px-2 py-1 text-[11px] rounded border border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40 transition-colors"
                      >
                        ➕ 追番
                      </button>
                    )}
                    <button
                      onClick={() => copyMagnet(r.magnet)}
                      title="复制磁力链接"
                      className="px-2 py-1 text-[11px] rounded border border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40 transition-colors"
                    >
                      复制磁力
                    </button>
                    <button
                      onClick={() => downloadToQb(r.magnet)}
                      title="发送到 qBittorrent 下载"
                      className="px-2 py-1 text-[11px] rounded bg-anibox-accent text-white hover:bg-anibox-accent/80 transition-colors"
                    >
                      ⬇ 下载
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2 border-t border-anibox-border/60 text-[10px] text-anibox-text-muted/60 shrink-0">
          数据来源: AnimeGarden（动漫花园镜像聚合站）· RSS 由 AniBox 本地生成（需保持运行）· 磁力资源请确认字幕组与清晰度
        </div>
      </div>
      </div>

      {/* 追番路径对话框：为该番指定保存文件夹 */}
      {pathDialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
          onClick={() => !submitting && setPathDialog(null)}
        >
          <div
            className="bg-anibox-surface border border-anibox-border rounded-xl shadow-2xl w-[480px] max-w-[90vw] p-5 view-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-semibold text-anibox-text mb-1">➕ 一键追番</h4>
            <p className="text-xs text-anibox-text-muted mb-3 break-all">
              订阅：{pathDialog.label}
              {pathDialog.fansubName ? `（${pathDialog.fansubName}）` : '（全部字幕组）'}
            </p>
            <label className="text-xs text-anibox-text-muted block mb-1">
              该番保存文件夹（可选，留空用 qBittorrent 默认目录）
            </label>
            <div className="flex gap-2">
              <input
                ref={pathInputRef}
                value={pathValue}
                onChange={(e) => setPathValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmSubscribe()}
                placeholder="如 F:\番剧\葬送的芙莉莲"
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
              />
              <button
                onClick={async () => {
                  const p = await window.electronAPI.openFolder()
                  if (p) setPathValue(p)
                }}
                title="选择文件夹"
                className="px-3 py-2 text-sm rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40 transition-colors shrink-0"
              >
                📁 选择…
              </button>
            </div>
            <p className="text-[10px] text-anibox-text-muted/60 mb-3">
              自动创建订阅 + 下载规则「{ruleNameOf(pathDialog.label)}」，匹配到的新剧集直接下载到该目录
            </p>
            <label className="text-xs text-anibox-text-muted block mb-1">翻译版本（下载规则过滤）</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {SUB_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  onClick={() => setSubChoice(o.label)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${
                    subChoice === o.label
                      ? 'border-anibox-accent bg-anibox-accent/15 text-anibox-accent'
                      : 'border-anibox-border text-anibox-text-muted hover:text-anibox-text hover:border-anibox-accent/40'
                  }`}
                  title={o.re ? `正则: ${o.re}` : '不过滤翻译版本'}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => !submitting && setPathDialog(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-text transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmSubscribe}
                disabled={submitting}
                className="px-4 py-1.5 text-xs rounded-lg bg-anibox-accent text-white hover:bg-anibox-accent/80 transition-colors disabled:opacity-50"
              >
                {submitting ? '处理中…' : '开始追番'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
