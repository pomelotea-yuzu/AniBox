/**
 * stream-server 冒烟测试（handler 直测，避免沙箱回环限制）
 * 覆盖：网页注入、library API、Range 分段、鉴权、路径白名单
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Writable } from 'stream'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { hashPath } from './utils/index'

const TEST_DIR = join(tmpdir(), `anibox-stream-${randomUUID().slice(0, 8)}`)
mkdirSync(TEST_DIR, { recursive: true })

vi.mock('electron', () => ({
  app: { getPath: () => TEST_DIR },
}))

const store = await import('./store')
const { handleRequest } = await import('./stream-server')

const SAMPLE = join(TEST_DIR, 'sample.mp4')
const OUTSIDE = join(tmpdir(), 'outside-secret.mp4')

class FakeRes extends Writable {
  statusCode = 200
  headers: Record<string, string | number | string[]> = {}
  chunks: Buffer[] = []
  constructor() {
    super({ highWaterMark: 1024 * 1024 })
  }
  _write(chunk: Buffer, _enc: string, cb: () => void): void {
    this.chunks.push(Buffer.from(chunk))
    cb()
  }
  writeHead(code: number, headers: Record<string, string | number | string[]>): this {
    this.statusCode = code
    const norm: Record<string, string | number | string[]> = {}
    for (const [k, v] of Object.entries(headers || {})) norm[k.toLowerCase()] = v
    this.headers = norm
    return this
  }
  get body(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

function call(url: string, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<FakeRes> {
  const rawHeaders = opts.headers || {}
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(rawHeaders)) headers[k.toLowerCase()] = v
  const req = {
    url,
    method: opts.method || 'GET',
    headers,
    on: () => {},
  } as any
  const res = new FakeRes()
  ;(res as any).req = req // streamFile 内部读取 res.req.headers.range
  return new Promise((resolve) => {
    handleRequest(req, res as any)
    // streamFile 的 pipe 在 end 后同步完成；给一个宏任务窗口收尾
    setTimeout(() => resolve(res), 50)
  })
}

beforeAll(() => {
  const bytes = Buffer.alloc(1024 * 64)
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
  writeFileSync(SAMPLE, bytes)
  writeFileSync(OUTSIDE, bytes)

  store.clearAllSeriesAndEpisodes()
  store.upsertSeries(TEST_DIR, 'Test Anime', TEST_DIR, 1, 'tv')
  const seriesId = store.getAllSeries()[0].id
  store.upsertEpisode(hashPath(SAMPLE), seriesId, 1, SAMPLE, 'sample.mp4')
  store.addScanRoot(TEST_DIR)
  store.setStreamSettings({ requireToken: false, token: 'testtok' })
  store.flushStore()
})

afterAll(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('stream server handler', () => {
  it('serves the web UI with token injected', async () => {
    const res = await call('/')
    expect(res.statusCode).toBe(200)
    const html = res.body.toString()
    expect(html).toContain('AniBox 串流')
    expect(html).not.toContain('__ANIBOX_TOKEN__')
  })

  it('returns library JSON', async () => {
    const res = await call('/api/library?key=x')
    expect(res.statusCode).toBe(200)
    const lib = JSON.parse(res.body.toString())
    expect(lib.series.length).toBe(1)
    expect(lib.series[0].title).toBe('Test Anime')
    expect(lib.episodes[lib.series[0].id].length).toBe(1)
  })

  it('serves full file without range', async () => {
    const res = await call('/api/video?key=x&path=' + encodeURIComponent(SAMPLE))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('video/mp4')
    expect(res.headers['accept-ranges']).toBe('bytes')
    expect(res.body.length).toBe(1024 * 64)
  })

  it('serves range requests (206 + Content-Range)', async () => {
    const res = await call('/api/video?key=x&path=' + encodeURIComponent(SAMPLE), {
      headers: { Range: 'bytes=100-199' },
    })
    expect(res.statusCode).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 100-199/65536')
    expect(res.body.length).toBe(100)
    expect(res.body[0]).toBe(100 % 251)
  })

  it('handles suffix and open-ended ranges', async () => {
    const r1 = await call('/api/video?key=x&path=' + encodeURIComponent(SAMPLE), {
      headers: { Range: 'bytes=-10' },
    })
    expect(r1.statusCode).toBe(206)
    expect(r1.headers['content-range']).toBe('bytes 65526-65535/65536')
    const r2 = await call('/api/video?key=x&path=' + encodeURIComponent(SAMPLE), {
      headers: { Range: 'bytes=100-' },
    })
    expect(r2.statusCode).toBe(206)
  })

  it('blocks paths outside scan roots', async () => {
    const res = await call('/api/video?key=x&path=' + encodeURIComponent(OUTSIDE))
    expect(res.statusCode).toBe(403)
  })

  it('enforces token auth when required', async () => {
    store.setStreamSettings({ requireToken: true, token: 'testtok' })
    const bad = await call('/api/library?key=wrong')
    expect(bad.statusCode).toBe(403)
    const good = await call('/api/library?key=testtok')
    expect(good.statusCode).toBe(200)
    const headerOk = await call('/api/library', { headers: { 'X-AniBox-Key': 'testtok' } })
    expect(headerOk.statusCode).toBe(200)
    store.setStreamSettings({ requireToken: false })
  })

  it('returns 404 for unknown routes', async () => {
    const res = await call('/api/nope?key=x')
    expect(res.statusCode).toBe(404)
  })
})
