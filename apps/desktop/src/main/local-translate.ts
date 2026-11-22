/**
 * 本地翻译引擎 — 基于 Helsinki-NLP/opus-mt 系列
 * EN→ZH: Xenova/opus-mt-en-zh | JA→EN: Xenova/opus-mt-ja-en (链式 JA→EN→ZH)
 */

import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, accessSync, constants } from 'fs'

let pipeline: any = null
let modelLoading = false
let modelReady = false
let loadError: string | null = null

const MODEL_NAME = 'Xenova/opus-mt-en-zh'
const JA_MODEL_NAME = 'Xenova/opus-mt-ja-en'

let jaPipeline: any = null
let jaModelLoading = false
let jaModelReady = false
let jaLoadError: string | null = null

function getModelCacheDir(): string {
  // 优先存到项目目录（便携），不可写时回退到 userData
  const projectDir = join(dirname(__dirname), '..', 'models')
  try {
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true })
    accessSync(projectDir, constants.W_OK)
    return projectDir
  } catch {
    const userDir = join(app.getPath('userData'), 'models')
    if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true })
    return userDir
  }
}

/**
 * 加载翻译模型（首次调用时自动触发）
 */
export async function loadModel(onProgress?: (msg: string) => void): Promise<boolean> {
  if (modelReady) return true
  if (loadError) {
    onProgress?.(`模型加载失败: ${loadError}`)
    return false
  }
  if (modelLoading) {
    // 等待加载完成
    for (let i = 0; i < 60; i++) {
      if (modelReady) return true
      if (loadError) return false
      await new Promise((r) => setTimeout(r, 1000))
    }
    return false
  }

  modelLoading = true
  onProgress?.('正在初始化翻译引擎...')

  try {
    // 动态导入，避免未安装时的启动崩溃
    const { pipeline: pipe, env } = await import('@xenova/transformers')

    // 诊断：确认 ONNX Runtime 后端和 GPU 支持
    try {
      const ort = await import('onnxruntime-node')
      console.log('[AniBox] ONNX backends:', JSON.stringify(ort.listSupportedBackends?.()))
    } catch {}

    // 设置模型缓存目录
    env.cacheDir = getModelCacheDir()
    // 使用 HuggingFace 国内镜像加速
    env.remoteHost = 'https://hf-mirror.com'
    // 不在浏览器上下文中，跳过 localModel 检查
    env.allowLocalModels = false
    // 不重复下载已缓存的模型
    env.useBrowserCache = false

    onProgress?.('正在下载翻译模型 (约 300MB，仅首次需要)...')

    pipeline = await pipe('translation', MODEL_NAME, {
      progress_callback: (progress: any) => {
        if (progress?.status === 'downloading') {
          const pct = progress?.progress ? Math.round(progress.progress) : 0
          const file = progress?.file || ''
          onProgress?.(`下载模型... ${pct}%${file ? ` (${file})` : ''}`)
        } else if (progress?.status === 'loading') {
          onProgress?.('加载模型中...')
        }
      },
    })

    modelReady = true
    modelLoading = false
    onProgress?.('翻译引擎就绪')
    console.log('[AniBox] Translation model loaded:', MODEL_NAME)
    return true
  } catch (err: any) {
    modelLoading = false
    loadError = err?.message || String(err)
    console.error('[AniBox] Failed to load translation model:', loadError)
    return false
  }
}

/**
 * 翻译一段英文文本为中文
 * @returns 翻译后的中文文本，失败时返回原文
 */
