/**
 * bootstrap.ts — 应用启动最早期的路径初始化（必须在任何 userData 访问前执行）
 *
 * 便携版检测：软件根目录（process.resourcesPath 的上级）存在 `.portable` 标志文件时，
 * 将 userData 重定向到 <软件目录>/data，实现「数据随软件走、C 盘零占用」。
 * 已安装版（无标志）保持 Electron 默认 userData（系统用户目录）。
 *
 * 注意：
 * - 必须在 index.ts 的第一个 import 引入，确保 setPath 先于其他模块执行；
 * - 各模块的 userData 路径均已改为函数懒加载（如 store.storePath()），
 *   不依赖 import 顺序兜底。
 */
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

const PORTABLE_FLAG = '.portable'

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

try {
  const dataDir = detectPortableDataDir()
  if (dataDir) {
    app.setPath('userData', dataDir)
    try {
      mkdirSync(dataDir, { recursive: true })
    } catch {
      /* 目录创建失败不影响启动 */
    }
    console.log('[AniBox] 便携模式: 数据目录 =', dataDir)
  }
} catch {
  /* ignore */
}
