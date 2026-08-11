/**
 * libmpv-bridge.ts — 方案 A：libmpv (mpv-2.dll) + koffi 内嵌软渲染播放桥
 *
 * 基于 libmpv-test/05-poll-render.js 的验证结论实现：
 *  - mpv_set_option_string('vo','libmpv') 必须在 initialize 前设置，否则黑帧
 *  - SW_POINTER 目标必须 4 字节对齐：用 Node Buffer + koffi.address()（Electron 下
 *    koffi.view() 创建 external ArrayBuffer 会崩溃 —— 实测 2026-08-12）
 *  - 用轮询渲染（setInterval 调 update+render），不用跨线程 update callback（Windows 下会崩）
 *  - 事件 drain 限次（≤50），防止被事件流占死主线程
 *  - 事件数据在 mpv_event.data：koffi.decode(e.data, 'mpv_event_log_message')，不是 decode(ev)
 *  - NEXT_FRAME_INFO.flags 不可靠（结构体顺序 target_time 在前），取帧以 render()==0 为准
 *
 * koffi 3.1.4 API 注意：
 *  - koffi.alloc(type, count) 返回 BigInt 指针，必须显式 koffi.free 防泄漏
 *  - koffi.view(ref, len) 返回共享 ArrayBuffer 视图（零拷贝读帧）
 *  - koffi.decode(ptr, offset, type) 带偏移读结构字段
 */
import { existsSync } from 'fs'
import { join, dirname } from 'path'

// --- koffi 动态加载：包缺失时优雅降级（旧 mpv.exe 链路） ---
type Koffi = typeof import('koffi')['default']
let koffi: Koffi | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  koffi = require('koffi') as Koffi
} catch {
  koffi = null
}

// ---------- mpv 常量（对照 include/mpv/client.h / render.h） ----------
// mpv_format
const MPV_FORMAT_NONE = 0
const MPV_FORMAT_STRING = 1
const MPV_FORMAT_OSD_STRING = 2
const MPV_FORMAT_FLAG = 3
const MPV_FORMAT_INT64 = 4
const MPV_FORMAT_DOUBLE = 5
const MPV_FORMAT_NODE = 6
const MPV_FORMAT_NODE_ARRAY = 7
const MPV_FORMAT_NODE_MAP = 8
const MPV_FORMAT_BYTE_ARRAY = 9
// mpv_event_id
const MPV_EVENT_LOG_MESSAGE = 2
const MPV_EVENT_START_FILE = 6
const MPV_EVENT_END_FILE = 7
const MPV_EVENT_FILE_LOADED = 8
// mpv_render_param_type
const MPV_RENDER_PARAM_API_TYPE = 1
const MPV_RENDER_PARAM_NEXT_FRAME_INFO = 11
const MPV_RENDER_PARAM_SW_SIZE = 17
const MPV_RENDER_PARAM_SW_FORMAT = 18
const MPV_RENDER_PARAM_SW_STRIDE = 19
const MPV_RENDER_PARAM_SW_POINTER = 20
// mpv_render_update_flags
const MPV_RENDER_UPDATE_FRAME = 1
// mpv_end_file_reason
const MPV_END_FILE_REASON_EOF = 0

// ---------- 类型 ----------
export interface LibmpvFrame {
  /** RGBA 像素数据（已从 koffi 内存拷贝，可安全异步使用） */
  buffer: Buffer
  width: number
  height: number
}

export interface LibmpvTrack {
  id: number
  type: string
  lang: string
  title: string
  codec: string
  selected: boolean
}

export interface LibmpvHandlers {
  /** 新帧就绪（主进程在此 send IPC） */
  onFrame?: (frame: LibmpvFrame) => void
  onFileLoaded?: (info: { width: number; height: number }) => void
  onStartFile?: () => void
  /** reason: 0=EOF, 1=STOP, 2=QUIT, 3=ERROR, 4=REDIRECT */
  onEndFile?: (reason: number) => void
  onTracks?: (tracks: LibmpvTrack[]) => void
  onLog?: (level: string, text: string) => void
  onReady?: () => void
}