export async function translateEnToZh(text: string): Promise<string> {
  if (!text?.trim()) return text

  // 如果已经是中文，直接返回
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
  if (chineseCount / text.length > 0.5) return text

  if (!modelReady) {
    const ok = await loadModel()
    if (!ok) return text
  }

  try {
    // 分段处理长文本（每段最多 400 字符，按句子边界断开）
    const segments = splitText(text, 400)
    const translated: string[] = []

    for (const seg of segments) {
      if (!seg.trim()) {
        translated.push(seg)
        continue
      }
      // 如果段落已经大部分是中文，跳过
      const segCn = (seg.match(/[\u4e00-\u9fff]/g) || []).length
      if (segCn / seg.length > 0.5) {
        translated.push(seg)
        continue
      }

      const result = await pipeline!(seg, {
        max_new_tokens: Math.ceil(seg.length * 1.5),
      })

      // pipeline 返回格式: [{ translation_text: "..." }]
      const translatedText = Array.isArray(result)
        ? result[0]?.translation_text || seg
        : result?.translation_text || seg

      translated.push(translatedText)
    }

    return translated.join('')
  } catch (err: any) {
    console.error('[AniBox] Translation error:', err?.message)
    return text
  }
}

// ========= JA→EN 模型 =========

export async function loadJaModel(onProgress?: (msg: string) => void): Promise<boolean> {
  if (jaModelReady) return true
  if (jaLoadError) { onProgress?.(`日文模型加载失败: ${jaLoadError}`); return false }
  if (jaModelLoading) {
    for (let i = 0; i < 60; i++) { if (jaModelReady) return true; if (jaLoadError) return false; await new Promise((r) => setTimeout(r, 1000)) }
    return false
  }
  jaModelLoading = true
  onProgress?.('正在加载日文翻译引擎...')
  try {
    const { pipeline: pipe, env } = await import('@xenova/transformers')
    env.cacheDir = getModelCacheDir()
    env.backends.onnx.executionProviders = ['dml', 'cpu']
    env.remoteHost = 'https://hf-mirror.com'
    env.allowLocalModels = false; env.useBrowserCache = false
    onProgress?.('下载日文模型(首次约 300MB)...')
    jaPipeline = await pipe('translation', JA_MODEL_NAME, {
      progress_callback: (p: any) => {
        if (p?.status === 'downloading') onProgress?.(`下载日文模型... ${Math.round(p.progress || 0)}%`)
        else if (p?.status === 'loading') onProgress?.('加载日文模型中...')
      },
    })
    jaModelReady = true; jaModelLoading = false
    onProgress?.('日文引擎就绪')
    return true
  } catch (err: any) { jaModelLoading = false; jaLoadError = err?.message || String(err); return false }
}

export async function translateJaToEn(text: string): Promise<string> {
  if (!text?.trim()) return text
  if (!jaModelReady) { const ok = await loadJaModel(); if (!ok) return text }
  try {
    const segs = splitText(text, 400); const out: string[] = []
    for (const s of segs) {
      if (!s.trim()) { out.push(s); continue }
      const r = await jaPipeline!(s, { max_new_tokens: Math.ceil(s.length * 2) })
      out.push(Array.isArray(r) ? r[0]?.translation_text || s : r?.translation_text || s)
    }
    return out.join('')
  } catch { return text }
}

export async function translateJaToZh(text: string): Promise<string> {
  if (!text?.trim()) return text
  const cn = (text.match(/[\u4e00-\u9fff]/g) || []).length
  if (cn / text.length > 0.5) return text
  try { return await translateEnToZh(await translateJaToEn(text)) } catch { return text }
}

/**
 * 按句子边界将文本拆分为不超过 maxLen 的段落
 */
function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]

  const segments: string[] = []
  // 按句号、换行、分号等自然边界拆分
  const sentences = text.split(/(?<=[.!?\n])\s+/)

  let current = ''
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      segments.push(current.trim())
      current = sentence
    } else {
      current += (current ? ' ' : '') + sentence
    }
  }
  if (current.trim()) segments.push(current.trim())

  return segments.length > 0 ? segments : [text]
}

/**
 * 获取翻译引擎状态
 */
export function getTranslateStatus(): {
  ready: boolean; loading: boolean; error: string | null; modelName: string
  jaReady: boolean; jaLoading: boolean; jaError: string | null; jaModelName: string
} {
  return { ready: modelReady, loading: modelLoading, error: loadError, modelName: MODEL_NAME,
    jaReady: jaModelReady, jaLoading: jaModelLoading, jaError: jaLoadError, jaModelName: JA_MODEL_NAME }
}
