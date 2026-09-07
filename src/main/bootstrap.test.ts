/**
 * bootstrap 便携迁移测试（纯文件系统，无 Electron 依赖）
 */
import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { migrateLegacyUserData } from './bootstrap'

describe('便携首启旧数据迁移', () => {
  it('搬运用户数据、跳过缓存目录、二次调用不重复', () => {
    const base = join(tmpdir(), `anibox-mig-${randomUUID().slice(0, 8)}`)
    const oldDir = join(base, 'old')
    const newDir = join(base, 'new')
    mkdirSync(join(oldDir, 'anibox-index'), { recursive: true })
    mkdirSync(join(oldDir, 'Cache'), { recursive: true })
    mkdirSync(join(oldDir, 'models'), { recursive: true })
    writeFileSync(join(oldDir, 'anibox-store.json'), '{"ok":1}')
    writeFileSync(join(oldDir, 'anibox-index', 'core.json.gz'), 'x')
    writeFileSync(join(oldDir, 'models', 'm.bin'), 'y')
    writeFileSync(join(oldDir, 'Cache', 'junk.bin'), 'z')
    mkdirSync(newDir, { recursive: true })

    const n = migrateLegacyUserData(oldDir, newDir)
    expect(n).toBe(3)
    expect(existsSync(join(newDir, 'anibox-store.json'))).toBe(true)
    expect(existsSync(join(newDir, 'anibox-index', 'core.json.gz'))).toBe(true)
    expect(existsSync(join(newDir, 'models', 'm.bin'))).toBe(true)
    expect(existsSync(join(newDir, 'Cache'))).toBe(false)

    // newDir 已有数据 → 不再迁移
    expect(migrateLegacyUserData(oldDir, newDir)).toBe(0)

    rmSync(base, { recursive: true, force: true })
  })

  it('oldDir 不存在或与 newDir 相同 → 安全返回 0', () => {
    const base = join(tmpdir(), `anibox-mig-${randomUUID().slice(0, 8)}`)
    mkdirSync(base, { recursive: true })
    expect(migrateLegacyUserData(join(base, 'nope'), base)).toBe(0)
    expect(migrateLegacyUserData(base, base)).toBe(0)
    rmSync(base, { recursive: true, force: true })
  })
})
