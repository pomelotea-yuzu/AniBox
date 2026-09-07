/**
 * bangumi-index 真实数据测试
 * 直接读取 D:\AniBoxData 的裁剪索引（core/summary/version），
 * 验证标题归一化与三级匹配对真实 28k 条目的命中质量。
 * 数据不存在时自动跳过（CI/无数据环境不挂）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  setIndexDir,
  lookupLocalMetadata,
  getIndexStatus,
  normTitle,
  stripSeasonSuffix,
  parseSeasonNum,
} from './bangumi-index'

const REAL_DIR = 'D:\\AniBoxData'
const HAS_DATA = existsSync(join(REAL_DIR, 'core.json.gz'))
const d = HAS_DATA ? describe : describe.skip

beforeAll(() => {
  if (HAS_DATA) setIndexDir(REAL_DIR)
})

d('标题归一化', () => {
  it('全角/空格/标点归一', () => {
    expect(normTitle('ぼっち・ざ・ろっく！')).toBe(normTitle('ぼっち ざ ろっく'))
    expect(normTitle('Ｓｅａｓｏｎ　２')).toBe(normTitle('season2'))
  })
  it('去季号后缀', () => {
    expect(stripSeasonSuffix('葬送的芙莉莲 第二季')).toBe('葬送的芙莉莲')
    expect(stripSeasonSuffix('Frieren Season 2')).toBe('Frieren')
    expect(stripSeasonSuffix('Spy x Family S2')).toBe('Spy x Family')
    expect(stripSeasonSuffix('孤独摇滚！')).toBe('孤独摇滚！')
  })
  it('解析季号（含中文数字）', () => {
    expect(parseSeasonNum('进击的巨人 第三季')).toBe(3)
    expect(parseSeasonNum('Re:Zero Season 2')).toBe(2)
    expect(parseSeasonNum('葬送的芙莉莲')).toBe(0)
  })
})

d('本地索引真实查表', () => {
  it('索引可用', async () => {
    const status = await getIndexStatus()
    expect(status.available).toBe(true)
    expect(status.entries).toBeGreaterThan(20000)
  })

  it('中文标题精确命中（葬送的芙莉莲）', async () => {
    const m = await lookupLocalMetadata('葬送的芙莉莲')
    expect(m).not.toBeNull()
    expect(m!.titleCn).toContain('芙莉莲')
    expect(m!.bangumiId).toBeGreaterThan(0)
    expect(m!.rating).toBeGreaterThan(6)
    expect(m!.synopsis.length).toBeGreaterThan(10) // summary 加载
    expect(m!.coverUrl).toBe('')
  })

  it('日文原名命中（ぼっち・ざ・ろっく！）', async () => {
    const m = await lookupLocalMetadata('ぼっち・ざ・ろっく！')
    expect(m).not.toBeNull()
    expect(m!.bangumiId).toBeGreaterThan(0)
  })

  it('带季号标题命中（鬼灭之刃 第二季/柱训练篇类）', async () => {
    const m = await lookupLocalMetadata('鬼灭之刃 第二季')
    expect(m).not.toBeNull()
    expect(m!.bangumiId).toBeGreaterThan(0)
    expect(m!.titleCn).toContain('鬼灭')
  })

  it('romaji/英文别名命中（infobox 嵌套别名 → 平铺）', async () => {
    const m1 = await lookupLocalMetadata('Sousou no Frieren')
    expect(m1?.bangumiId).toBe(400602)
    const m2 = await lookupLocalMetadata('Bocchi the Rock!')
    expect(m2?.bangumiId).toBe(328609)
  })

  it('乱码标题安全返回 null', async () => {
    const m = await lookupLocalMetadata('zzzqqqxxxyyy不存在的番名qwertyuiop')
    expect(m).toBeNull()
  })
})
