/**
 * 格式化工具函数
 */

export function formatTimeShort(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatBitrate(bps: number): string {
  if (bps < 1000) return `${bps} bps`
  if (bps < 1000 * 1000) return `${(bps / 1000).toFixed(0)} kbps`
  return `${(bps / (1000 * 1000)).toFixed(1)} Mbps`
}
