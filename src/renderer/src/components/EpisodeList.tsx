/**
 * EpisodeList — 番剧选集页
 * 上半部：封面 + 元数据（评分/年份/简介/Staff/类型标签）
 * 下半部：剧集网格
 */
import { useState, useEffect } from 'react'
import type { SeriesInfo, EpisodeInfo } from '../../../main/scanner'

function md5(str: string): string {
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return ((a = (a + q + x + t) << s | a + q + x + t >>> 32 - s) + b) | 0
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn(b & c | ~b & d, a, b, x, s, t) }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn(b & d | c & ~d, a, b, x, s, t) }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn(b ^ c ^ d, a, b, x, s, t) }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number { return cmn(c ^ (b | ~d), a, b, x, s, t) }
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0xff)
  const len = bytes.length; bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const lo = len * 8
  bytes.push(lo & 0xff, (lo >>> 8) & 0xff, (lo >>> 16) & 0xff, (lo >>> 24) & 0xff)
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476
  for (let i = 0; i < bytes.length; i += 64) {
    const x: number[] = []
    for (let j = 0; j < 64; j += 4)
      x.push(bytes[i + j] | bytes[i + j + 1] << 8 | bytes[i + j + 2] << 16 | bytes[i + j + 3] << 24)
    const [aa, bb, cc, dd] = [a, b, c, d]
    a = ff(a, b, c, d, x[0], 7, 0xd76aa478); d = ff(d, a, b, c, x[1], 12, 0xe8c7b756)
    c = ff(c, d, a, b, x[2], 17, 0x242070db); b = ff(b, c, d, a, x[3], 22, 0xc1bdceee)
    a = ff(a, b, c, d, x[4], 7, 0xf57c0faf); d = ff(d, a, b, c, x[5], 12, 0x4787c62a)
    c = ff(c, d, a, b, x[6], 17, 0xa8304613); b = ff(b, c, d, a, x[7], 22, 0xfd469501)
    a = ff(a, b, c, d, x[8], 7, 0x698098d8); d = ff(d, a, b, c, x[9], 12, 0x8b44f7af)
    c = ff(c, d, a, b, x[10], 17, 0xffff5bb1); b = ff(b, c, d, a, x[11], 22, 0x895cd7be)
    a = ff(a, b, c, d, x[12], 7, 0x6b901122); d = ff(d, a, b, c, x[13], 12, 0xfd987193)
    c = ff(c, d, a, b, x[14], 17, 0xa679438e); b = ff(b, c, d, a, x[15], 22, 0x49b40821)
    a = gg(a, b, c, d, x[1], 5, 0xf61e2562); d = gg(d, a, b, c, x[6], 9, 0xc040b340)
    c = gg(c, d, a, b, x[11], 14, 0x265e5a51); b = gg(b, c, d, a, x[0], 20, 0xe9b6c7aa)
    a = gg(a, b, c, d, x[5], 5, 0xd62f105d); d = gg(d, a, b, c, x[10], 9, 0x02441453)
    c = gg(c, d, a, b, x[15], 14, 0xd8a1e681); b = gg(b, c, d, a, x[4], 20, 0xe7d3fbc8)
    a = gg(a, b, c, d, x[9], 5, 0x21e1cde6); d = gg(d, a, b, c, x[14], 9, 0xc33707d6)
    c = gg(c, d, a, b, x[3], 14, 0xf4d50d87); b = gg(b, c, d, a, x[8], 20, 0x455a14ed)
    a = gg(a, b, c, d, x[13], 5, 0xa9e3e905); d = gg(d, a, b, c, x[2], 9, 0xfcefa3f8)
    c = gg(c, d, a, b, x[7], 14, 0x676f02d9); b = gg(b, c, d, a, x[12], 20, 0x8d2a4c8a)
    a = hh(a, b, c, d, x[5], 4, 0xfffa3942); d = hh(d, a, b, c, x[8], 11, 0x8771f681)
    c = hh(c, d, a, b, x[11], 16, 0x6d9d6122); b = hh(b, c, d, a, x[14], 23, 0xfde5380c)
    a = hh(a, b, c, d, x[1], 4, 0xa4beea44); d = hh(d, a, b, c, x[4], 11, 0x4bdecfa9)
    c = hh(c, d, a, b, x[7], 16, 0xf6bb4b60); b = hh(b, c, d, a, x[10], 23, 0xbebfbc70)
    a = hh(a, b, c, d, x[13], 4, 0x289b7ec6); d = hh(d, a, b, c, x[0], 11, 0xeaa127fa)
    c = hh(c, d, a, b, x[3], 16, 0xd4ef3085); b = hh(b, c, d, a, x[6], 23, 0x04881d05)
    a = hh(a, b, c, d, x[9], 4, 0xd9d4d039); d = hh(d, a, b, c, x[12], 11, 0xe6db99e5)
    c = hh(c, d, a, b, x[15], 16, 0x1fa27cf8); b = hh(b, c, d, a, x[2], 23, 0xc4ac5665)
    a = ii(a, b, c, d, x[0], 6, 0xf4292244); d = ii(d, a, b, c, x[7], 10, 0x432aff97)
    c = ii(c, d, a, b, x[14], 15, 0xab9423a7); b = ii(b, c, d, a, x[5], 21, 0xfc93a039)
    a = ii(a, b, c, d, x[12], 6, 0x655b59c3); d = ii(d, a, b, c, x[3], 10, 0x8f0ccc92)
    c = ii(c, d, a, b, x[10], 15, 0xffeff47d); b = ii(b, c, d, a, x[1], 21, 0x85845dd1)
    a = ii(a, b, c, d, x[8], 6, 0x6fa87e4f); d = ii(d, a, b, c, x[15], 10, 0xfe2ce6e0)
    c = ii(c, d, a, b, x[6], 15, 0xa3014314); b = ii(b, c, d, a, x[13], 21, 0x4e0811a1)
    a = ii(a, b, c, d, x[4], 6, 0xf7537e82); d = ii(d, a, b, c, x[11], 10, 0xbd3af235)
    c = ii(c, d, a, b, x[2], 15, 0x2ad7d2bb); b = ii(b, c, d, a, x[9], 21, 0xeb86d391)
    a = (a + aa) | 0; b = (b + bb) | 0; c = (c + cc) | 0; d = (d + dd) | 0
  }
  const toHex = (n: number) => ((n >>> 0).toString(16).length < 2 ? '0' : '') + (n >>> 0).toString(16)
  return toHex(a) + toHex(b) + toHex(c) + toHex(d)
}

