// anibox:// 自定义协议：本地文件流式播放（Range 请求支持）
import { app, protocol } from 'electron'
import { createReadStream, statSync, existsSync } from 'fs'
import { Readable } from 'stream'

const isDev = !app.isPackaged

export const MIME: Record<string, string> = {
  // 视频格式
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.flv': 'video/x-flv',
  '.f4v': 'video/mp4',
  '.ts': 'video/mp2t',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.ogg': 'video/ogg',
  '.ogv': 'video/ogg',
  '.ogm': 'video/ogg',
  '.wmv': 'video/x-ms-wmv',
  '.asf': 'video/x-ms-asf',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.mpe': 'video/mpeg',
  '.vob': 'video/mpeg',
  '.evo': 'video/mpeg',
  '.divx': 'video/x-msvideo',
  '.rmvb': 'application/vnd.rn-realmedia',
  '.rm': 'application/vnd.rn-realmedia',
  '.qt': 'video/quicktime',
  '.mxf': 'application/mxf',
  // 图片格式
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

function fileStream(path: string): ReadableStream {
  const ns = createReadStream(path)
  return Readable.toWeb(ns) as ReadableStream
}

function rangeStream(path: string, start: number, end: number): ReadableStream {
  const ns = createReadStream(path, { start, end })
  return Readable.toWeb(ns) as ReadableStream
}

export function registerProtocol(): void {
  protocol.handle('anibox', (req) => {
    try {
      const url = new URL(req.url)
      const fp = url.searchParams.get('path') || ''
      if (isDev)
        console.log('[AniBox] Protocol request:', {
          url: req.url,
          method: req.method,
          path: fp,
          exists: fp ? existsSync(fp) : false,
          hasRange: req.headers.get('range') ? true : false,
        })
      if (!fp || !existsSync(fp)) {
        console.warn('[AniBox] Protocol 404:', fp)
        return new Response('Not Found', { status: 404 })
      }

      const st = statSync(fp)
      const mime =
        MIME['.' + (fp.split('.').pop()?.toLowerCase() || '')] || 'application/octet-stream'
      const isImage = mime.startsWith('image/')

      // 图片不需要 Range 请求，直接返回
      if (isImage) {
        if (isDev) console.log('[AniBox] Protocol serving image:', fp, st.size, 'bytes')
        return new Response(fileStream(fp), {
          status: 200,
          headers: {
            'Content-Length': String(st.size),
            'Content-Type': mime,
            'Cache-Control': 'max-age=86400',
          },
        })
      }

      const range = req.headers.get('range')

      if (range) {
        const [s, e] = range
          .replace(/bytes=/, '')
          .split('-')
          .map(Number)
        const end = e || st.size - 1
        if (isDev)
          console.log('[AniBox] Protocol range response:', fp, `bytes ${s}-${end}/${st.size}`)
        const body = rangeStream(fp, s, end)
        return new Response(body, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${s}-${end}/${st.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - s + 1),
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      if (isDev) console.log('[AniBox] Protocol full response:', fp, st.size, 'bytes, type:', mime)
      return new Response(fileStream(fp), {
        status: 200,
        headers: {
          'Content-Length': String(st.size),
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (err) {
      console.error('[AniBox] Protocol handler error:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  })
}
