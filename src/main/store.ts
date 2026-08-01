import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'

import { hashPath } from './utils'

const STORE_PATH = join(app.getPath('userData'), 'anibox-store.json')

interface EpisodeRecord {
  id: string          // hash(filePath)
  seriesId: string    // hash(folderPath)
  epNumber: number
  fileName: string
  filePath: string
}

interface StoreData {
  series: Record<string, {
    id: string
    title: string
    folderPath: string
    season: number
    totalEps: number
    status: string
    addedAt: string
    seriesType: string     // tv | ova | movie | special
    coverPath?: string
  }>
  episodes: Record<string, EpisodeRecord>
  progress: Record<string, {
    position: number
    completed: number
    updatedAt: string
  }>
  skipTimes: Record<string, {   // key = seriesId
    opStart: number    // OP 开始时间（秒）
    opEnd: number      // OP 结束时间（秒）
    edStart: number    // ED 开始时间（秒）
    edEnd: number      // ED 结束时间（秒）
  }>
  metadata: Record<string, {   // key = seriesId
    title: string
    titleCn: string
    titleEn: string
    synopsis: string
    rating: number
    genres: string[]
    year: number
    season: string
    episodes: number
    studio: string
    staff: Array<{ role: string; name: string }>
    coverUrl: string
    anilistId: number
    bangumiId: number
  }>
  /** 音轨偏好：key = seriesId */
  audioPrefs: Record<string, {
    audioIndex: number       // 选择的音轨索引
    audioDelay: number       // 音频延迟（毫秒）
    language?: string        // 偏好音轨语言
  }>
  /** 字幕样式设置（全局） */
  subtitleStyle: {
    fontSize: number         // 字体大小(px)，默认 24
    fontFamily: string       // 字体族
    textColor: string        // 主字幕文字颜色 (#RRGGBB)
    strokeColor: string      // 描边颜色
    strokeWidth: number      // 描边宽度(px)
    bgColor: string          // 背景颜色（带透明度）
    position: 'bottom' | 'top'  // 字幕位置
    secondaryFontSize: number   // 第二字幕字体大小
    dualSubtitleGap: number     // 双语字幕间距(px)
  }
  /** 收藏的系列 ID 列表 */
  favorites: string[]
  /** 播放列表 */
  playlists: Array<{
    id: string; name: string; seriesIds: string[]; createdAt: string
  }>
  /** 扫描根目录列表（多根扫描） */
  scanRoots: string[]
}

let data: StoreData = {
  series: {}, episodes: {}, progress: {}, skipTimes: {}, metadata: {},
  audioPrefs: {},
  subtitleStyle: {
    fontSize: 24,
    fontFamily: 'sans-serif',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    bgColor: 'rgba(0,0,0,0.5)',
    position: 'bottom',
    secondaryFontSize: 20,
    dualSubtitleGap: 4
  },
  favorites: [],
  playlists: [],
  scanRoots: []
}
let loaded = false
let storeReady = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false

// seriesId → episodeId[] 反向索引（内存态，不持久化）
const seriesEpIndex = new Map<string, Set<string>>()

function rebuildSeriesEpIndex(): void {
  seriesEpIndex.clear()
  for (const [epId, ep] of Object.entries(data.episodes)) {
    let set = seriesEpIndex.get(ep.seriesId)
    if (!set) { set = new Set(); seriesEpIndex.set(ep.seriesId, set) }
    set.add(epId)
  }
}

