/**
 * 全局类型补充 — Chromium 特有 API 不在标准 TypeScript lib.dom 中：
 * - HTMLVideoElement.audioTracks：Chromium 支持多音轨切换，标准类型缺失。
 */
export {}

declare global {
  interface HTMLVideoElement {
    /** Chromium 扩展：音轨列表（可能为 undefined；使用前需判空） */
    audioTracks?: {
      length: number
      [index: number]: {
        enabled: boolean
        label: string
        language: string
      }
    }
  }
}
