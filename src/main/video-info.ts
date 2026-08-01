import { openSync, readSync, fstatSync, closeSync } from 'fs'

// 文件头部读取大小（ftyp box 通常在此范围内）
const HEAD_CHUNK = 64 * 1024  // 64KB
// 文件尾部读取大小（moov box 通常在此范围内，≈100KB 对于大多数文件足够）
const TAIL_CHUNK = 2 * 1024 * 1024  // 2MB

/**
 * MP4 Box 结构：4B size(BE) + 4B type(ASCII) + data
 * size 包含 8B 头部自身；size=0 → 到文件末尾；size=1 → 后续 8B 为 64-bit size
 */
interface Box {
  type: string
  offset: number   // data 起始偏移
  size: number     // data 字节数
  next: number     // 下一个 box 的偏移
}

function readBox(buf: Buffer, off: number): Box | null {
  if (off + 8 > buf.length) return null

  let sz = buf.readUInt32BE(off)
  const type = buf.toString('ascii', off + 4, off + 8)

  let headerBytes = 8
  if (sz === 1) {
    // 64-bit 扩展大小
    const hi = buf.readUInt32BE(off + 8)
    const lo = buf.readUInt32BE(off + 12)
    sz = Number((BigInt(hi) << 32n) | BigInt(lo))
    headerBytes = 16
  } else if (sz === 0) {
    sz = buf.length - off
  }

  const dataOff = off + headerBytes
  const dataSize = sz - headerBytes
  return { type, offset: dataOff, size: dataSize, next: off + sz }
}

function findBox(buf: Buffer, parent: Box, targetType: string): Box | null {
  let off = parent.offset
  const end = parent.offset + parent.size
  while (off + 8 <= end) {
    const box = readBox(buf, off)
    if (!box) break
    if (box.type === targetType) return box
    off = box.next
  }
  return null
}

/** 收集某个 box 下所有指定类型的子 box */
function collectBoxes(buf: Buffer, parent: Box, targetType: string): Box[] {
  const result: Box[] = []
  let off = parent.offset
  const end = parent.offset + parent.size
  while (off + 8 <= end) {
    const box = readBox(buf, off)
    if (!box) break
    if (box.type === targetType) result.push(box)
    off = box.next
  }
  return result
}

function readFixed16_16(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off) / 65536
}

export interface VideoStreamMeta {
  width: number
  height: number
  codec: string
  fps: number           // 帧率（average），0 = 未知
  exactBitrate: number  // bps，精确视频流码率
}

/**
 * 解析 MP4 文件，提取视频流精确码率。
 * 遍历 moov → trak → (tkhd/mdia) 找到视频轨道，
 * 然后从 stsz 求和样本大小 / mdhd 时长计算精确码率。
 */
/** 在缓冲区中搜索 moov box */
function findMoovInBuffer(buf: Buffer): Box | null {
  let off = 0
  while (off + 8 <= buf.length) {
    const box = readBox(buf, off)
    if (!box) break
    if (box.type === 'moov') return box
    off = box.next
  }
  return null
}