interface LibmpvApi {
  mpv_create: () => bigint | null
  mpv_initialize: (ctx: bigint) => number
  mpv_destroy: (ctx: bigint) => void
  mpv_command: (ctx: bigint, args: string[]) => number
  mpv_get_property: (ctx: bigint, name: string, format: number, data: bigint) => number
  mpv_set_property_string: (ctx: bigint, name: string, data: string) => number
  mpv_set_option_string: (ctx: bigint, name: string, data: string) => number
  mpv_request_log_messages: (ctx: bigint, level: string) => number
  mpv_wait_event: (ctx: bigint, timeout: number) => bigint | null
  mpv_render_context_create: (res: bigint, ctx: bigint, params: bigint) => number
  mpv_render_context_update: (rc: bigint) => bigint
  mpv_render_context_render: (rc: bigint, params: bigint) => number
  mpv_render_context_free: (rc: bigint) => void
}

// ---------- koffi 声明（模块级单例，只注册一次） ----------
let declared = false
function ensureDeclared(): boolean {
  if (!koffi) return false
  if (declared) return true
  koffi.struct('mpv_render_param', { type: 'int32', data: 'void *' })
  koffi.struct('mpv_event', { event_id: 'int32', error: 'int32', reply_userdata: 'uint64', data: 'void *' })
  koffi.struct('mpv_event_log_message', { prefix: 'str', level: 'str', text: 'str', log_level: 'uint64' })
  koffi.struct('mpv_event_end_file', {
    reason: 'int32',
    error: 'int32',
    playlist_entry_id: 'uint64',
    playlist_insert_id: 'int32',
    playlist_insert_num_entries: 'int32',
  })
  koffi.struct('mpv_render_frame_info', { target_time: 'int64', flags: 'int32' })
  declared = true
  return true
}

let cachedApi: LibmpvApi | null = null
let cachedDll = ''
function getApi(dllPath: string): LibmpvApi {
  if (cachedApi && cachedDll === dllPath) return cachedApi
  if (!ensureDeclared() || !koffi) throw new Error('koffi 不可用')
  const lib = koffi.load(dllPath)
  cachedApi = {
    mpv_create: lib.func('void *mpv_create()'),
    mpv_initialize: lib.func('int mpv_initialize(void *ctx)'),
    mpv_destroy: lib.func('void mpv_destroy(void *ctx)'),
    mpv_command: lib.func('int mpv_command(void *ctx, const char **args)'),
    mpv_get_property: lib.func('int mpv_get_property(void *ctx, const char *name, int format, void *data)'),
    mpv_set_property_string: lib.func('int mpv_set_property_string(void *ctx, const char *name, const char *data)'),
    mpv_set_option_string: lib.func('int mpv_set_option_string(void *ctx, const char *name, const char *data)'),
    mpv_request_log_messages: lib.func('int mpv_request_log_messages(void *ctx, const char *min_level)'),
    mpv_wait_event: lib.func('void *mpv_wait_event(void *ctx, double timeout)'),
    mpv_render_context_create: lib.func('int mpv_render_context_create(void **res, void *mpv, const void *params)'),
    mpv_render_context_update: lib.func('uint64_t mpv_render_context_update(void *ctx)'),
    mpv_render_context_render: lib.func('int mpv_render_context_render(void *ctx, const void *params)'),
    mpv_render_context_free: lib.func('void mpv_render_context_free(void *ctx)'),
  }
  cachedDll = dllPath
  return cachedApi
}

/**
 * 查找 libmpv-2.dll（与 getMpvPath 的布局策略一致）
 * 打包：resources/libmpv-2.dll（标准布局）→ 应用根目录（便携版布局）
 * 开发：项目根 libmpv-2.dll → libmpv 开发包目录
 */
const DEV_DLL = 'D:/AniBox/mpv-dev-x86_64-20260811-git-f4d13e1c2c/libmpv-2.dll'

export function findLibmpvDll(): string | null {
  const candidates: string[] = []
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'libmpv-2.dll'))
    candidates.push(join(dirname(process.resourcesPath), 'libmpv-2.dll'))
  }
  candidates.push(join(__dirname, '../../libmpv-2.dll'))
  candidates.push(DEV_DLL)
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {
      /* ok */
    }
  }
  return null
}

/**
 * 手解析 mpv_node（x64 LP64 布局，避免 koffi 循环引用 struct 限制）
 * mpv_node:  { union u(8); mpv_format format(4); pad(4) } = 16B
 * mpv_node_list: { int num(4); pad(4); mpv_node *values(8); char **keys(8) } = 24B
 */
