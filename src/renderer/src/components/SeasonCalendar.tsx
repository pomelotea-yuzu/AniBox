/**
 * SeasonCalendar — AniList 日本 TV 动画新番时间表
 * 按星期排列、中文标题翻译、内嵌详情弹窗
 */
import { useEffect, useState, useMemo, useCallback } from 'react'

interface NextAiring {
  episode: number
  airingAt: number
  timeUntilAiring: number
}

interface AnimeItem {
  id: number
  title: string
  titleRomaji: string
  titleEnglish: string
  titleZh: string
  cover: string
  episodes: number | null
  score: number | null
  genres: string[]
  format: string
  status: string
  nextAiring: NextAiring | null
}

interface AnimeDetail {
  id: number
  title: { native: string; romaji: string; english: string }
  coverImage: { large: string; extraLarge: string }
  bannerImage: string
  description: string
  descriptionZh: string
  episodes: number
  duration: number
  averageScore: number
  popularity: number
  genres: string[]
  studios: { nodes: { name: string }[] }
  startDate: { year: number; month: number; day: number }
  endDate: { year: number; month: number; day: number }
  season: string
  seasonYear: number
  format: string
  status: string
  nextAiringEpisode: { airingAt: number; episode: number; timeUntilAiring: number } | null
}

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const SEASON_NAMES: Record<string, string> = { WINTER: '冬季', SPRING: '春季', SUMMER: '夏季', FALL: '秋季' }
const STATUS_NAMES: Record<string, string> = {
  FINISHED: '已完结', RELEASING: '放送中', NOT_YET_RELEASED: '未开播', CANCELLED: '已取消', HIATUS: '停更中',
}