function ensureReady(): void {
  if (loaded) return
  loaded = true
  try {
    if (existsSync(STORE_PATH)) {
      const raw = JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
      data.series = raw.series || {}
      data.episodes = raw.episodes || {}
      data.progress = raw.progress || {}
      data.skipTimes = raw.skipTimes || {}
      data.metadata = raw.metadata || {}
      data.audioPrefs = raw.audioPrefs || {}
      if (raw.subtitleStyle) {
        data.subtitleStyle = { ...data.subtitleStyle, ...raw.subtitleStyle }
      }
      data.favorites = raw.favorites || []
      data.playlists = raw.playlists || []
      data.scanRoots = raw.scanRoots || []
    }
  } catch (err) {
    // JSON 损坏时备份原始文件，避免静默丢数据
    console.error('[AniBox] Store JSON corrupted:', err)
    try {
      const backupPath = STORE_PATH + '.corrupted-backup'
      const rawContent = readFileSync(STORE_PATH, 'utf-8')
      writeFileSync(backupPath, rawContent)
      console.warn('[AniBox] Corrupted store backed up to:', backupPath)
    } catch { /* 连备份都失败就没办法了 */ }
    data = {
      series: {}, episodes: {}, progress: {}, skipTimes: {}, metadata: {},
      audioPrefs: {},
      subtitleStyle: {
        fontSize: 24, fontFamily: 'sans-serif', textColor: '#FFFFFF',
        strokeColor: '#000000', strokeWidth: 2, bgColor: 'rgba(0,0,0,0.5)',
        position: 'bottom', secondaryFontSize: 20, dualSubtitleGap: 4
      },
      favorites: [], playlists: [], scanRoots: []
    }
  }
  storeReady = true
  rebuildSeriesEpIndex()
}

/** 标记脏数据，延迟批量写入（500ms debounce） */
function save(): void {
  if (!storeReady) return
  dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushNow, 500)
}

/** 强制执行挂起的写入（供应用退出前调用） */
export function flushStore(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (dirty) flushNow()
}

function flushNow(): void {
  dirty = false
  try {
    const dir = dirname(STORE_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    // 原子写入：先写临时文件，再 rename
    const tmpPath = STORE_PATH + '.tmp'
    writeFileSync(tmpPath, JSON.stringify(data, null, 2))
    // Windows 上 renameSync 会自动覆盖
    const { renameSync } = require('fs')
    renameSync(tmpPath, STORE_PATH)
  } catch (e) {
    console.error('[AniBox] Store save failed:', e)
  }
}

/** 即时写入（进度保存等高频小更新用 debounce，但时长更短） */
function saveProgressNow(): void {
  if (!storeReady) return
  dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushNow, 300)
}

// === Series ===

export function upsertSeries(id: string, title: string, folderPath: string, season: number, seriesType?: string, coverPath?: string): void {
  ensureReady()
  const existing = data.series[id]
  data.series[id] = {
    id,
    title,
    folderPath,
    season,
    totalEps: existing?.totalEps ?? 0,
    status: existing?.status ?? 'watching',
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    seriesType: seriesType || existing?.seriesType || 'tv',
    coverPath: coverPath ?? existing?.coverPath
  }
  save()
}

export function getAllSeries() {
  ensureReady()
  return Object.values(data.series)
}

export function getSeriesById(id: string) {
  ensureReady()
  return data.series[id] || null
}

export function updateSeriesStatus(id: string, status: string): void {
  ensureReady()
  if (data.series[id]) {
    data.series[id].status = status
    save()
  }
}

export function updateSeriesTotalEps(id: string, total: number): void {
  ensureReady()
  if (data.series[id]) {
    data.series[id].totalEps = total
    save()
  }
}

/** 重置所有系列和剧集数据（扫描前调用） */
export function clearAllSeriesAndEpisodes(): void {
  ensureReady()
  data.series = {}
  data.episodes = {}
  seriesEpIndex.clear()
  save()
}

// === Episodes ===

export function clearEpisodesForSeries(seriesId: string): void {
  ensureReady()
  const epIds = seriesEpIndex.get(seriesId)
  if (epIds) {
    for (const id of epIds) {
      delete data.episodes[id]
    }
    seriesEpIndex.delete(seriesId)
  }
  save()
}

export function upsertEpisode(
  id: string, seriesId: string, epNumber: number,
  filePath: string, fileName: string
): void {
  ensureReady()
  data.episodes[id] = { id, seriesId, epNumber, fileName, filePath }
  let set = seriesEpIndex.get(seriesId)
  if (!set) { set = new Set(); seriesEpIndex.set(seriesId, set) }
  set.add(id)
}