function parseMpvNode(ptr: bigint | null | undefined, depth = 0): any {
  if (!ptr || depth > 8 || !koffi) return null
  const format = koffi.decode(ptr, 8, 'int32')
  switch (format) {
    case MPV_FORMAT_NONE:
      return null
    case MPV_FORMAT_STRING:
    case MPV_FORMAT_OSD_STRING: {
      const sp = koffi.decode(ptr, 0, 'void *')
      return sp ? koffi.decode.string(sp) : ''
    }
    case MPV_FORMAT_FLAG:
      return koffi.decode(ptr, 0, 'int32') !== 0
    case MPV_FORMAT_INT64:
      return Number(koffi.decode(ptr, 0, 'int64'))
    case MPV_FORMAT_DOUBLE:
      return koffi.decode(ptr, 0, 'double')
    case MPV_FORMAT_NODE_ARRAY:
    case MPV_FORMAT_NODE_MAP: {
      const list = koffi.decode(ptr, 0, 'void *')
      if (!list) return format === MPV_FORMAT_NODE_MAP ? {} : []
      const num = koffi.decode(list, 0, 'int32')
      const values = koffi.decode(list, 8, 'void *')
      const arr: any[] = []
      for (let i = 0; i < num; i++) {
        arr.push(parseMpvNode(values + BigInt(i * 16), depth + 1))
      }
      if (format === MPV_FORMAT_NODE_MAP) {
        const keys = koffi.decode(list, 16, 'void *')
        const obj: Record<string, any> = {}
        for (let i = 0; i < num; i++) {
          const kPtr = koffi.decode(keys + BigInt(i * 8), 0, 'void *')
          const key = kPtr ? koffi.decode.string(kPtr) : String(i)
          obj[key] = arr[i]
        }
        return obj
      }
      return arr
    }
    case MPV_FORMAT_BYTE_ARRAY: {
      const list = koffi.decode(ptr, 0, 'void *')
      if (!list) return null
      const num = koffi.decode(list, 0, 'int32')
      const data = koffi.decode(list, 8, 'void *')
      if (!data) return null
      return Buffer.from(new Uint8Array(koffi.view(data, num)))
    }
    default:
      return null
  }
}

// ---------- 播放器桥 ----------
export class LibmpvBridge {
  private api: LibmpvApi | null = null
  private ctx: bigint | null = null
  private rc: bigint | null = null
  /** SW_POINTER 目标：Node Buffer（koffi.address 取地址，mpv 直接渲染进来，零拷贝取帧） */
  private frameBuf: Buffer | null = null
  private params: bigint | null = null
  private sizePtr: bigint | null = null
  private stridePtr: bigint | null = null
  private fiPtr: bigint | null = null
  private w = 0
  private h = 0
  /** SW 渲染目标尺寸（可能小于视频原生尺寸：1080p 原生软渲染会占死主线程导致窗口卡死，降采样渲染） */
  private renderW = 0
  private renderH = 0
  private stride = 0
  private loaded = false
  private destroyed = false
  private timer: NodeJS.Timeout | null = null
  private handlers: LibmpvHandlers

  constructor(handlers?: LibmpvHandlers) {
    this.handlers = handlers || {}
  }

  get isActive(): boolean {
    return !this.destroyed && this.ctx !== null && this.rc !== null
  }

  get isLoaded(): boolean {
    return this.loaded
  }

  get size(): { width: number; height: number } {
    return { width: this.renderW || this.w, height: this.renderH || this.h }
  }

  /** SW 渲染最大宽度（等比缩放；默认 1920=1080p 原生，实测用户机器流畅；低配可设 ANIBOX_MPV_RENDER_MAX=960/1280） */
  private get swMaxWidth(): number {
    const v = Number(process.env.ANIBOX_MPV_RENDER_MAX)
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1920
  }

  /** 轮询渲染间隔 ms（默认 50ms ≈ 20fps；SW 渲染在主进程主线程，帧率过高会卡窗口） */
  private get tickMs(): number {
    const v = Number(process.env.ANIBOX_MPV_TICK_MS)
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 50
  }

