/**
 * storage-info.ts — 存储信息聚合（设置页「存储」tab 数据源）
 *
 * 汇总：数据根目录（userData）、便携模式标志、各缓存目录的路径/大小/是否可清理。
 * 目录大小用异步递归统计，避免阻塞主进程。
 */
import { app } from 'electron'
import { promises as fsp } from 'fs'
import { join, dirname } from 'path'
import { resetYucMemoryCache } from './cover-yuc'

export interface StorageItem {
  key: string
  label: string
  desc: string
  path: string
  exists: boolean
  sizeMB: number
  clearable: boolean
}

export interface StorageInfo {
  root: string
  portable: boolean
  items: StorageItem[]
  storePath: string
  storeExists: boolean
}

async function dirSizeMB(dir: string): Promise<number> {
  let total = 0
  const walk = async (d: string): Promise<void> => {
    let entries
    try {
      entries = await fsp.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const fp = join(d, e.name)
      try {
        if (e.isDirectory()) await walk(fp)
        else if (e.isFile()) total += (await fsp.stat(fp)).size
      } catch {
        /* 无权限/占用，跳过 */
      }
    }
  }
  try {
    await walk(dir)
  } catch {
    /* ignore */
  }
  return Math.round(total / 1024 / 1024)
}

/** 与 bootstrap.ts 的便携判定一致：userData 被重定向到 <软件根>/data */
function isPortableMode(ud: string): boolean {
  try {
    const expected = join(dirname(process.resourcesPath), 'data')
    return ud.toLowerCase() === expected.toLowerCase()
  } catch {
    return false
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const ud = app.getPath('userData')
  const items: StorageItem[] = []
  const defs: Array<[string, string, string, boolean]> = [
    ['stream-cache', '串流缓存', '转封装/转码产物（可安全清理，下次播放自动重建）', true],
    ['ffmpeg', 'ffmpeg 引擎', '视频处理引擎（删除后自动重新下载）', true],
    ['models', '本地翻译模型', 'opus-mt 日→中翻译模型', false],
    ['subtitle-cache', '在线字幕缓存', 'OpenSubtitles 下载的字幕', true],
    ['danmaku-cache', '弹幕缓存', '各番剧弹幕数据', true],
    [
      'yuc-covers',
      '番剧封面缓存',
      'yuc.wiki 季度封面的本地副本（离线/防防盗链用，清理后自动重建）',
      true,
    ],
  ]
  for (const [key, label, desc, clearable] of defs) {
    const p = join(ud, key)
    items.push({
      key,
      label,
      desc,
      path: p,
      exists: await fsp
        .stat(p)
        .then((s) => s.isDirectory())
        .catch(() => false),
      sizeMB: await dirSizeMB(p),
      clearable,
    })
  }
  const storePath = join(ud, 'anibox-store.json')
  return {
    root: ud,
    portable: isPortableMode(ud),
    items,
    storePath,
    storeExists: await fsp
      .stat(storePath)
      .then(() => true)
      .catch(() => false),
  }
}

/** 清空某缓存目录内容（保留目录本身）。仅限白名单 key，避免误删 */
const CLEARABLE_KEYS = new Set([
  'stream-cache',
  'ffmpeg',
  'subtitle-cache',
  'danmaku-cache',
  'yuc-covers',
])

export async function clearCacheDir(key: string): Promise<{ ok: boolean; message: string }> {
  if (!CLEARABLE_KEYS.has(key)) return { ok: false, message: '该目录不允许一键清理' }
  const dir = join(app.getPath('userData'), key)
  try {
    await fsp.rm(dir, { recursive: true, force: true })
    await fsp.mkdir(dir, { recursive: true })
    // 封面缓存目录被删后，内存里的季度页条目仍指向已消失的图片，需重置
    if (key === 'yuc-covers') resetYucMemoryCache()
    return { ok: true, message: '' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