function getDayOfWeek(ts: number): number { return new Date(ts * 1000).getDay() }
function formatAiringTime(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
function formatTimeUntil(seconds: number): string {
  if (seconds <= 0) return '已播出'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d}天${h}时后`
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}时${m}分后`
}
function formatDate(y: number, m: number, d: number): string {
  if (!y || !m || !d) return '未知'
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function SeasonCalendar({ onBack }: { onBack: () => void }) {
  const [season, setSeason] = useState('')
  const [anime, setAnime] = useState<AnimeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDay, setSelectedDay] = useState<number>(-1)
  const [fromCache, setFromCache] = useState(false)
  const [stale, setStale] = useState(false)

  // 详情弹窗状态
  const [detailAnime, setDetailAnime] = useState<AnimeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchData = useCallback(async (force?: boolean) => {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.seasonFetchTimeline(force)
      if (!result.ok) { setError(result.error || '加载失败'); return }
      setSeason(result.season || '')
      const raw = (result.anime || []).map((a: any) => ({
        ...a,
        titleZh: a.titleZh || a.title, // 优先 AI 翻译，兜底日文原名
      }))
      setAnime(raw)
      setFromCache(!!result.fromCache)
      setStale(!!result.stale)
      if (force) setSelectedDay(-1)
    } catch (e: any) { setError(e.message || '网络错误') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 按星期分组
  const groupedByDay = useMemo(() => {
    const groups = Array.from({ length: 7 }, (_, i) => ({
      day: i, label: `周${DAY_LABELS[i]}`, items: [] as AnimeItem[],
    }))
    const unplaced: AnimeItem[] = []
    for (const a of anime) {
      if (a.nextAiring) { groups[getDayOfWeek(a.nextAiring.airingAt)].items.push(a) }
      else { unplaced.push(a) }
    }
    return { groups, unplaced }
  }, [anime])

  const filteredGroups = useMemo(() => {
    if (selectedDay === -1) return groupedByDay.groups
    return groupedByDay.groups.filter((_, i) => i === selectedDay)
  }, [groupedByDay, selectedDay])

  const today = new Date().getDay()

  // 打开详情弹窗
  const openDetail = useCallback(async (a: AnimeItem) => {
    setDetailLoading(true)
    setDetailAnime(null)
    try {
      const r = await window.electronAPI.seasonFetchDetail(a.id)
      if (r.ok && r.detail) {
        const d = r.detail
        console.log('[SeasonCalendar] detail raw desc:', d.description?.substring(0, 100))
        // AI 翻译简介
        let descZh = d.description || ''
        if (descZh) {
          try {
            const cleaned = descZh.replace(/<[^>]+>/g, '').substring(0, 1000)
            console.log('[SeasonCalendar] cleaned desc:', cleaned.substring(0, 100))
            const aiResult = await window.electronAPI.aiTranslate(cleaned, 'auto', 'zh')
            console.log('[SeasonCalendar] AI result:', aiResult?.substring(0, 100))
            if (aiResult && aiResult !== cleaned) descZh = aiResult
          } catch (e) { console.error('[SeasonCalendar] AI translate failed:', e); descZh = d.description || '' }
        } else {
          descZh = '暂无简介'
        }
        setDetailAnime({ ...d, descriptionZh: descZh })
      }
    } catch { /* ignore */ }
    finally { setDetailLoading(false) }
  }, [])

  const closeDetail = () => setDetailAnime(null)

  return (
    <div className="w-full h-full flex flex-col bg-anibox-bg">
      {/* 头部 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-anibox-surface border-b border-anibox-border shrink-0">
        <button onClick={onBack} className="px-2 py-0.5 text-xs text-anibox-text-muted hover:text-anibox-text border border-anibox-border rounded hover:border-anibox-text-muted transition-colors">← 返回</button>
        <h2 className="text-sm font-semibold text-anibox-text">新番时间表</h2>
        {!loading && !error && (
          <span className="text-xs text-anibox-text-muted">
            {season} · {anime.length} 部
            {fromCache && !stale && <span className="ml-1 text-anibox-text-muted/50">缓存</span>}
            {stale && <span className="ml-1 text-amber-400/70">过期缓存</span>}
          </span>
        )}
        <div className="flex-1" />
        {!loading && !error && anime.length > 0 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedDay(-1)} className={`px-2 py-0.5 text-xs rounded transition-colors ${selectedDay === -1 ? 'bg-anibox-accent/20 text-anibox-accent' : 'text-anibox-text-muted hover:text-anibox-text'}`}>全部</button>
            {groupedByDay.groups.map((g, i) => (
              <button key={i} onClick={() => setSelectedDay(i)} className={`w-7 h-7 text-xs rounded-full flex items-center justify-center transition-colors ${selectedDay === i ? 'bg-anibox-accent text-white font-medium' : i === today ? 'text-anibox-accent border border-anibox-accent/40' : 'text-anibox-text-muted hover:text-anibox-text'}`} title={`周${DAY_LABELS[i]} · ${g.items.length}部`}>{DAY_LABELS[i]}</button>
            ))}
          </div>
        )}
        <button onClick={() => fetchData(true)} disabled={loading} className="px-2 py-0.5 text-xs text-anibox-text-muted hover:text-anibox-text border border-anibox-border rounded transition-colors ml-2 disabled:opacity-40" title="强制刷新">{loading ? '...' : '↻'}</button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-anibox-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-anibox-text-muted">加载新番数据...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <button onClick={() => fetchData(true)} className="px-3 py-1 text-xs bg-anibox-accent text-white rounded hover:bg-anibox-accent/80 transition-colors">重试</button>
            </div>
          </div>
        )}
        {!loading && !error && (
          <div className="p-4">
            {filteredGroups.map((g) => (
              <div key={g.day} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-base font-semibold text-anibox-text">周{DAY_LABELS[g.day]}</h3>
                  {g.day === today && <span className="px-1.5 py-0.5 text-[10px] bg-anibox-accent/20 text-anibox-accent rounded">今天</span>}
                  <span className="text-xs text-anibox-text-muted">{g.items.length} 部</span>
                </div>
                {g.items.length === 0 ? (
                  <p className="text-xs text-anibox-text-muted py-4">当日无番剧</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {g.items.map((a) => <AnimeCard key={a.id} a={a} onClick={() => openDetail(a)} />)}
                  </div>
                )}
              </div>
            ))}
            {groupedByDay.unplaced.length > 0 && selectedDay === -1 && (
              <div className="mt-4 pt-4 border-t border-anibox-border">
                <h3 className="text-base font-semibold text-anibox-text mb-3">待定播出日 · {groupedByDay.unplaced.length} 部</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {groupedByDay.unplaced.map((a) => <AnimeCard key={a.id} a={a} onClick={() => openDetail(a)} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {(detailAnime || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeDetail}>
          <div className="bg-anibox-surface border border-anibox-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-anibox-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : detailAnime ? (
              <div>
                {/* Banner */}
                {detailAnime.bannerImage && (
                  <div className="h-36 bg-cover bg-center relative" style={{ backgroundImage: `url(${detailAnime.bannerImage})` }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-anibox-surface via-anibox-surface/60 to-transparent" />
                  </div>
                )}
                <div className={`px-6 ${detailAnime.bannerImage ? '-mt-12' : 'pt-6'} pb-6`}>
                  {/* 关闭按钮 */}
                  <button onClick={closeDetail} className="absolute top-3 right-3 text-anibox-text-muted hover:text-white transition-colors z-10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>

                  <div className="flex gap-5">
                    {/* 封面 */}
                    <div className="shrink-0 w-28 relative z-10">
                      <img src={detailAnime.coverImage.large} alt="" className="w-full rounded-lg shadow-lg" />
                      {detailAnime.averageScore && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                          ★ {(detailAnime.averageScore / 10).toFixed(1)}
                        </div>
                      )}
                    </div>

                    {/* 信息 */}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-anibox-text mb-1">
                        {detailAnime.title.native || detailAnime.title.romaji}
                      </h3>
                      {detailAnime.title.english && detailAnime.title.english !== detailAnime.title.native && (
                        <p className="text-xs text-anibox-text-muted mb-2">{detailAnime.title.english}</p>
                      )}

                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-accent/15 text-anibox-accent">{STATUS_NAMES[detailAnime.status] || detailAnime.status}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-border/50 text-anibox-text-muted">{detailAnime.format}</span>
                        {detailAnime.episodes && <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-border/50 text-anibox-text-muted">{detailAnime.episodes}话</span>}
                        {detailAnime.duration && <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-border/50 text-anibox-text-muted">{detailAnime.duration}分钟</span>}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-border/50 text-anibox-text-muted">
                          {SEASON_NAMES[detailAnime.season] || detailAnime.season} {detailAnime.seasonYear}
                        </span>
                      </div>

                      {/* 播出时间 */}
                      <div className="flex items-center gap-2 text-xs text-anibox-text-muted mb-2">
                        <span>📅 {formatDate(detailAnime.startDate.year, detailAnime.startDate.month, detailAnime.startDate.day)}</span>
                        {detailAnime.endDate.year && <span>→ {formatDate(detailAnime.endDate.year, detailAnime.endDate.month, detailAnime.endDate.day)}</span>}
                        {detailAnime.nextAiringEpisode && (
                          <span className="text-anibox-accent">
                            下集: 第{detailAnime.nextAiringEpisode.episode}话 {formatTimeUntil(detailAnime.nextAiringEpisode.timeUntilAiring)}
                          </span>
                        )}
                      </div>

                      {/* 制作公司 */}
                      {detailAnime.studios?.nodes?.length > 0 && (
                        <div className="text-xs text-anibox-text-muted mb-2">
                          制作: {detailAnime.studios.nodes.map((s) => s.name).join(' / ')}
                        </div>
                      )}

                      {/* 类型 */}
                      {detailAnime.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {detailAnime.genres.map((g) => (
                            <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-anibox-accent/10 text-anibox-accent/80">{g}</span>
                          ))}
                        </div>
                      )}

                      {/* 人气 */}
                      <span className="text-[10px] text-anibox-text-muted/50">
                        👥 {detailAnime.popularity?.toLocaleString() || 0} 人关注
                      </span>
                    </div>
                  </div>

                  {/* 简介 */}
                  {detailAnime.descriptionZh && (
                    <div className="mt-4 p-3 bg-anibox-bg rounded-lg border border-anibox-border">
                      <h4 className="text-xs font-semibold text-anibox-text mb-1">简介</h4>
                      <p className="text-xs text-anibox-text-muted leading-relaxed whitespace-pre-line">{detailAnime.descriptionZh}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-sm text-anibox-text-muted">加载详情失败</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** 番剧卡片 */
function AnimeCard({ a, onClick }: { a: AnimeItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-anibox-surface rounded-lg overflow-hidden border border-anibox-border hover:border-anibox-accent/40 transition-all hover:shadow-lg hover:shadow-anibox-accent/5 cursor-pointer"
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
          {a.nextAiring ? (
            <>
              <span className="text-[10px] text-anibox-accent/80">第{a.nextAiring.episode}话</span>
              <span className="text-[10px] text-anibox-text-muted/60">{formatAiringTime(a.nextAiring.airingAt)}</span>
            </>
          ) : (
            <span className="text-[10px] text-anibox-text-muted/50">{a.episodes ? `${a.episodes}话` : '未定'}</span>
          )}
        </div>
        {a.nextAiring && a.nextAiring.timeUntilAiring > 0 && (
          <p className="text-[9px] text-amber-400/70 mt-0.5">{formatTimeUntil(a.nextAiring.timeUntilAiring)}</p>
        )}
        {a.genres.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {a.genres.slice(0, 2).map((g) => (
              <span key={g} className={`text-[8px] px-1 rounded ${GENRE_COLORS[g] || 'bg-neutral-500/20 text-neutral-400'}`}>{g}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const GENRE_COLORS: Record<string, string> = {
  Action: 'bg-red-400/20 text-red-300', Adventure: 'bg-amber-400/20 text-amber-300',
  Comedy: 'bg-yellow-400/20 text-yellow-300', Drama: 'bg-purple-400/20 text-purple-300',
  Fantasy: 'bg-indigo-400/20 text-indigo-300', 'Sci-Fi': 'bg-cyan-400/20 text-cyan-300',
  Romance: 'bg-pink-400/20 text-pink-300', Horror: 'bg-orange-400/20 text-orange-300',
  Mystery: 'bg-emerald-400/20 text-emerald-300', Thriller: 'bg-rose-400/20 text-rose-300',
  'Slice of Life': 'bg-green-400/20 text-green-300', Mecha: 'bg-slate-400/20 text-slate-300',
  Sports: 'bg-lime-400/20 text-lime-300', Supernatural: 'bg-violet-400/20 text-violet-300',
}
