/**
 * DeepSeek API 翻译模块
 * API Key 通过 store 持久化存储，启动时从 store 读取
 */

import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const AI_CONFIG_PATH = join(app.getPath('userData'), 'ai-config.json')

let apiKey: string | null = null

function loadKey(): string | null {
  try {
    if (existsSync(AI_CONFIG_PATH)) {
      const raw = readFileSync(AI_CONFIG_PATH, 'utf-8')
      const config = JSON.parse(raw)
      return config.apiKey || null
    }
  } catch {}
  return null
}

function saveKey(key: string) {
  try {
    writeFileSync(AI_CONFIG_PATH, JSON.stringify({ apiKey: key }), 'utf-8')
  } catch {}
}

export function configureAI(key: string) {
  apiKey = key
  saveKey(key)
}

export function getAIKey(): string | null {
  if (!apiKey) {
    apiKey = loadKey()
  }
  return apiKey
}

/**
 * 用 DeepSeek 翻译文本
 */
export async function translateWithAI(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const key = getAIKey()
  if (!key) throw new Error('AI_API_KEY_MISSING')

  const sourceLabel = sourceLang === 'ja' ? '日语' : sourceLang === 'en' ? '英语' : '任意语言'

  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `你是一个动漫翻译助手。将以下${sourceLabel}文本翻译成中文。只输出翻译结果，不要加任何解释。如果文本已经是中文，直接原样返回。`,
        },
        { role: 'user', content: text },
      ],
      max_tokens: 1024,
      temperature: 0.1,
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`AI API 错误 ${resp.status}: ${err}`)
  }

  const data = await resp.json()
  return data.choices?.[0]?.message?.content?.trim() || text
}