interface EpisodeListProps {
  series: SeriesInfo
  metadata?: any
  onPlay: (ep: EpisodeInfo, index: number) => void
  onClose: () => void
  episodesProgress?: Record<string, { position: number; completed: number }>
}

const STATUS_OPTIONS = [
  { key: 'watching', label: '在看', color: 'text-sky-400 border-sky-400/30' },
  { key: 'completed', label: '已追完', color: 'text-green-400 border-green-400/30' },
  { key: 'dropped', label: '弃番', color: 'text-neutral-500 border-neutral-500/30' },
]

// 1-5 星评分组件
function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(rating / 2)  // AniList 0-100 → 1-5
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24"
          fill={i <= stars ? '#E8B86D' : 'none'}
          stroke={i <= stars ? '#E8B86D' : '#8B8579'} strokeWidth="1.5"
        >
          <polygon points="12,2 15.1,8.3 22,9.3 17,14.1 18.2,21.1 12,17.8 5.8,21.1 7,14.1 2,9.3 8.9,8.3" />
        </svg>
      ))}
    </span>
  )
}

export default function EpisodeList({ series, metadata, onPlay, onClose, episodesProgress = {} }: EpisodeListProps) {
  const [status, setStatus] = useState('watching')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(series.title)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.getSeriesProgress(series.folderPath).then(progress => {
      if (cancelled) return
      if (progress.watched >= progress.total && progress.total > 0) setStatus('completed')
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [series.folderPath])

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus)
    window.electronAPI.setSeriesStatus(series.folderPath, newStatus)
  }

  const coverUrl = series.coverPath
    ? window.electronAPI.getCoverUrl(series.coverPath)
    : metadata?.coverUrl || null

  // 标题优先：Bangumi中文 > 文件夹名 > AniList romaji
  const metaCn = metadata?.titleCn
  const hasChinese = metaCn && /[\u4e00-\u9fff]/.test(metaCn)
  const displayTitle = hasChinese ? metaCn : (series.title || metadata?.titleEn || metadata?.title || '')

  return (
    <div className="flex flex-col h-full bg-anibox-bg">
      {/* 头部导航 */}
      <div className="flex items-center gap-3 px-4 py-2 bg-anibox-surface border-b border-anibox-border shrink-0">
        <button onClick={onClose} className="text-anibox-text-muted hover:text-anibox-text" title="返回海报墙">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input type="text" value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={async () => { setEditing(false); if (editTitle.trim() && editTitle !== series.title) { await window.electronAPI.updateTitle(series.folderPath, editTitle.trim()); series.title = editTitle.trim() } }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setEditTitle(series.title); setEditing(false) } }}
              autoFocus className="text-sm font-semibold bg-anibox-surface border border-anibox-accent rounded px-1 py-0 text-anibox-text outline-none w-full"
            />
          ) : (
            <div className="flex items-center gap-1">
              <h2 className="text-sm font-semibold text-anibox-text truncate">{series.title}</h2>
              <button onClick={() => { setEditTitle(series.title); setEditing(true) }}
                className="text-anibox-text-muted hover:text-anibox-accent shrink-0" title="编辑标题">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {!loading && (
          <div className="flex gap-0.5">
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => handleStatusChange(opt.key)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${status === opt.key ? `${opt.color} bg-white/5` : 'text-anibox-text-muted border-transparent hover:border-anibox-text-muted'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ===== 元数据面板（上半部） ===== */}
      <div className="shrink-0 border-b border-anibox-border/50">
        <div className="flex gap-4 p-4">
          {/* 封面 */}
          <div className="w-24 h-36 rounded-lg bg-anibox-surface border border-anibox-border overflow-hidden shrink-0">
            {coverUrl ? (
              <img src={coverUrl} alt={displayTitle} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-2" style={{ backgroundColor: '#DCDED6' }}>
                <span className="text-[10px] font-semibold text-center leading-snug select-none" style={{ color: '#6B6D66' }}>
                  {displayTitle}
                </span>
              </div>
            )}
          </div>

          {/* 信息区 */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <h2 className="text-sm font-semibold text-anibox-text leading-tight">{displayTitle}</h2>
            {metadata?.titleEn && metadata.titleEn !== displayTitle && (
              <p className="text-[11px] text-anibox-text-muted">{metadata.titleEn}</p>
            )}

            {/* 评分 + 年份 + 季号 */}
            <div className="flex items-center gap-3 flex-wrap">
              {metadata?.rating > 0 && (
                <span className="flex items-center gap-1">
                  <StarRating rating={metadata.rating} />
                  <span className="text-xs text-anibox-text font-medium">{(metadata.rating / 10).toFixed(1)}</span>
                </span>
              )}
              {metadata?.year > 0 && (
                <span className="text-[11px] text-anibox-text-muted">{metadata.year}</span>
              )}
              {metadata?.season && (
                <span className="text-[11px] text-anibox-text-muted">{metadata.season}</span>
              )}
              <span className="text-[11px] text-anibox-text-muted">
                {series.season > 1 ? `第${series.season}季 · ` : ''}{series.episodes.length}话
              </span>
            </div>

            {/* 类型标签 */}
            {metadata?.genres?.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {metadata.genres.slice(0, 5).map((g: string) => (
                  <span key={g} className="text-[10px] px-1.5 py-0.5 bg-anibox-accent/10 text-anibox-accent rounded border border-anibox-accent/20">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* 工作室 */}
            {metadata?.studio && (
              <p className="text-[11px] text-anibox-text-muted">
                <span className="text-anibox-text-muted/60">制作：</span>{metadata.studio}
              </p>
            )}

            {/* Staff */}
            {metadata?.staff?.length > 0 && (
              <div className="flex gap-3 flex-wrap">
                {metadata.staff.slice(0, 4).map((s: { role: string; name: string }) => (
                  <span key={s.role + s.name} className="text-[10px] text-anibox-text-muted">
                    <span className="text-anibox-text-muted/60">{s.role}：</span>{s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 简介 */}
        {metadata?.synopsis && (
          <div className="px-4 pb-3">
            <p className="text-[11px] text-anibox-text-muted leading-relaxed line-clamp-3">
              {metadata.synopsis}
            </p>
          </div>
        )}
      </div>

      {/* ===== 选集（下半部） ===== */}
      <div className="px-3 py-1.5 border-b border-anibox-border/30 shrink-0">
        <span className="text-[11px] text-anibox-text-muted">选集</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
          {series.episodes.map((ep, i) => {
            const epHash = md5(ep.filePath)
            const progress = episodesProgress[epHash]
            const isCompleted = progress?.completed === 1
            const isWatching = progress && !isCompleted && progress.position > 0

            return (
            <button key={ep.filePath} onClick={() => onPlay(ep, i)}
              className={`aspect-square rounded-lg border transition-colors flex flex-col items-center justify-center gap-0.5 group relative overflow-hidden
                ${isCompleted ? 'bg-green-500/10 border-green-500/30'
                  : isWatching ? 'bg-anibox-accent/10 border-anibox-accent/30'
                  : 'bg-anibox-surface border-anibox-border hover:border-anibox-accent hover:bg-anibox-accent/10'
                }`}
              title={ep.fileName}
            >
              {isWatching && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-anibox-border">
                  <div className="h-full bg-anibox-accent transition-all" style={{ width: '50%' }} />
                </div>
              )}
              <span className={`text-lg font-semibold ${isCompleted ? 'text-green-400' : isWatching ? 'text-anibox-accent' : 'text-anibox-text group-hover:text-anibox-accent'}`}>
                {ep.epNumber || '?'}
              </span>
              <span className="text-[10px] text-anibox-text-muted">{isCompleted ? '✓' : '话'}</span>
            </button>
            )
          })}
        </div>
        {series.episodes.length === 0 && (
          <div className="flex items-center justify-center h-40 text-anibox-text-muted text-sm">
            未找到视频文件
          </div>
        )}
      </div>
    </div>
  )
}
