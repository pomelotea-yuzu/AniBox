/**
 * bangumi-index.ts — Bangumi 官方 dump 裁剪索引的本地查表（零在线请求）
 *
 * 数据来源：数据仓库（Gitee ani-box-data），由 scripts/gen_index.py 从
 * bangumi/Archive 官方 subject.jsonlines 裁剪生成：
 *   core.json.gz     主索引（标题/中文标题/日期/话数/评分/标签/Staff）
 *   summary.json.gz  中文简介（{ bangumiId: text }，按需加载）
 *   version.json     dump 日期 / 条目数 / sha256
 *
 * 目录：userData/anibox-index/；缺失时静默返回 null，回退在线链路。
 * 条目字段：i=bgmId n=原名 c=中文名 d=日期 e=话数 s=评分 r=排名
 *           t=标签 m=meta_tags b=infobox(中文键) u=简介(在 summary)
 */
import { join } from 'path'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'fs'
import { gunzipSync } from 'zlib'
import { createHash } from 'crypto'
import { levenshtein } from './utils'
import type { AnimeMetadata, StaffInfo } from './metadata-fetcher'

// ============================================================
//  类型
// ============================================================

interface IndexEntry {
  i: number // bangumi id
  n: string // 原名（日文）
  c: string // 中文名
  d: string // 放送日期 "2023-09-29"
  e: string // 话数
  s: number // 评分 0-10
  r: number // 排名
  t: string[] // 标签
  m: string[] // meta 标签
  b: Record<string, string> // infobox 中文键（动画制作公司/导演/原作…）
}

export interface IndexVersion {
  dumpDate: string
  generatedAt?: string
  entries: number
  files?: Record<string, { name: string; sha256: string; size: number; rawSize: number }>
}

// ============================================================
//  索引目录与缓存
// ============================================================

let indexDirOverride: string | null = null
let cachedEntries: IndexEntry[] | null = null
let cachedSummaries: Record<string, string> | null = null
let cachedVersion: IndexVersion | null = null

/** 测试 / 开发期可重定向索引目录 */
export function setIndexDir(dir: string): void {
  indexDirOverride = dir
  resetIndexCache()
}

export function resetIndexCache(): void {
  cachedEntries = null
  cachedSummaries = null
  cachedVersion = null
}

async function resolveIndexDir(): Promise<string> {
  if (indexDirOverride) return indexDirOverride
  try {
    const electron: any = await import('electron')
    const app = electron?.app || electron?.default?.app
    if (app && typeof app.getPath === 'function') {
      return join(app.getPath('userData'), 'anibox-index')
    }
  } catch {
    /* 非 Electron 环境（vitest 等） */
  }
  return join(process.cwd(), 'anibox-index')
}

// ============================================================
//  加载
// ============================================================

async function ensureLoaded(): Promise<boolean> {
  if (cachedEntries) return true
  const dir = await resolveIndexDir()
  const corePath = join(dir, 'core.json.gz')
  if (!existsSync(corePath)) return false
  try {
    const raw = gunzipSync(readFileSync(corePath))
    cachedEntries = JSON.parse(raw.toString('utf-8')) as IndexEntry[]
    buildSearchStructures(cachedEntries)
  } catch (err: any) {
    console.warn('[AniBox] 本地索引 core.json.gz 解析失败:', err?.message || err)
    cachedEntries = null
    return false
  }
  try {
    const vPath = join(dir, 'version.json')
    if (existsSync(vPath)) cachedVersion = JSON.parse(readFileSync(vPath, 'utf-8'))
  } catch {
    cachedVersion = null
  }
  console.log(
    `[AniBox] 本地索引已加载: ${cachedEntries.length} 条 (dump ${cachedVersion?.dumpDate || '未知日期'})`,
  )
  return true
}

