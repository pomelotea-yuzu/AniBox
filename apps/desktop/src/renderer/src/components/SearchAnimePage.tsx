/**
 * SearchAnimePage — 搜索番剧页面
 *
 * 功能：
 * - 输入番剧名（中/日/英文）通过 AniList 搜索番剧，卡片网格展示（封面/评分/类型/状态）
 * - 点击卡片打开详情弹窗（标题/评分/类型/简介等）
 * - 详情中「🔗 获取资源」打开 AnimeGardenPanel，像新番时间表一样搜索 BT 资源并下载/追番
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import AnimeGardenPanel from './AnimeGardenPanel'

interface AnimeItem {
  id: number
  title: string
  titleRomaji: string
  titleEnglish: string
  titleZh: string
  cover: string
  coverExtra: string
  bannerImage: string
  description: string
  descriptionZh: string
  episodes: number | null
  duration: number | null
  score: number | null
  popularity: number | null
  genres: string[]
  studios: string[]
  startDate: { year: number; month: number; day: number } | null
  endDate: { year: number; month: number; day: number } | null
  season: string
  seasonYear: number
  format: string
  status: string
  nextAiring: { episode: number; airingAt: number; timeUntilAiring: number } | null
}

const STATUS_NAMES: Record<string, string> = {
  FINISHED: '已完结', RELEASING: '放送中', NOT_YET_RELEASED: '未开播', CANCELLED: '已取消', HIATUS: '停更中',
}
const SEASON_NAMES: Record<string, string> = { WINTER: '冬季', SPRING: '春季', SUMMER: '夏季', FALL: '秋季' }

/** 常见番剧示例，帮助用户快速上手搜索 */
const HOT_SUGGESTIONS = [
  '葬送的芙莉莲', '进击的巨人', '咒术回战', '间谍过家家', '孤独摇滚', '我推的孩子',
  '无职转生', 'Re:Zero', '鬼灭之刃', '排球少年', '葬送的芙莉莲 第二季', '怪兽8号',
]