export function getEpisodesBySeries(seriesId: string): EpisodeRecord[] {
  ensureReady()
  return Object.values(data.episodes)
    .filter(e => e.seriesId === seriesId)
    .sort((a, b) => a.epNumber - b.epNumber)
}

// === Progress ===

export function saveProgress(filePath: string, position: number): void {
  ensureReady()
  const id = hashPath(filePath)
  data.progress[id] = {
    position,
    completed: position > 0 && data.progress[id]?.completed ? 1 : 0,
    updatedAt: new Date().toISOString()
  }
  saveProgressNow()
}

export function loadProgress(filePath: string): { position: number; completed: number } | null {
  ensureReady()
  const id = hashPath(filePath)
  const p = data.progress[id]
  return p ? { position: p.position, completed: p.completed } : null
}

/** 获取最近观看记录（含番剧标题、剧集文件名等上下文） */
export function getRecentProgress(limit: number = 10): Array<{
  episodeId: string
  filePath: string
  fileName: string
  epNumber: number
  seriesTitle: string
  seriesId: string
  folderPath: string
  position: number
  updatedAt: string
}> {
  ensureReady()
  const entries = Object.entries(data.progress)
    .filter(([, p]) => p.position > 0)
    .sort((a, b) => new Date(b[1].updatedAt).getTime() - new Date(a[1].updatedAt).getTime())
    .slice(0, limit)

  return entries
    .map(([episodeId, prog]) => {
      const ep = data.episodes[episodeId]
      if (!ep) return null
      const series = data.series[ep.seriesId]
      if (!series) return null
      return {
        episodeId,
        filePath: ep.filePath,
        fileName: ep.fileName,
        epNumber: ep.epNumber,
        seriesTitle: series.title,
        seriesId: series.id,
        folderPath: series.folderPath,
        position: prog.position,
        updatedAt: prog.updatedAt,
      }
    })
    .filter(Boolean) as any[]
}

export function getSeriesProgress(seriesId: string): { total: number; watched: number } {
  ensureReady()
  const eps = Object.values(data.episodes).filter(e => e.seriesId === seriesId)
  const watched = eps.filter(e => data.progress[e.id]?.completed === 1).length
  return { total: eps.length, watched }
}

// === SkipTimes (OP/ED) ===

export interface SkipTimesData {
  opStart: number
  opEnd: number
  edStart: number
  edEnd: number
}

export function getSkipTimes(seriesId: string): SkipTimesData | null {
  ensureReady()
  const st = data.skipTimes[seriesId]
  if (!st) return null
  // 兼容旧数据：旧格式只有 opEnd/edStart，补全缺省值
  return {
    opStart: (st as any).opStart ?? 0,
    opEnd: (st as any).opEnd ?? 0,
    edStart: (st as any).edStart ?? 0,
    edEnd: (st as any).edEnd ?? 0,
  }
}

export function setSkipTimes(seriesId: string, times: SkipTimesData): void {
  ensureReady()
  data.skipTimes[seriesId] = times
  save()
}

// === Metadata ===

export function setSeriesMetadata(seriesId: string, meta: {
  title: string; titleCn: string; titleEn: string; synopsis: string
  rating: number; genres: string[]; year: number; season: string
  episodes: number; studio: string; staff: Array<{ role: string; name: string }>
  coverUrl: string; anilistId: number; bangumiId: number
}): void {
  ensureReady()
  data.metadata[seriesId] = meta
  save()
}

export function getSeriesMetadata(seriesId: string) {
  ensureReady()
  return data.metadata[seriesId] || null
}

/** 从磁盘读取 .anibox/metadata.json（当 store 中无数据时的回退） */
export function loadDiskMetadata(folderPath: string): any | null {
  try {
    const metaFile = join(folderPath, '.anibox', 'metadata.json')
    if (existsSync(metaFile)) {
      return JSON.parse(readFileSync(metaFile, 'utf-8'))
    }
  } catch { /* file missing or corrupted */ }
  return null
}