export function parseMP4Meta(filePath: string): VideoStreamMeta | null {
  let fd: number | undefined
  try {
    fd = openSync(filePath, 'r')
    const fileSize = fstatSync(fd).size
    if (fileSize < 24) { closeSync(fd); return null }

    // 读取文件头部（含 ftyp box）
    const headSize = Math.min(HEAD_CHUNK, fileSize)
    const headBuf = Buffer.alloc(headSize)
    readSync(fd, headBuf, 0, headSize, 0)

    // 确认是 MP4
    if (headBuf.length < 24) { closeSync(fd); return null }
    const ftyp = readBox(headBuf, 0)
    if (!ftyp || ftyp.type !== 'ftyp') { closeSync(fd); return null }

    // moov box 大多数情况在文件末尾（流式优化 MP4），也可能在头部
    // 先检查头部是否就有完整的 moov
    let moov: Box | null = findMoovInBuffer(headBuf)
    let fullBuf: Buffer | null = null

    if (!moov) {
      // 读取文件尾部，拼接后用完整缓冲区解析
      const tailSize = Math.min(TAIL_CHUNK, fileSize)
      const tailBuf = Buffer.alloc(tailSize)
      readSync(fd, tailBuf, 0, tailSize, fileSize - tailSize)
      closeSync(fd); fd = undefined

      // 合并头部 + 尾部（moov 引用的偏移需要从绝对偏移转为合并缓冲区的偏移）
      // 尾部缓冲区偏移量 = fileSize - tailSize
      // 合并后：头(0→headSize-1) + 尾(fileSize-tailSize→fileSize-1) 但这里不是连续的
      // 简化：直接用尾部缓冲区查找 moov，因为 moov 的 box 结构是自包含的
      const tailMoov = findMoovInBuffer(tailBuf)
      if (tailMoov) {
        // moov 在尾部找到，调整偏移到尾部缓冲区坐标系
        moov = tailMoov
        fullBuf = tailBuf
      } else {
        // 最后尝试：构建合并缓冲区
        fullBuf = Buffer.concat([headBuf, tailBuf])
        moov = findMoovInBuffer(fullBuf)
      }
    } else {
      // moov 在头部找到，直接用头部缓冲区
      fullBuf = headBuf
      closeSync(fd); fd = undefined
    }

    if (fd !== undefined) { closeSync(fd); fd = undefined }
    if (!moov || !fullBuf) return null

    // 以下与原代码相同，使用 fullBuf 和 moov 进行解析
    const buf = fullBuf

  // 遍历 trak，找视频轨道
  const traks = collectBoxes(buf, moov, 'trak')
  for (const trak of traks) {
    // 通过 hdlr 判断是否为视频轨道 ("vide")
    const mdia = findBox(buf, trak, 'mdia')
    if (!mdia) continue
    const hdlr = findBox(buf, mdia, 'hdlr')
    if (!hdlr) continue
    // hdlr 格式: 1B version + 3B flags + 4B component_type(固定为0) + 4B subtype
    // subtype 在 offset+8 处（跳过 version+flags+comp_type）
    if (hdlr.size < 12) continue
    const subtype = buf.toString('ascii', hdlr.offset + 8, hdlr.offset + 12)
    if (subtype !== 'vide') continue

    // --- 提取分辨率 (tkhd) ---
    const tkhd = findBox(buf, trak, 'tkhd')
    if (!tkhd) continue
    // tkhd version 0: 1B ver + 3B flags + 4B creation + 4B modification
    //   + 4B trackID + 4B reserved + 4B duration ... + 8B(36) matrix start
    // width 在 offset+76(ver0) 或 offset+84(ver1)?? 
    // 实际上 tkhd v0 结构在 byte 76(0x4C) 之后有 36B 矩阵，接着是 width(4B) 和 height(4B)
    // 简化：tkhd 最后 8 字节就是 width + height (16.16 fixed)
    if (tkhd.size < 8) continue
    const wOff = tkhd.offset + tkhd.size - 8
    const width = readFixed16_16(buf, wOff)
    const height = readFixed16_16(buf, wOff + 4)

    // --- 提取时长 (mdhd) ---
    const mdhd = findBox(buf, mdia, 'mdhd')
    if (!mdhd) continue
    const mdhdVer = buf.readUInt8(mdhd.offset)
    let timescale: number
    let duration: number
    if (mdhdVer === 0) {
      // v0: 1B ver + 3B flags + 4B ctime + 4B mtime + 4B timescale + 4B duration
      timescale = buf.readUInt32BE(mdhd.offset + 12)
      duration = buf.readUInt32BE(mdhd.offset + 16)
    } else {
      // v1: + 8B ctime + 8B mtime + 4B timescale + 8B duration
      timescale = buf.readUInt32BE(mdhd.offset + 20)
      const hi = buf.readUInt32BE(mdhd.offset + 24)
      const lo = buf.readUInt32BE(mdhd.offset + 28)
      duration = Number((BigInt(hi) << 32n) | BigInt(lo))
    }
    const durationSec = timescale > 0 ? duration / timescale : 0

    // --- 提取编解码器 (stsd) ---
    const minf = findBox(buf, mdia, 'minf')
    const stbl = minf ? findBox(buf, minf, 'stbl') : null
    let codec = 'H.264'
    if (stbl) {
      const stsd = findBox(buf, stbl, 'stsd')
      if (stsd && stsd.size >= 24) {
        // stsd: 1B ver + 3B flags + 4B entry_count, then entries
        // 每个 entry: 4B size + 4B format + 6B reserved + 2B data_ref_index + ...
        const format = buf.toString('ascii', stsd.offset + 12, stsd.offset + 16)
        if (format === 'avc1' || format === 'avc3') codec = 'H.264'
        else if (format === 'hvc1' || format === 'hev1') codec = 'H.265/HEVC'
        else if (format === 'vp09') codec = 'VP9'
        else if (format === 'av01') codec = 'AV1'
      }
    }

    // --- 提取视频流总字节数和帧数 (stsz) ---
    let totalStreamBytes = 0
    let sampleCount = 0
    if (stbl) {
      const stsz = findBox(buf, stbl, 'stsz')
      if (stsz && stsz.size >= 12) {
        const sampleSize = buf.readUInt32BE(stsz.offset + 4)
        sampleCount = buf.readUInt32BE(stsz.offset + 8)
        if (sampleSize > 0) {
          // 所有样本大小相同
          totalStreamBytes = sampleSize * sampleCount
        } else {
          // 每个样本大小单独存储（4B × sampleCount）
          const listOff = stsz.offset + 12
          for (let i = 0; i < sampleCount && listOff + (i + 1) * 4 <= stsz.offset + stsz.size; i++) {
            totalStreamBytes += buf.readUInt32BE(listOff + i * 4)
          }
        }
      }
    }

    // 计算精确码率
    const exactBitrate = durationSec > 0 && totalStreamBytes > 0
      ? Math.round((totalStreamBytes * 8) / durationSec)
      : 0

    // 计算帧率（samples / duration）
    const fps = durationSec > 0 && sampleCount > 0
      ? Math.round((sampleCount / durationSec) * 100) / 100
      : 0

    if (width > 0 && height > 0) {
      return { width, height, codec, fps, exactBitrate }
    }
  }

  return null
  } catch (err) {
    if (fd !== undefined) { try { closeSync(fd) } catch { /* ok */ } }
    console.warn('[AniBox] Failed to parse MP4 meta:', filePath, err instanceof Error ? err.message : String(err))
    return null
  }
}

