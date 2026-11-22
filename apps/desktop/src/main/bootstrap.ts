/**
 * bootstrap.ts — 应用启动最早期的路径初始化（必须在任何 userData 访问前执行）
 *
 * 数据根解析（优先级从高到低）：
 * 1. 环境变量 `ANIBOX_DATA_DIR`：显式指定，便于多实例、测试与排障；
 * 2. 便携包：软件根目录（process.resourcesPath 的上级）存在 `.portable` 标志时，
 *    用 `<软件目录>/data`，实现「数据随软件走、C 盘零占用」；
 * 3. 开发态（未打包）：仓库根的 `.anibox/`（`apps/desktop` 往上两级），
 *    让开发数据与仓库同处一地、跟着仓库一起备份/删除，不散落在系统用户目录；
 * 4. 以上都不成立（安装版）：保持 Electron 默认 userData（系统用户目录）。
 *
 * 旧数据迁移：重定向到新目录且新目录为空时，把系统默认 userData 里的用户数据
 * （store/索引/缓存文件/翻译模型等）搬运过来，跳过各类 Chromium 缓存；
 * 迁移一次性完成，之后新目录非空即跳过。
 *
 * 注意：
 * - 必须在 index.ts 的第一个 import 引入，确保 setPath 先于其他模块执行；
 * - 各模块的 userData 路径均已改为函数懒加载（如 store.storePath()），
 *   不依赖 import 顺序兜底；
 * - 解析结果必须打印出来（用户要能自己验证"数据到底在哪"）。
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, cpSync } from 'fs'
import { join, dirname, resolve } from 'path'

const PORTABLE_FLAG = '.portable'
/** 开发态数据根：仓库根的 .anibox/（与 AGENTS.md 同级） */
const DEV_DATA_DIR = '.anibox'

/** 迁移时跳过的缓存/易变目录（Chromium 运行时产物与可重生成的转码缓存） */
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
  'stream-cache', // 局域网串流的转码产物，随时可重生成，可能上 GB
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

/**
 * 开发态数据根：仓库根 `.anibox/`。
 * 用 AGENTS.md 作为"这确实是本仓结构"的握手标志，避免在别的目录里凭空造数据目录。
 */
function detectDevDataDir(): string | null {
  try {
    if (app.isPackaged) return null
    const repoRoot = join(app.getAppPath(), '..', '..')
    if (!existsSync(join(repoRoot, 'AGENTS.md'))) return null
    return join(repoRoot, DEV_DATA_DIR)
  } catch {
    return null
  }
}

/** 打包后资源根跟着 resourcesPath；开发态用 package 内的 resources/（内置索引在这里） */
function resolveResourcesDir(): string {
  try {
    if (app.isPackaged) return process.resourcesPath
    return join(app.getAppPath(), 'resources')
  } catch {
    return ''
  }
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
  const envDir = process.env.ANIBOX_DATA_DIR?.trim()
  const portableDir = envDir ? null : detectPortableDataDir()
  const dataDir = envDir ? resolve(envDir) : (portableDir ?? detectDevDataDir())

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
    const mode = envDir ? 'ANIBOX_DATA_DIR' : portableDir ? '便携模式' : '开发模式'
    console.log(`[AniBox] 数据目录（${mode}）=`, dataDir)
  } else {
    console.log('[AniBox] 数据目录（安装版默认）=', app.getPath('userData'))
  }

  // 索引预置（便携版、开发态与安装版都需要，保证开箱即可用新番时间表）
  try {
    ensureBundledIndex(app.getPath('userData'), resolveResourcesDir())
  } catch {
    /* ignore */
  }
} catch {
  /* ignore */
}