  /** 初始化 libmpv。失败返回 false（调用方应回退旧 mpv.exe 链路） */
  init(dllPath: string): boolean {
    if (!koffi) {
      console.warn('[libmpv] koffi 不可用，回退旧 mpv.exe 链路')
      return false
    }
    try {
      this.api = getApi(dllPath)
    } catch (err) {
      console.warn('[libmpv] dll 加载失败:', (err as Error).message)
      this.api = null
      return false
    }
    try {
      const ctx = this.api.mpv_create()
      if (!ctx) {
        console.warn('[libmpv] mpv_create 失败')
        return false
      }
      this.ctx = ctx
      // vo=libmpv 必须在 initialize 前设置（不设则 render_context_update 恒 0 → 黑帧）
      this.api.mpv_set_option_string(ctx, 'vo', 'libmpv')
      // 沙箱无音频设备默认 wasapi 会崩；用户实机可改 'wasapi' 或移除（由主进程按环境传参）
      this.api.mpv_set_option_string(ctx, 'ao', this.audioOutput)
      this.api.mpv_set_option_string(ctx, 'hwdec', 'no') // SW 渲染禁用硬解
      this.api.mpv_set_option_string(ctx, 'keep-open', 'yes')
      this.api.mpv_set_option_string(ctx, 'video-sync', 'audio')
      const initR = this.api.mpv_initialize(ctx)
      if (initR !== 0) {
        console.warn('[libmpv] mpv_initialize 失败 code=', initR)
        this.destroy()
        return false
      }
      this.api.mpv_request_log_messages(ctx, 'warn')

      // 创建 SW 渲染上下文
      const rcBuf = koffi.alloc('void *', 1)
      const createParams = koffi.alloc('mpv_render_param', 2)
      koffi.encode(createParams, 0, 'mpv_render_param', { type: MPV_RENDER_PARAM_API_TYPE, data: 'sw' })
      koffi.encode(createParams, 16, 'mpv_render_param', { type: 0, data: null })
      const rcR = this.api.mpv_render_context_create(rcBuf, this.ctx, createParams)
      if (rcR !== 0) {
        console.warn('[libmpv] render_context_create 失败 code=', rcR)
        koffi.free(rcBuf)
        koffi.free(createParams)
        this.destroy()
        return false
      }
      this.rc = koffi.decode(rcBuf, 'void *')
      koffi.free(rcBuf)
      koffi.free(createParams)

      // 固定 param buffer（尺寸字段在 FILE_LOADED 后填真实值）
      this.sizePtr = koffi.alloc('int32', 2)
      this.stridePtr = koffi.alloc('int32', 1)
      this.fiPtr = koffi.alloc('mpv_render_frame_info', 1)

      // 轮询渲染：50ms ≈ 20fps 上限。SW 渲染在主进程主线程，渲染 1080p 原生尺寸会
      // 占死主线程（窗口拖不动 + IPC 帧送不出）。降采样 + 限帧率保主线程响应。
      this.timer = setInterval(() => this.tick(), this.tickMs)
      this.handlers.onReady?.()
      return true
    } catch (err) {
      console.warn('[libmpv] init 异常:', err)
      this.destroy()
      return false
    }
  }

  /** 音频输出：默认 wasapi（实机）；无音频设备环境设 ANIBOX_MPV_AO=null 禁用 */
  private get audioOutput(): string {
    return process.env.ANIBOX_MPV_AO || 'wasapi'
  }

  loadFile(fp: string): void {
    this.command(['loadfile', fp, 'replace'])
  }

  play(): void {
    this.setProperty('pause', 'no')
  }

  pause(): void {
    this.setProperty('pause', 'yes')
  }

  togglePause(): void {
    this.command(['cycle', 'pause'])
  }

  seek(t: number): void {
    this.command(['seek', String(t), 'absolute'])
  }

  seekRelative(delta: number): void {
    this.command(['seek', String(delta), 'relative'])
  }

  setVolume(v: number): void {
    this.setProperty('volume', String(v))
  }

  setSpeed(s: number): void {
    this.setProperty('speed', String(s))
  }

  setSid(id: number | 'no'): void {
    this.setProperty('sid', String(id))
  }

  setAid(id: number | 'no'): void {
    this.setProperty('aid', String(id))
  }

  /** 通用命令（参数自动转字符串，兼容 JSON IPC 语义） */
  command(args: (string | number)[]): boolean {
    if (!this.api || !this.ctx) return false
    try {
      return this.api.mpv_command(this.ctx, args.map(String)) === 0
    } catch {
      return false
    }
  }