function formatDate(y: number, m: number, d: number): string {
  if (!y || !m || !d) return '未知'
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function SearchAnimePage({ onBack, onOpenSettings }: { onBack: () => void; onOpenSettings?: () => void }) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<AnimeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [qbConfigured, setQbConfigured] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 详情 / 资源弹窗
  const [detailAnime, setDetailAnime] = useState<AnimeItem | null>(null)
  const [resourceAnime, setResourceAnime] = useState<AnimeItem | null>(null)

  // 检查 qBittorrent 是否已配置
  useEffect(() => {
    window.electronAPI.qbGetConfig().then((c) => setQbConfigured(!!c)).catch(() => {})
  }, [])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const search = useCallback(async (kw?: string) => {
    const q = (kw ?? keyword).trim()
    if (!q) { setError('请输入番剧名称'); return }
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const r = await window.electronAPI.animeSearch(q)
      if (!r.ok) { setError(r.error || '搜索失败'); setResults([]); return }
      setResults((r.anime || []).map((a: any) => ({
        ...a,
        titleZh: a.titleZh || a.title, // 优先 AI 翻译，兜底日文原名
      })))
    } catch (e: any) {
      setError(e.message || '网络错误')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [keyword])

  const openDetail = useCallback((a: AnimeItem) => setDetailAnime(a), [])
  const closeDetail = useCallback(() => setDetailAnime(null), [])

  return (
    <div className="w-full h-full flex flex-col bg-anibox-bg">
      {/* 头部：返回 + 搜索框（三栏镜像布局，搜索框水平居中） */}
      <div className="flex items-center gap-3 px-4 py-3 bg-anibox-surface border-b border-anibox-border shrink-0">
        {/* 左：返回 + 标题 */}
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          <button onClick={onBack} className="px-2.5 py-1.5 text-xs text-anibox-text-muted hover:text-anibox-text hover:bg-anibox-border/30 border border-anibox-border rounded-lg transition-all duration-150 active:scale-95">← 返回</button>
          <h2 className="text-sm font-semibold text-anibox-text">搜索番剧</h2>
        </div>
        {/* 中：搜索区（占满剩余宽度并居中内容） */}
        <div className="flex-1 flex justify-center min-w-0 px-2">
          <div className="flex items-center gap-2 w-full max-w-2xl min-w-0">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="输入番剧名搜索（支持中/日/英文）"
                className="w-full px-3 py-2 pr-16 text-sm bg-anibox-bg border border-anibox-border rounded-lg text-anibox-text placeholder:text-anibox-text-muted/50 focus:outline-none focus:border-anibox-accent"
              />
              {keyword && (
                <button
                  onClick={() => { setKeyword(''); setError(''); inputRef.current?.focus() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-anibox-text-muted hover:text-anibox-text transition-colors"
                  title="清空"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <button
              onClick={() => search()}
              disabled={loading}
              className="px-4 py-2 text-sm bg-anibox-accent text-white rounded-lg hover:bg-anibox-accent/80 transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  搜索中…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
                  搜索
                </>
              )}
            </button>
            {!qbConfigured && (
              <span className="text-[10px] text-amber-500/80 shrink-0">
                qBittorrent 未配置（设置 → 下载）
              </span>
            )}
          </div>
        </div>
        {/* 右：与左侧等宽的不可见镜像，保证搜索区真正居中 */}
        <div className="flex items-center gap-3 shrink-0 invisible pointer-events-none" aria-hidden="true">
          <button className="px-2.5 py-1.5 text-xs text-anibox-text-muted border border-anibox-border rounded-lg">← 返回</button>
          <h2 className="text-sm font-semibold text-anibox-text">搜索番剧</h2>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-anibox-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-anibox-text-muted">正在搜索番剧...</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <button onClick={() => search()} className="px-3 py-1 text-xs bg-anibox-accent text-white rounded transition-all duration-150 active:scale-95 hover:bg-anibox-accent/80">重试</button>
            </div>
          </div>
        )}

        {!loading && !error && !searched && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 py-10">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-anibox-surface border border-anibox-border flex items-center justify-center">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-anibox-text-muted">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-anibox-text mb-1">想找哪部番剧？</h3>
              <p className="text-sm text-anibox-text-muted">输入番剧名称搜索，点击卡片查看详情，即可像新番时间表一样获取资源并下载</p>
            </div>
            <div className="w-full max-w-lg px-6">
              <p className="text-xs text-anibox-text-muted mb-2">试试搜索：</p>
              <div className="flex flex-wrap gap-1.5">
                {HOT_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setKeyword(s); search(s) }}
                    className="px-2.5 py-1 text-[11px] rounded-lg border border-anibox-border text-anibox-text-muted hover:text-anibox-accent hover:border-anibox-accent/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && searched && results.length === 0 && (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-sm text-anibox-text-muted">没有找到相关番剧，试试更换关键词（如罗马音/英文名）</p>
          </div>
        )}

        {!loading && !error && searched && results.length > 0 && (
          <div className="p-4">
            <p className="text-[11px] text-anibox-text-muted mb-3">找到 {results.length} 部番剧 · 点击卡片查看详情并获取资源</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {results.map((a) => <AnimeCard key={a.id} a={a} onClick={() => openDetail(a)} />)}
            </div>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {detailAnime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeDetail}>
          <div className="bg-anibox-surface border border-anibox-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              {/* Banner */}
              {detailAnime.bannerImage && (
                <div className="h-36 bg-cover bg-center relative" style={{ backgroundImage: `url(${detailAnime.bannerImage})` }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-anibox-surface via-anibox-surface/60 to-transparent" />
                </div>
              )}
              <button onClick={closeDetail} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-anibox-text-muted hover:text-anibox-text hover:bg-anibox-border/40 transition-all duration-150 active:scale-90 z-10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>

              <div className={`px-6 ${detailAnime.bannerImage ? '-mt-12' : 'pt-6'} pb-6`}>
                <div className="flex gap-5">
                  {/* 封面 */}
                  <div className="shrink-0 w-28 relative z-10">
                    <img src={detailAnime.cover || detailAnime.coverExtra} alt="" className="w-full rounded-lg shadow-lg" />
                    {detailAnime.score && (
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                        ★ {(detailAnime.score / 10).toFixed(1)}
                      </div>
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-anibox-text mb-1">
                      {detailAnime.titleZh || detailAnime.title}
                    </h3>
                    {detailAnime.titleEnglish && detailAnime.titleEnglish !== detailAnime.title && (
                      <p className="text-xs text-anibox-text-muted mb-2">{detailAnime.titleEnglish}</p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-accent/15 text-anibox-accent">{STATUS_NAMES[detailAnime.status] || detailAnime.status}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-border/50 text-anibox-text-muted">{detailAnime.format}</span>
                      {detailAnime.episodes && <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-border/50 text-anibox-text-muted">{detailAnime.episodes}话</span>}
                      {detailAnime.duration && <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-border/50 text-anibox-text-muted">{detailAnime.duration}分钟</span>}
                      {(detailAnime.seasonYear || detailAnime.season) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-border/50 text-anibox-text-muted">
                          {SEASON_NAMES[detailAnime.season] || detailAnime.season} {detailAnime.seasonYear || ''}
                        </span>
                      )}
                    </div>

                    {/* 播出时间 */}
                    <div className="flex items-center gap-2 text-xs text-anibox-text-muted mb-2">
                      {detailAnime.startDate && <span>📅 {formatDate(detailAnime.startDate.year, detailAnime.startDate.month, detailAnime.startDate.day)}</span>}
                      {detailAnime.endDate?.year && <span>→ {formatDate(detailAnime.endDate.year, detailAnime.endDate.month, detailAnime.endDate.day)}</span>}
                    </div>

                    {/* 制作公司 */}
                    {detailAnime.studios?.length > 0 && (
                      <div className="text-xs text-anibox-text-muted mb-2">
                        制作: {detailAnime.studios.join(' / ')}
                      </div>
                    )}

                    {/* 类型 */}
                    {detailAnime.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {detailAnime.genres.map((g) => (
                          <span key={g} className={`text-[10px] px-1.5 py-0.5 rounded ${genreColor(g)}`}>{g}</span>
                        ))}
                      </div>
                    )}

                    {/* 人气 + 获取资源 */}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-[10px] text-anibox-text-muted/50">
                        👥 {detailAnime.popularity?.toLocaleString() || 0} 人关注
                      </span>
                      <button
                        onClick={() => { setResourceAnime(detailAnime); setDetailAnime(null) }}
                        className="px-2.5 py-1 text-[11px] rounded-lg bg-anibox-accent/10 text-anibox-accent border border-anibox-accent/30 hover:bg-anibox-accent/20 transition-colors"
                        title="在 AnimeGarden 搜索该番剧的 BT 资源，可发送到 qBittorrent 下载"
                      >
                        🔗 获取资源
                      </button>
                    </div>
                  </div>
                </div>

                {/* 简介 */}
                {(detailAnime.descriptionZh || detailAnime.description) && (
                  <div className="mt-4 p-3 bg-anibox-bg rounded-lg border border-anibox-border">
                    <h4 className="text-xs font-semibold text-anibox-text mb-1">简介</h4>
                    <p className="text-xs text-anibox-text-muted leading-relaxed whitespace-pre-line">{detailAnime.descriptionZh || detailAnime.description || '暂无简介'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AnimeGarden 资源获取弹窗（与新番时间表一致的下载/追番体验） */}
      {resourceAnime && (
        <AnimeGardenPanel
          titles={{
            zh: resourceAnime.titleZh || resourceAnime.title || '',
            romaji: resourceAnime.titleRomaji || '',
            english: resourceAnime.titleEnglish || '',
          }}
          onClose={() => setResourceAnime(null)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  )
}

/** 番剧卡片（与新番时间表同款样式） */
function AnimeCard({ a, onClick }: { a: AnimeItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-anibox-surface rounded-lg overflow-hidden border border-anibox-border hover:border-anibox-accent/40 transition-all duration-200 active:scale-[0.98] hover:shadow-lg hover:shadow-anibox-accent/5 cursor-pointer"
    >
      <div className="aspect-[3/4] bg-anibox-border/30 overflow-hidden relative">
        {a.cover ? (
          <img src={a.cover} alt={a.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-anibox-text-muted text-xl">?</div>
        )}
        {a.score && (
          <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/70 rounded text-[10px] text-amber-400 font-medium">★ {(a.score / 10).toFixed(1)}</div>
        )}
        {a.status === 'FINISHED' && (
          <div className="absolute top-1 right-1 px-1 py-0.5 bg-emerald-500/80 rounded text-[9px] text-white">完结</div>
        )}
        {/* 悬浮遮罩 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 bg-anibox-accent/80 rounded">查看详情</span>
        </div>
      </div>
      <div className="p-2">
        <p className="text-xs font-medium text-anibox-text truncate mb-1 leading-tight" title={a.title}>{a.titleZh || a.title}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-anibox-text-muted/50">{a.episodes ? `${a.episodes}话` : '未定'}</span>
          {a.seasonYear && (
            <span className="text-[10px] text-anibox-text-muted/40">{a.seasonYear}年</span>
          )}
        </div>
        {a.genres.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {a.genres.slice(0, 2).map((g) => (
              <span key={g} className={`text-[8px] px-1 rounded ${genreColor(g)}`}>{g}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const GENRE_COLORS: Record<string, string> = {
  动作: 'bg-red-400/20 text-red-400', 冒险: 'bg-amber-400/20 text-amber-400',
  喜剧: 'bg-yellow-400/20 text-yellow-400', 剧情: 'bg-purple-400/20 text-purple-400',
  奇幻: 'bg-indigo-400/20 text-indigo-400', 科幻: 'bg-cyan-400/20 text-cyan-400',
  恋爱: 'bg-pink-400/20 text-pink-400', 恐怖: 'bg-orange-400/20 text-orange-400',
  悬疑: 'bg-emerald-400/20 text-emerald-400', 惊悚: 'bg-rose-400/20 text-rose-400',
  日常: 'bg-green-400/20 text-green-400', 机甲: 'bg-slate-400/20 text-slate-400',
  运动: 'bg-lime-400/20 text-lime-400', 超自然: 'bg-violet-400/20 text-violet-400',
  音乐: 'bg-sky-400/20 text-sky-400', 校园: 'bg-teal-400/20 text-teal-400',
  魔法: 'bg-fuchsia-400/20 text-fuchsia-400', 异世界: 'bg-blue-400/20 text-blue-400',
  后宫: 'bg-rose-400/20 text-rose-400', 美食: 'bg-amber-400/20 text-amber-400',
  耽美: 'bg-pink-400/20 text-pink-400', 百合: 'bg-fuchsia-400/20 text-fuchsia-400',
  军事: 'bg-stone-400/20 text-stone-400', 历史: 'bg-yellow-600/20 text-yellow-600',
  心理: 'bg-indigo-400/20 text-indigo-400', 转生: 'bg-purple-400/20 text-purple-400',
  侦探: 'bg-amber-500/20 text-amber-500', 末世: 'bg-red-500/20 text-red-500',
  超能力: 'bg-blue-400/20 text-blue-400', 恶搞: 'bg-orange-400/20 text-orange-400',
  治愈: 'bg-green-400/20 text-green-400', 电竞: 'bg-cyan-400/20 text-cyan-400',
  丧尸: 'bg-lime-500/20 text-lime-500', 复仇: 'bg-red-500/20 text-red-500',
}

const GENRE_PALETTE = [
  'bg-red-400/20 text-red-400', 'bg-amber-400/20 text-amber-400',
  'bg-yellow-400/20 text-yellow-400', 'bg-green-400/20 text-green-400',
  'bg-emerald-400/20 text-emerald-400', 'bg-teal-400/20 text-teal-400',
  'bg-cyan-400/20 text-cyan-400', 'bg-sky-400/20 text-sky-400',
  'bg-blue-400/20 text-blue-400', 'bg-indigo-400/20 text-indigo-400',
  'bg-purple-400/20 text-purple-400', 'bg-fuchsia-400/20 text-fuchsia-400',
  'bg-pink-400/20 text-pink-400', 'bg-rose-400/20 text-rose-400',
  'bg-orange-400/20 text-orange-400', 'bg-lime-400/20 text-lime-400',
  'bg-violet-400/20 text-violet-400', 'bg-stone-400/20 text-stone-400',
]

function genreColor(g: string): string {
  if (GENRE_COLORS[g]) return GENRE_COLORS[g]
  let hash = 0
  for (let i = 0; i < g.length; i++) hash = ((hash << 5) - hash) + g.charCodeAt(i)
  return GENRE_PALETTE[Math.abs(hash) % GENRE_PALETTE.length]
}
