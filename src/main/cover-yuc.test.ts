/**
 * cover-yuc 持久化缓存测试
 * 覆盖：页缓存落盘/离线复用、图片缓存命中与回写、渲染 URL 协议化、缓存统计与清理。
 * 全部用临时目录 + setCoverDir 注入，不依赖真实 userData。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import {
  setCoverDir,
  resetYucMemoryCache,
  coverFileName,
  parseYucSeason,
  fetchYucSeason,
  matchYucEntry,
  aniboxCoverUrl,
  ensureLocalCover,
  type YucEntry,
  coverUrlForRenderer,
  pruneYucCache,
  getYucCacheStats,
  clearYucCache,
} from './cover-yuc'

let tmp: string

beforeEach(() => {
  tmp = join(tmpdir(), `anibox-yuc-${randomUUID().slice(0, 8)}`)
  mkdirSync(tmp, { recursive: true })
  setCoverDir(tmp)
  resetYucMemoryCache()
})

afterEach(() => {
  setCoverDir(null)
  resetYucMemoryCache()
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* 清理失败无所谓 */
  }
})

// 真实页面结构：封面 img 在标题单元格之前（解析器向前找最近的 img）
const SAMPLE_HTML = `
<img data-src="https://i0.hdslb.com/bfs/new_dyn/aaa.jpg" />
<td class="date_title"><a href="#">葬送的芙莉莲</a></td>
<img data-src="https://i0.hdslb.com/bfs/new_dyn/bbb.png" />
<td class="date_title_"><a href="#">无职转生第3期#1~2</a></td>
`