/** Chromium 不支持的音频编码 */
const UNSUPPORTED_AUDIO_CODECS = new Set([
  'ac-3',   // Dolby Digital
  'ec-3',   // Dolby Digital Plus / E-AC-3
  'dtsc',   // DTS
  'dtsh',   // DTS-HD
  'dtse',   // DTS Express
  'mlpa',   // Dolby TrueHD
])

export interface AudioCodecInfo {
  codec: string
  supported: boolean
}

/**
 * 快速检测 MP4 文件音频编码是否被 Chromium 支持
 * 只读文件尾部 moov 原子中的音频轨编码信息
 */
export function detectAudioCodec(filePath: string): AudioCodecInfo | null {
  let fd: number | undefined
  try {
    fd = openSync(filePath, 'r')
    const fileSize = fstatSync(fd).size
    if (fileSize < 24) return null

    // 只检查尾部（moov 通常在末尾）
    const tailSize = Math.min(TAIL_CHUNK, fileSize)
    const buf = Buffer.alloc(tailSize)
    readSync(fd, buf, 0, tailSize, fileSize - tailSize)
    closeSync(fd); fd = undefined

    const moov = findMoovInBuffer(buf)
    if (!moov) return null

    const traks = collectBoxes(buf, moov, 'trak')
    for (const trak of traks) {
      const mdia = findBox(buf, trak, 'mdia')
      if (!mdia) continue
      const hdlr = findBox(buf, mdia, 'hdlr')
      if (!hdlr || hdlr.size < 12) continue
      const subtype = buf.toString('ascii', hdlr.offset + 8, hdlr.offset + 12)
      if (subtype !== 'soun') continue

      // 找到音频轨 → 提取编码格式 (stsd)
      const minf = findBox(buf, mdia, 'minf')
      const stbl = minf ? findBox(buf, minf, 'stbl') : null
      if (!stbl) continue
      const stsd = findBox(buf, stbl, 'stsd')
      if (!stsd || stsd.size < 24) continue
      const codec = buf.toString('ascii', stsd.offset + 12, stsd.offset + 16).trim()

      if (codec && codec.length === 4) {
        return {
          codec,
          supported: !UNSUPPORTED_AUDIO_CODECS.has(codec)
        }
      }
    }
    return null
  } catch {
    return null
  } finally {
    if (fd !== undefined) { try { closeSync(fd) } catch { /* ok */ } }
  }
}