  setProperty(name: string, value: string): boolean {
    if (!this.api || !this.ctx) return false
    try {
      return this.api.mpv_set_property_string(this.ctx, name, value) === 0
    } catch {
      return false
    }
  }

  getIntProperty(name: string): number {
    if (!this.api || !this.ctx || !koffi) return 0
    const buf = koffi.alloc('int64', 1)
    try {
      const r = this.api.mpv_get_property(this.ctx, name, MPV_FORMAT_INT64, buf)
      if (r !== 0) return 0
      return Number(koffi.decode(buf, 'int64'))
    } catch {
      return 0
    } finally {
      koffi.free(buf)
    }
  }

  getTimePos(): number {
    // time-pos 是 double，用 MPV_FORMAT_DOUBLE 读取（INT64 会截断）
    return this.getDoubleProperty('time-pos')
  }

  private getDoubleProperty(name: string): number {
    if (!this.api || !this.ctx || !koffi) return 0
    const buf = koffi.alloc('double', 1)
    try {
      const r = this.api.mpv_get_property(this.ctx, name, MPV_FORMAT_DOUBLE, buf)
      if (r !== 0) return 0
      return Number(koffi.decode(buf, 'double'))
    } catch {
      return 0
    } finally {
      koffi.free(buf)
    }
  }

  getDuration(): number {
    return this.getDoubleProperty('duration')
  }

  isPaused(): boolean {
    if (!this.api || !this.ctx || !koffi) return true
    const buf = koffi.alloc('int32', 1)
    try {
      const r = this.api.mpv_get_property(this.ctx, 'pause', MPV_FORMAT_FLAG, buf)
      if (r !== 0) return true
      return koffi.decode(buf, 'int32') !== 0
    } catch {
      return true
    } finally {
      koffi.free(buf)
    }
  }

  /** 查询 track-list 并回调 onTracks（FILE_LOADED 后延迟调用，等轨道信息填充） */
  queryTracks(): void {
    if (!this.api || !this.ctx || !koffi) return
    const nodePtr = koffi.alloc('int64', 2) // mpv_node 16B（u=8 + format=4 + pad=4）
    try {
      const r = this.api.mpv_get_property(this.ctx, 'track-list', MPV_FORMAT_NODE, nodePtr)
      if (r !== 0) return
      const list = parseMpvNode(nodePtr)
      if (Array.isArray(list)) {
        const tracks: LibmpvTrack[] = list.map((t: any) => ({
          id: Number(t?.id) || 0,
          type: String(t?.type || ''),
          lang: String(t?.lang || ''),
          title: String(t?.title || ''),
          codec: String(t?.codec || ''),
          selected: !!t?.selected,
        }))
        this.handlers.onTracks?.(tracks)
      }
    } catch (err) {
      console.warn('[libmpv] queryTracks 异常:', err)
    } finally {
      koffi.free(nodePtr)
    }
  }