async function ensureSummaries(): Promise<Record<string, string>> {
  if (cachedSummaries) return cachedSummaries
  const dir = await resolveIndexDir()
  const p = join(dir, 'summary.json.gz')
  if (!existsSync(p)) {
    cachedSummaries = {}
    return cachedSummaries
  }
  try {
    const raw = gunzipSync(readFileSync(p))
    cachedSummaries = JSON.parse(raw.toString('utf-8'))
  } catch (err: any) {
    console.warn('[AniBox] summary.json.gz 解析失败:', err?.message || err)
    cachedSummaries = {}
  }
  return cachedSummaries!
}

// ============================================================
//  标题归一化与搜索结构
// ============================================================

/** 全角→半角、去空白与标点、小写 */
export function normTitle(s: string): string {
  if (!s) return ''
  let t = s.toLowerCase()
  t = t.replace(/\u3000/g, ' ')
  t = t.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  t = t.replace(/[\s_\-·・〜~～'’"“”:.。,，!！?？/\\()（）[\]【】「」『』<>《》]+/g, '')
  return t
}

const SEASON_SUFFIXES = [
  /\s*第\s*[0-9一二三四五六七八九十百]+\s*季\s*$/i,
  /\s*season\s*\d+\s*$/i,
  /\s*\bS\s*\d{1,2}\s*$/i,
  /\s*[（(]\s*第?\s*[0-9一二三四五六七八九十]+\s*季\s*[)）]\s*$/i,
]

/** 去掉标题末尾的季号（第X季 / Season N / SN / （第X季）） */
export function stripSeasonSuffix(title: string): string {
  let out = title
  for (const p of SEASON_SUFFIXES) out = out.replace(p, '')
  return out.trim()
}

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

/** 解析标题中的季号（第X季 / Season N / SX），无则 0 */
export function parseSeasonNum(title: string): number {
  const m1 = title.match(/第\s*([0-9一二三四五六七八九十]+)\s*季/)
  if (m1) {
    const raw = m1[1]
    if (/^\d+$/.test(raw)) return parseInt(raw, 10)
    // 简单中文数字（十一~九十九粗略支持）
    if (raw.length === 1) return CN_NUM[raw] || 0
    if (raw.startsWith('十')) return 10 + (CN_NUM[raw[1]] || 0)
    if (raw.endsWith('十')) return (CN_NUM[raw[0]] || 0) * 10
    const tenIdx = raw.indexOf('十')
    if (tenIdx > 0 && tenIdx < raw.length - 1) {
      return (CN_NUM[raw[tenIdx - 1]] || 0) * 10 + (CN_NUM[raw[tenIdx + 1]] || 0)
    }
  }
  const m2 = title.match(/Season\s*(\d+)/i)
  if (m2) return parseInt(m2[1], 10)
  return 0
}

let exactMap: Map<string, IndexEntry> = null!
let entryKeys: Array<{ entry: IndexEntry; keys: string[] }> = []

function betterRank(a: IndexEntry, b: IndexEntry): IndexEntry {
  const ra = a.r > 0 ? a.r : Number.MAX_SAFE_INTEGER
  const rb = b.r > 0 ? b.r : Number.MAX_SAFE_INTEGER
  if (ra !== rb) return ra < rb ? a : b
  return a.s >= b.s ? a : b
}

function buildSearchStructures(entries: IndexEntry[]): void {
  exactMap = new Map()
  entryKeys = []
  for (const e of entries) {
    const keys = new Set<string>()
    for (const k of [normTitle(e.n), normTitle(e.c)]) if (k && k.length >= 2) keys.add(k)
    // 别名/其他名称 拆分补充（提升中文别名命中率）
    for (const aliasKey of ['别名', '其他名称']) {
      const v = e.b?.[aliasKey]
      if (v && !v.startsWith('{')) {
        for (const piece of v.split(/[、;；,，]/)) {
          const k = normTitle(piece)
          if (k && k.length >= 2) keys.add(k)
        }
      }
    }
    if (!keys.size) continue
    const list = [...keys]
    entryKeys.push({ entry: e, keys: list })
    for (const k of list) {
      const prev = exactMap.get(k)
      exactMap.set(k, prev ? betterRank(prev, e) : e)
    }
  }
}

/** 标题是否带与 seasonNum 一致的季标记（用于多候选时优先） */
function hasSeasonMarker(entry: IndexEntry, seasonNum: number): boolean {
  if (!seasonNum) return false
  const hay = `${entry.n} ${entry.c}`
  return (
    new RegExp(`第\\s*${seasonNum}\\s*季`).test(hay) ||
    new RegExp(`Season\\s*${seasonNum}`, 'i').test(hay) ||
    new RegExp(`^${seasonNum}期|第${seasonNum}期`).test(hay)
  )
}

/**
 * 单查询匹配：精确 → 包含 → Levenshtein 三级
 * @returns 命中条目或 null
 */
function matchEntry(query: string, seasonNum: number): IndexEntry | null {
  const q = normTitle(query)
  if (!q || q.length < 2) return null

  // 1) 精确
  const exact = exactMap.get(q)
  if (exact) return exact

  // 2) 包含（双向），长度差越大扣分越多；短查询（<3 字符）要求前缀
  let best: IndexEntry | null = null
  let bestScore = Infinity
  for (const { entry, keys } of entryKeys) {
    for (const k of keys) {
      if (k === q) return entry
      const ok =
        q.length >= 3
          ? k.includes(q) || q.includes(k)
          : k.startsWith(q) || q.startsWith(k)
      if (!ok) continue
      const lenDiff = Math.abs(k.length - q.length) / Math.max(k.length, q.length)
      let score = lenDiff
      if (hasSeasonMarker(entry, seasonNum)) score -= 0.2
      if (score < bestScore) {
        bestScore = score
        best = entry
      }
      break
    }
  }
  if (best && bestScore < 0.6) return best

  // 3) Levenshtein 模糊（先按长度差剪枝）
  best = null
  bestScore = Infinity
  for (const { entry, keys } of entryKeys) {
    for (const k of keys) {
      if (Math.abs(k.length - q.length) > Math.max(k.length, q.length) * 0.45) continue
      const dist = levenshtein(q, k)
      let score = dist / Math.max(k.length, q.length)
      if (hasSeasonMarker(entry, seasonNum)) score -= 0.05
      if (score < bestScore) {
        bestScore = score
        best = entry
      }
    }
  }
  return best && bestScore < 0.4 ? best : null
}

// ============================================================
//  条目 → AnimeMetadata
// ============================================================

const META_TAG_SET = new Set([
  'TV', 'OVA', '剧场版', 'WEB', '小说改', '漫画改', '游戏改', '原创',
  '新番', '日本', '中国', '动画',
])

const STAFF_KEYS = ['导演', '原作', '系列构成', '脚本', '音乐', '人物设定', '机械设定']

function seasonLabelOf(date: string): string {
  const y = parseInt(date?.slice(0, 4), 10) || 0
  const m = parseInt(date?.slice(5, 7), 10) || 0
  if (!y) return ''
  const s =
    m === 0 ? '' : m <= 2 || m === 12 ? '冬季' : m <= 5 ? '春季' : m <= 8 ? '夏季' : '秋季'
  return s ? `${y}年${s}` : `${y}年`
}

async function entryToMetadata(entry: IndexEntry): Promise<AnimeMetadata> {
  const summaries = await ensureSummaries()
  const staff: StaffInfo[] = []
  for (const role of STAFF_KEYS) {
    const v = entry.b?.[role]
    if (!v || v.startsWith('{')) continue
    for (const name of v.split(/[、;；]/)) {
      const trimmed = name.trim()
      if (trimmed) staff.push({ role, name: trimmed })
    }
  }

  const genres = (entry.t || []).filter((t) => t && !META_TAG_SET.has(t)).slice(0, 8)
  const episodes = parseInt(String(entry.e ?? ''), 10) || 0

  return {
    title: entry.n || entry.c || '',
    titleCn: entry.c || '',
    titleEn: '',
    synopsis: summaries[String(entry.i)] || '',
    rating: entry.s || 0,
    genres: genres.length > 0 ? genres : ['动画'],
    year: parseInt(entry.d?.slice(0, 4), 10) || 0,
    season: seasonLabelOf(entry.d),
    episodes,
    studio: entry.b?.['动画制作公司'] || entry.b?.['动画制作'] || '',
    staff,
    coverUrl: '', // dump 无封面 → 由调用方 ffmpeg 本地抽帧兜底
    anilistId: 0,
    bangumiId: entry.i,
  }
}

// ============================================================
//  对外：本地查表
// ============================================================

/**
 * 本地索引查表：标题 → AnimeMetadata。
 * 依次尝试去季号标题与原始标题；未加载索引或未命中返回 null。
 */
export async function lookupLocalMetadata(
  title: string,
  _season?: number,
): Promise<AnimeMetadata | null> {
  if (!title) return null
  try {
    if (!(await ensureLoaded())) return null
  } catch (err: any) {
    console.warn('[AniBox] 本地索引加载失败:', err?.message || err)
    return null
  }

  const seasonNum = parseSeasonNum(title)
  const stripped = stripSeasonSuffix(title)
  const queries = [...new Set([stripped, title].filter((q) => q && q.trim()))]

  for (const q of queries) {
    const entry = matchEntry(q, seasonNum)
    if (entry) {
      const meta = await entryToMetadata(entry)
      console.log(
        `[AniBox] 本地索引命中: ${meta.titleCn || meta.title} (bangumiId=${meta.bangumiId}, query="${q}")`,
      )
      return meta
    }
  }
  return null
}

/** 本地索引原始条目信息（封面匹配用：中文名/别名/放送日期） */
export interface LocalIndexHit {
  bangumiId: number
  titleCn: string
  title: string
  date: string
  aliases: string[]
}

export async function lookupLocalEntryRaw(
  title: string,
  _season?: number,
): Promise<LocalIndexHit | null> {
  if (!title) return null
  try {
    if (!(await ensureLoaded())) return null
  } catch (err: any) {
    return null
  }

  const seasonNum = parseSeasonNum(title)
  const stripped = stripSeasonSuffix(title)
  const queries = [...new Set([stripped, title].filter((q) => q && q.trim()))]

  for (const q of queries) {
    const entry = matchEntry(q, seasonNum)
    if (entry) {
      const aliases: string[] = []
      for (const aliasKey of ['别名', '其他名称']) {
        const v = entry.b?.[aliasKey]
        if (v && !v.startsWith('{')) {
          for (const piece of v.split(/[、;；,，]/)) {
            const trimmed = piece.trim()
            if (trimmed) aliases.push(trimmed)
          }
        }
      }
      return {
        bangumiId: entry.i,
        titleCn: entry.c || '',
        title: entry.n || '',
        date: entry.d || '',
        aliases,
      }
    }
  }
  return null
}

// ============================================================
//  对外：新番时间表（本地索引按季度筛选，零在线/零翻译）
// ============================================================

const WEEKDAY_MAP: Record<string, number> = {
  星期日: 0, 星期天: 0, 星期一: 1, 星期二: 2, 星期三: 3, 星期四: 4, 星期五: 5, 星期六: 6,
  周日: 0, 周天: 0, 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6,
}

/** 与渲染端 SeasonCalendar 的 AnimeItem 形状一致（附加 weekday） */
export interface SeasonTimelineItem {
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
  nextAiring: null
  weekday: number
}

function parseCnDate(s?: string): { year: number; month: number; day: number } | null {
  if (!s) return null
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return { year: +iso[1], month: +iso[2], day: +iso[3] }
  const cn = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (cn) return { year: +cn[1], month: +cn[2], day: +cn[3] }
  return null
}

function weekdayOf(entry: IndexEntry): number {
  const v = entry.b?.['放送星期'] || ''
  for (const k of Object.keys(WEEKDAY_MAP)) {
    if (v.includes(k)) return WEEKDAY_MAP[k]
  }
  return -1
}

/**
 * 当前季度新番（按放送日期筛选本地索引，TV 类型，rank 排序）。
 * 标题/简介全中文，无需 AI 翻译；封面由调用方经 yuc.wiki 补充。
 */
export async function buildLocalSeasonTimeline(now = new Date()): Promise<{
  season: string
  anime: SeasonTimelineItem[]
} | null> {
  try {
    if (!(await ensureLoaded())) return null
  } catch {
    return null
  }
  const entries = cachedEntries!
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const se = m >= 4 && m <= 6 ? 'SPRING' : m >= 7 && m <= 9 ? 'SUMMER' : m >= 10 && m <= 12 ? 'FALL' : 'WINTER'
  const qStartMonth = se === 'WINTER' ? 1 : se === 'SPRING' ? 4 : se === 'SUMMER' ? 7 : 10
  const start = `${y}-${String(qStartMonth).padStart(2, '0')}-01`
  const nm = qStartMonth + 3
  const nextStart = `${nm > 12 ? y + 1 : y}-${String(nm > 12 ? nm - 12 : nm).padStart(2, '0')}-01`

  const pool = entries.filter((e) => {
    if (!e.d || e.d < start || e.d >= nextStart) return false
    if (!e.m?.length || !e.m.includes('TV')) return false
    return true
  })
  pool.sort((a, b) => {
    const ra = a.r > 0 ? a.r : Number.MAX_SAFE_INTEGER
    const rb = b.r > 0 ? b.r : Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return (b.s || 0) - (a.s || 0)
  })

  const summaries = await ensureSummaries()
  const anime: SeasonTimelineItem[] = pool.slice(0, 70).map((e) => {
    const studio = e.b?.['动画制作公司'] || e.b?.['动画制作'] || ''
    const desc = summaries[String(e.i)] || ''
    return {
      id: e.i,
      title: e.n || e.c || '',
      titleRomaji: '',
      titleEnglish: '',
      titleZh: e.c || e.n || '',
      cover: '',
      coverExtra: '',
      bannerImage: '',
      description: desc,
      descriptionZh: desc,
      episodes: parseInt(String(e.e ?? ''), 10) || null,
      duration: null,
      score: e.s ? Math.round(e.s * 10) : null, // UI 约定 0-100（显示时 /10）
      popularity: null,
      genres: (e.t || []).filter((t) => t && !META_TAG_SET.has(t)).slice(0, 6),
      studios: studio ? [studio] : [],
      startDate: parseCnDate(e.d),
      endDate: parseCnDate(e.b?.['播放结束']),
      season: se,
      seasonYear: y,
      format: 'TV',
      status: 'RELEASING',
      nextAiring: null,
      weekday: weekdayOf(e),
    }
  })
  return { season: `${se} ${y}`, anime }
}

/** 索引状态（设置页/调试用） */
export async function getIndexStatus(): Promise<{
  available: boolean
  indexDir: string
  dumpDate?: string
  entries?: number
}> {
  const dir = await resolveIndexDir()
  await ensureLoaded()
  return {
    available: !!cachedEntries,
    indexDir: dir,
    dumpDate: cachedVersion?.dumpDate,
    entries: cachedVersion?.entries,
  }
}

// ============================================================
//  对外：索引更新（Gitee raw + sha256 校验 + 原子替换）
// ============================================================

const DATA_RAW_BASE = 'https://gitee.com/yuzu-tea-duck/ani-box-data/raw/main'
const INDEX_UA = 'AniBox/1.2 (anibox local metadata index updater)'

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function fetchRemoteVersion(): Promise<IndexVersion> {
  const url = `${DATA_RAW_BASE}/version.json?t=${Date.now()}`
  const res = await fetch(url, { headers: { 'User-Agent': INDEX_UA } })
  if (!res.ok) throw new Error(`version.json 下载失败: HTTP ${res.status}`)
  const data = (await res.json()) as IndexVersion | null
  if (!data?.dumpDate || !data?.entries) throw new Error('version.json 格式异常')
  return data
}

async function downloadGz(
  filename: string,
  dest: string,
  onProgress?: (stage: string, received: number, total: number) => void,
): Promise<Buffer> {
  const url = `${DATA_RAW_BASE}/${filename}?t=${Date.now()}`
  const res = await fetch(url, { headers: { 'User-Agent': INDEX_UA } })
  if (!res.ok) throw new Error(`${filename} 下载失败: HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length') || 0)
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(dest, buf)
    return buf
  }
  const chunks: Buffer[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    received += value.length
    onProgress?.(filename, received, total)
  }
  const buf = Buffer.concat(chunks)
  writeFileSync(dest, buf)
  return buf
}

/** 检查远端是否有新版本 */
export async function checkIndexUpdate(): Promise<{
  ok: boolean
  upToDate?: boolean
  local?: IndexVersion | null
  remote?: IndexVersion
  indexDir?: string
  error?: string
}> {
  try {
    const dir = await resolveIndexDir()
    await ensureLoaded()
    const remote = await fetchRemoteVersion()
    const local = cachedVersion
    const upToDate =
      !!local && local.dumpDate === remote.dumpDate && local.entries === remote.entries
    return upToDate
      ? { ok: true, upToDate, local: local!, remote }
      : { ok: true, upToDate: false, local: local ?? undefined, remote, indexDir: dir }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * 从数据仓库下载索引并原子替换本地文件。
 * 流程：version.json → core/summary 下载到 *.tmp → sha256 校验 → rename 覆盖。
 */
export async function updateIndexFromRemote(onProgress?: (stage: string, received: number, total: number) => void): Promise<{
  ok: boolean
  version?: IndexVersion
  error?: string
}> {
  const dir = await resolveIndexDir()
  const tmpFiles: string[] = []
  try {
    mkdirSync(dir, { recursive: true })
    const remote = await fetchRemoteVersion()
    const files = remote.files || {}
    if (!files.core?.sha256) throw new Error('version.json 缺少 core 校验信息')

    // 下载 + 校验（不覆盖旧文件，全通过后再原子替换）
    const downloaded: Array<{ final: string; tmp: string; buf: Buffer; sha: string }> = []
    for (const key of ['core', 'summary'] as const) {
      const info = files[key]
      if (!info) continue // summary 缺失时允许只更新 core
      const tmp = join(dir, `${info.name}.tmp`)
      tmpFiles.push(tmp)
      const buf = await downloadGz(info.name, tmp, onProgress)
      const actual = sha256Hex(buf)
      if (actual !== info.sha256) {
        throw new Error(`${info.name} sha256 校验失败（期望 ${info.sha256.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`)
      }
      downloaded.push({ final: join(dir, info.name), tmp, buf, sha: actual })
    }
    if (!downloaded.length) throw new Error('远端无可下载数据文件')

    // 原子替换
    for (const d of downloaded) renameSync(d.tmp, d.final)
    tmpFiles.length = 0
    const versionTmp = join(dir, 'version.json.tmp')
    writeFileSync(versionTmp, JSON.stringify(remote, null, 2), 'utf-8')
    renameSync(versionTmp, join(dir, 'version.json'))

    resetIndexCache()
    console.log(`[AniBox] 索引已更新: dump ${remote.dumpDate}，${remote.entries} 条`)
    return { ok: true, version: remote }
  } catch (err: any) {
    // 清理残留 tmp
    for (const t of tmpFiles) {
      try {
        unlinkSync(t)
      } catch {
        /* ignore */
      }
    }
    return { ok: false, error: err?.message || String(err) }
  }
}
