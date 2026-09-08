/**
 * bootstrap.ts — 应用启动最早期的路径初始化（必须在任何 userData 访问前执行）
 *
 * 便携版检测：软件根目录（process.resourcesPath 的上级）存在 `.portable` 标志文件时，
 * 将 userData 重定向到 <软件目录>/data，实现「数据随软件走、C 盘零占用」。
 * 已安装版（无标志）保持 Electron 默认 userData（系统用户目录）。
 *
 * 旧数据迁移：便携模式首次启动（data 目录为空）时，把系统默认 userData 里的
 * 用户数据（store/索引/缓存文件/翻译模型等）搬运过来，跳过各类 Chromium 缓存；
 * 迁移一次性完成，之后 data 目录非空即跳过。
 *
 * 注意：
 * - 必须在 index.ts 的第一个 import 引入，确保 setPath 先于其他模块执行；
 * - 各模块的 userData 路径均已改为函数懒加载（如 store.storePath()），
 *   不依赖 import 顺序兜底。
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, cpSync } from 'fs'
import { join, dirname } from 'path'

const PORTABLE_FLAG = '.portable'

/** 迁移时跳过的缓存/易变目录（Chromium 运行时产物，无保留价值） */
const MIGRATION_SKIP = new Set([
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Crashpad',
  'Dictionaries',
  'Network',
  'Session Storage',
  'Shared Dictionary',
  'WebStorage',
  'blob_storage',
  'logs',
  'SingletonLock',
  'SingletonCookie',
  'SingletonPipe',
])

function detectPortableDataDir(): string | null {
  try {
    const root = dirname(process.resourcesPath)
    if (!root || root.length < 3) return null
    if (existsSync(join(root, PORTABLE_FLAG))) {
      return join(root, 'data')
    }
  } catch {
    /* ignore */
  }
  return null
}

/** 首次便携启动：从系统默认 userData 搬运用户数据（一次性，导出便于测试） */
export function migrateLegacyUserData(oldDir: string, newDir: string): number {
  try {
    if (!oldDir || oldDir === newDir || !existsSync(oldDir)) return 0
    if (readdirSync(newDir).length > 0) return 0 // 已有数据，不迁移
    let migrated = 0
    for (const ent of readdirSync(oldDir, { withFileTypes: true })) {
      if (MIGRATION_SKIP.has(ent.name)) continue
      try {
        cpSync(join(oldDir, ent.name), join(newDir, ent.name), { recursive: true })
        migrated++
      } catch {
        /* 单项失败不阻塞其余迁移 */
      }
    }
    console.log(`[AniBox] 便携首启: 已迁移旧数据 ${migrated} 项 ← ${oldDir}`)
    return migrated
  } catch (err) {
    console.warn('[AniBox] 旧数据迁移失败（不影响启动）:', err)
    return 0
  }
}

const INDEX_DIR_NAME = 'anibox-index'
const INDEX_FILES = ['core.json.gz', 'summary.json.gz', 'version.json']

/**
 * 安装内置索引：发布包在 resources/anibox-index/ 预置一份 Bangumi 裁剪索引，
 * userData 里缺失时自动装上（已有则不覆盖，交由设置页的索引更新负责）。
 * 没有它新番时间表与元数据刮削只能回退在线源（AniList 已 403），直接不可用。
 * @returns 复制的文件数
 */
export function ensureBundledIndex(userDataDir: string, resourcesDir?: string): number {
  try {
    if (!userDataDir) return 0
    const dest = join(userDataDir, INDEX_DIR_NAME)
    if (existsSync(join(dest, 'core.json.gz'))) return 0
    const base = resourcesDir ?? process.resourcesPath ?? ''
    if (!base) return 0
    const src = join(base, INDEX_DIR_NAME)
    if (!existsSync(join(src, 'core.json.gz'))) return 0
    mkdirSync(dest, { recursive: true })
    let n = 0
    for (const f of INDEX_FILES) {
      try {
        cpSync(join(src, f), join(dest, f))
        n++
      } catch {
        /* 单个文件失败不阻塞 */
      }
    }
    console.log(`[AniBox] 内置索引已安装 ${n} 个文件 → ${dest}`)
    return n
  } catch (err) {
    console.warn('[AniBox] 内置索引安装失败（不影响启动）:', err)
    return 0
  }
}

try {
  const dataDir = detectPortableDataDir()
  if (dataDir) {
    let legacyDir: string | null = null
    try {
      legacyDir = app.getPath('userData') // setPath 前记录系统默认路径
    } catch {
      /* ignore */
    }
    app.setPath('userData', dataDir)
    try {
      mkdirSync(dataDir, { recursive: true })
    } catch {
      /* 目录创建失败不影响启动 */
    }
    if (legacyDir) migrateLegacyUserData(legacyDir, dataDir)
    console.log('[AniBox] 便携模式: 数据目录 =', dataDir)
  }
  // 索引预置（便携版与安装版都需要，保证开箱即可用新番时间表）
  try {
    ensureBundledIndex(app.getPath('userData'))
  } catch {
    /* ignore */
  }
} catch {
  /* ignore */
}