  destroy(): void {
    this.destroyed = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.api) {
      if (this.rc) {
        try {
          this.api.mpv_render_context_free(this.rc)
        } catch {
          /* ok */
        }
        this.rc = null
      }
      if (this.ctx) {
        try {
          this.api.mpv_destroy(this.ctx)
        } catch {
          /* ok */
        }
        this.ctx = null
      }
    }
    if (koffi) {
      for (const p of [this.params, this.sizePtr, this.stridePtr, this.fiPtr]) {
        if (p) {
          try {
            koffi.free(p)
          } catch {
            /* ok */
          }
        }
      }
    }
    this.frameBuf = null
    this.params = null
    this.sizePtr = null
    this.stridePtr = null
    this.fiPtr = null
    this.loaded = false
    this.api = null
  }

  // ---------- 内部：事件 drain + 轮询渲染 ----------
  private tick(): void {
    try {
      this.drainEvents()
    } catch {
      /* ok */
    }
    try {
      this.renderFrame()
    } catch {
      /* ok */
    }
  }

  private drainEvents(): void {
    if (!this.api || !this.ctx || !koffi) return
    let ev: bigint | null
    let n = 0
    while (n++ < 50 && (ev = this.api.mpv_wait_event(this.ctx, 0))) {
      const e = koffi.decode(ev, 'mpv_event')
      switch (e.event_id) {
        case MPV_EVENT_LOG_MESSAGE: {
          const log = koffi.decode(e.data || 0n, 'mpv_event_log_message')
          if (log.text) this.handlers.onLog?.(log.level || '', log.text.trim())
          break
        }
        case MPV_EVENT_START_FILE:
          this.loaded = false
          this.handlers.onStartFile?.()
          break
        case MPV_EVENT_FILE_LOADED:
          this.onFileLoaded()
          break
        case MPV_EVENT_END_FILE: {
          const ef = koffi.decode(e.data || 0n, 'mpv_event_end_file')
          this.handlers.onEndFile?.(ef.reason)
          break
        }
        default:
          break
      }
    }
  }

  private onFileLoaded(): void {
    if (!koffi) return
    this.w = this.getIntProperty('width')
    this.h = this.getIntProperty('height')
    if (!this.w || !this.h) {
      console.warn('[libmpv] 文件加载但尺寸未知:', this.w, this.h)
      return
    }
    // 渲染目标尺寸：等比缩放到 ≤swMaxWidth（保主线程响应；mpv 会自动缩放画面，ASS 字幕也随帧渲染）
    const scale = Math.min(1, this.swMaxWidth / this.w)
    this.renderW = Math.max(2, Math.floor((this.w * scale) / 2) * 2)
    this.renderH = Math.max(2, Math.floor((this.h * scale) / 2) * 2)
    console.log(`[libmpv] 视频 ${this.w}x${this.h} → SW 渲染 ${this.renderW}x${this.renderH}`)
    this.stride = this.renderW * 4
    // SW_POINTER 必须 4 字节对齐：Node Buffer 天然对齐。用 koffi.address 把 mpv 渲染目标
    // 指向 Node Buffer（Electron 下 koffi.view 创建 external ArrayBuffer 会崩溃，勿用）
    this.frameBuf = Buffer.allocUnsafe(this.renderW * this.renderH * 4)
    this.buildRenderParams()
    this.loaded = true
    this.handlers.onFileLoaded?.({ width: this.renderW, height: this.renderH })
    // 延迟查轨道列表（等 mpv 填充 track-list）
    setTimeout(() => {
      try {
        this.queryTracks()
      } catch {
        /* ok */
      }
    }, 400)
  }

  private buildRenderParams(): void {
    if (!koffi || !this.w || !this.h || !this.frameBuf) return
    koffi.encode(this.sizePtr!, 0, 'int32', this.renderW)
    koffi.encode(this.sizePtr!, 4, 'int32', this.renderH)
    koffi.encode(this.stridePtr!, 0, 'int32', this.stride)
    const params = koffi.alloc('mpv_render_param', 6)
    const entries = [
      { type: MPV_RENDER_PARAM_NEXT_FRAME_INFO, data: this.fiPtr },
      { type: MPV_RENDER_PARAM_SW_SIZE, data: this.sizePtr },
      { type: MPV_RENDER_PARAM_SW_FORMAT, data: 'rgb0' },
      { type: MPV_RENDER_PARAM_SW_STRIDE, data: this.stridePtr },
      { type: MPV_RENDER_PARAM_SW_POINTER, data: koffi.address(this.frameBuf) },
      { type: 0, data: null },
    ]
    entries.forEach((e, i) => koffi.encode(params, i * 16, 'mpv_render_param', e))
    this.params = params
  }

  private renderFrame(): void {
    if (!this.loaded || !this.frameBuf || !this.params || !this.api || !this.rc || !koffi) return
    const upd = this.api.mpv_render_context_update(this.rc)
    if (!upd) return
    const rr = this.api.mpv_render_context_render(this.rc, this.params)
    // 注意：不依赖 NEXT_FRAME_INFO.flags 判断"新帧"（libmpv-test 实证该 flags 不可靠但
    // render() 返回 0 即帧数据已写入 SW_POINTER；update 非 0 已保证有新帧可渲染）
    if (rr !== 0) return
    // 零拷贝：mpv 直接渲染进了 Node Buffer（IPC 序列化时 structured clone 才拷贝一次）
    this.handlers.onFrame?.({ buffer: this.frameBuf, width: this.renderW, height: this.renderH })
  }
}