export function getAllMetadata(): Record<string, any> {
  ensureReady()
  return data.metadata
}

// === Audio Preferences ===

export interface AudioPrefsData {
  audioIndex: number
  audioDelay: number
  language?: string
}

export function getAudioPrefs(seriesId: string): AudioPrefsData | null {
  ensureReady()
  return data.audioPrefs[seriesId] || null
}

export function setAudioPrefs(seriesId: string, prefs: AudioPrefsData): void {
  ensureReady()
  data.audioPrefs[seriesId] = prefs
  save()
}

export function getGlobalAudioPrefs(): { preferredLanguage: string } {
  ensureReady()
  // 全局偏好：统计所有系列中最常用的音轨语言
  const langCount: Record<string, number> = {}
  for (const pref of Object.values(data.audioPrefs)) {
    if (pref.language) {
      langCount[pref.language] = (langCount[pref.language] || 0) + 1
    }
  }
  let maxLang = 'ja'
  let maxCount = 0
  for (const [lang, count] of Object.entries(langCount)) {
    if (count > maxCount) { maxCount = count; maxLang = lang }
  }
  return { preferredLanguage: maxLang }
}

// === Subtitle Style ===

export interface SubtitleStyleData {
  fontSize: number
  fontFamily: string
  textColor: string
  strokeColor: string
  strokeWidth: number
  bgColor: string
  position: 'bottom' | 'top'
  secondaryFontSize: number
  dualSubtitleGap: number
}

export function getSubtitleStyle(): SubtitleStyleData {
  ensureReady()
  return { ...data.subtitleStyle }
}

export function setSubtitleStyle(style: Partial<SubtitleStyleData>): void {
  ensureReady()
  data.subtitleStyle = { ...data.subtitleStyle, ...style }
  save()
}

// === Favorites ===

export function getFavorites(): string[] {
  ensureReady()
  return data.favorites
}

export function isFavorited(seriesId: string): boolean {
  ensureReady()
  return data.favorites.includes(seriesId)
}

export function toggleFavorite(seriesId: string): boolean {
  ensureReady()
  const idx = data.favorites.indexOf(seriesId)
  if (idx >= 0) {
    data.favorites.splice(idx, 1)
    save()
    return false
  } else {
    data.favorites.push(seriesId)
    save()
    return true
  }
}

// === Playlists ===

export function getPlaylists() {
  ensureReady()
  return data.playlists
}

export function createPlaylist(name: string): string {
  ensureReady()
  const id = createHash('md5').update(name + Date.now().toString()).digest('hex').substring(0, 8)
  data.playlists.push({ id, name, seriesIds: [], createdAt: new Date().toISOString() })
  save()
  return id
}

export function deletePlaylist(id: string): void {
  ensureReady()
  data.playlists = data.playlists.filter(p => p.id !== id)
  save()
}

export function addToPlaylist(listId: string, seriesId: string): void {
  ensureReady()
  const list = data.playlists.find(p => p.id === listId)
  if (list && !list.seriesIds.includes(seriesId)) {
    list.seriesIds.push(seriesId)
    save()
  }
}

export function removeFromPlaylist(listId: string, seriesId: string): void {
  ensureReady()
  const list = data.playlists.find(p => p.id === listId)
  if (list) {
    list.seriesIds = list.seriesIds.filter(id => id !== seriesId)
    save()
  }
}

// === Scan Roots (多根扫描) ===

export function getScanRoots(): string[] {
  ensureReady()
  return [...data.scanRoots]
}

export function addScanRoot(root: string): void {
  ensureReady()
  if (!data.scanRoots.includes(root)) {
    data.scanRoots.push(root)
    save()
  }
}

export function removeScanRoot(root: string): void {
  ensureReady()
  data.scanRoots = data.scanRoots.filter(r => r !== root)
  save()
}

export function setScanRoots(roots: string[]): void {
  ensureReady()
  data.scanRoots = roots
  save()
}