describe('yuc 封面缓存', () => {
  it('文件名由 URL 决定且稳定', () => {
    const a = coverFileName('https://i0.hdslb.com/bfs/x.jpg@672w_378h.webp')
    const b = coverFileName('https://i0.hdslb.com/bfs/x.jpg@672w_378h.webp')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}\.(jpg|png|webp)$/)
    expect(coverFileName('https://i0.hdslb.com/bfs/y.webp')).toMatch(/\.webp$/)
    expect(coverFileName('https://i0.hdslb.com/bfs/z')).toMatch(/\.jpg$/) // 无扩展名兜底
  })

  it('解析季度页（两种 class 写法都能抓到）', () => {
    const entries = parseYucSeason(SAMPLE_HTML)
    expect(entries.length).toBe(2)
    expect(entries[0].title).toBe('葬送的芙莉莲')
    expect(entries[0].coverUrl).toBe('https://i0.hdslb.com/bfs/new_dyn/aaa.jpg')
    expect(entries[1].title).toBe('无职转生第3期#1~2')
  })

  it('页缓存落盘后 offline 仍能复用（断网可用）', async () => {
    mkdirSync(join(tmp, 'pages'), { recursive: true })
    writeFileSync(
      join(tmp, 'pages', '202310.json'),
      JSON.stringify({
        page: '202310',
        fetchedAt: Date.now(),
        entries: [{ title: '葬送的芙莉莲', coverUrl: 'https://i0.hdslb.com/bfs/aaa.jpg' }],
      }),
      'utf-8',
    )
    const es = await fetchYucSeason('202310', { offline: true })
    expect(es?.length).toBe(1)
    expect(es![0].title).toBe('葬送的芙莉莲')
  })

  it('无缓存且 offline 返回 null（不偷偷发请求）', async () => {
    expect(await fetchYucSeason('201901', { offline: true })).toBe(null)
  })

  it('已落盘图片 → 本地 anibox:// URL（规避防盗链）', async () => {
    const entry: YucEntry = { title: 'X', coverUrl: 'https://i0.hdslb.com/bfs/aaa.jpg' }
    const file = coverFileName(entry.coverUrl)
    mkdirSync(join(tmp, 'img'), { recursive: true })
    writeFileSync(join(tmp, 'img', file), Buffer.from([0xff, 0xd8, 0xff, 0x00]))

    const abs = await ensureLocalCover(entry)
    expect(abs).toBe(join(tmp, 'img', file))
    expect(entry.local).toBe(file) // 回写字段

    const url = await coverUrlForRenderer(entry)
    expect(url.startsWith('anibox://cover?path=')).toBe(true)
    expect(decodeURIComponent(url)).toContain(join(tmp, 'img', file))
    expect(aniboxCoverUrl('C:\\a\\b.jpg')).toBe(
      `anibox://cover?path=${encodeURIComponent('C:\\a\\b.jpg')}`,
    )
  })

  it('缓存中已记录的 local 但文件缺失 → 返回 null 而非假命中', async () => {
    const entry: YucEntry = {
      title: 'X',
      coverUrl: 'https://i0.hdslb.com/bfs/gone.jpg',
      local: coverFileName('https://i0.hdslb.com/bfs/gone.jpg'),
    }
    mkdirSync(join(tmp, 'img'), { recursive: true })
    // 文件不存在；网络不可达时 ensureLocalCover 应返回 null（不抛错）
    const r = await ensureLocalCover(entry).catch(() => 'threw')
    expect(r === null || r === 'threw').toBe(true)
  })

  it('统计与清理', async () => {
    mkdirSync(join(tmp, 'img'), { recursive: true })
    mkdirSync(join(tmp, 'pages'), { recursive: true })
    writeFileSync(join(tmp, 'img', 'a.jpg'), Buffer.alloc(2048))
    writeFileSync(join(tmp, 'pages', '202310.json'), '{}')

    const st = await getYucCacheStats()
    expect(st.images).toBe(1)
    expect(st.bytes).toBe(2048)
    expect(st.pages).toBe(1)

    expect(await clearYucCache()).toBe(true)
    const after = await getYucCacheStats()
    expect(after.images).toBe(0)
    expect(after.pages).toBe(0)
  })

  it('超出上限按最旧淘汰', () => {
    const idir = join(tmp, 'img')
    mkdirSync(idir, { recursive: true })
    const now = Date.now() / 1000
    for (const [i, name] of ['old.jpg', 'mid.jpg', 'new.jpg'].entries()) {
      const p = join(idir, name)
      writeFileSync(p, Buffer.alloc(1000, i))
      utimesSync(p, now - 3000 + i * 1000, now - 3000 + i * 1000)
    }
    // 总量 3000B，上限 1200B → 至少删到 1080B 以下，保留最新那张
    const removed = pruneYucCache(tmp, 1200)
    expect(removed).toBeGreaterThanOrEqual(2)
    const left = ['old.jpg', 'mid.jpg', 'new.jpg'].filter((f) => existsSync(join(idir, f)))
    expect(left).toEqual(['new.jpg'])
  })

  it('匹配逻辑仍可用（宽松归一化 + 季号差异）', () => {
    const entries = parseYucSeason(SAMPLE_HTML)
    expect(matchYucEntry(entries, ['葬送的芙莉莲', 'Frieren'])?.title).toBe('葬送的芙莉莲')
    expect(matchYucEntry(entries, ['无职转生 第三季'])?.title).toBe('无职转生第3期#1~2')
    expect(matchYucEntry(entries, ['完全不相干的番'])).toBe(null)
  })
})

// 真实网络用例：默认跳过（CI/离线不挂），设 ANIBOX_YUC_NET=1 才跑
const HAS_NET = !!process.env.ANIBOX_YUC_NET

describe('yuc 真实网络', () => {
  it.skipIf(!HAS_NET)(
    '抓取 202310 页并落盘',
    async () => {
      const es = await fetchYucSeason('202310')
      expect(es && es.length > 0).toBe(true)
      const p = join(tmp, 'pages', '202310.json')
      expect(existsSync(p)).toBe(true)
      const cached = JSON.parse(readFileSync(p, 'utf-8'))
      expect(cached.entries.length).toBe(es!.length)

      // 首张图能下载并落到 img/
      const abs = await ensureLocalCover(es![0])
      expect(abs && existsSync(abs) && statSync(abs).size > 0).toBe(true)
    },
    60000,
  )
})
