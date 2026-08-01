import { spawn, ChildProcess, execSync } from 'child_process'
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'

// ========== Whisper 语音识别 ==========

let whisperProcess: ChildProcess | null = null
let whisperModelPath = ''
let whisperBinaryPath = ''

export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3'

export interface WhisperConfig {
  binaryPath: string // whisper.cpp 可执行文件路径
  modelPath: string // 模型文件路径（如 ggml-small.bin）
  modelSize: WhisperModelSize
}

export interface WhisperResult {
  segments: Array<{
    start: number
    end: number
    text: string
  }>
  fullText: string
  language: string
  duration: number
}

/**
 * 设置 Whisper 配置
 */
export function setWhisperConfig(config: WhisperConfig): void {
  whisperBinaryPath = config.binaryPath
  whisperModelPath = config.modelPath
}

/**
 * 检查 Whisper 是否可用
 */
export function isWhisperAvailable(): boolean {
  return existsSync(whisperBinaryPath) && existsSync(whisperModelPath)
}

/**
 * 获取 Whisper 状态信息
 */
export function getWhisperStatus(): {
  available: boolean
  binaryExists: boolean
  modelExists: boolean
  modelPath: string
  binaryPath: string
} {
  return {
    available: isWhisperAvailable(),
    binaryExists: existsSync(whisperBinaryPath),
    modelExists: existsSync(whisperModelPath),
    modelPath: whisperModelPath,
    binaryPath: whisperBinaryPath,
  }
}

/**
 * 获取 whisper.cpp 默认路径（开发/打包）
 */
export function getDefaultWhisperPaths(): { binary: string; models: string } {
  if (app.isPackaged) {
    return {
      binary: join(process.resourcesPath, 'whisper', 'whisper-cli.exe'),
      models: join(process.resourcesPath, 'whisper', 'models'),
    }
  }
  return {
    binary: join(__dirname, '../../whisper/whisper-cli.exe'),
    models: join(__dirname, '../../whisper/models'),
  }
}

/**
 * 从音视频文件中提取音频并运行 Whisper 识别
 * 使用 FFmpeg 提取音频 → whisper.cpp 转文字 → 生成 SRT 字幕
 */
export async function transcribeWithWhisper(
  videoPath: string,
  onProgress?: (msg: string) => void,
): Promise<WhisperResult | null> {
  if (!isWhisperAvailable()) {
    throw new Error('Whisper 未配置。请下载 whisper.cpp 和模型文件。')
  }

  const audioDir = join(dirname(videoPath), '.anibox_temp')
  if (!existsSync(audioDir)) mkdirSync(audioDir, { recursive: true })

  const audioPath = join(audioDir, 'extracted_audio.wav')
  const outputPath = videoPath.replace(/\.[^.]+$/, '') + '.whisper.srt'
  const csvPath = join(audioDir, 'output.csv')

  try {
    // Step 1: 用 FFmpeg 提取音频为 16kHz mono WAV
    onProgress?.('正在提取音频...')
    await runCommand('ffmpeg', [
      '-y',
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      audioPath,
    ])

    if (!existsSync(audioPath)) {
      throw new Error('音频提取失败')
    }

    // Step 2: 运行 whisper.cpp
    onProgress?.('正在语音识别...')
    await runCommand(whisperBinaryPath, [
      '-m',
      whisperModelPath,
      '-f',
      audioPath,
      '-l',
      'ja', // 默认日语（动漫最常见）
      '-osrt', // 输出 SRT 字幕
      '-of',
      outputPath.replace('.srt', ''),
      '-ocsv', // 输出 CSV（含时间戳）
      '-of',
      join(audioDir, 'output'),
    ])

    // Step 3: 读取结果
    const srtFile = outputPath
    if (!existsSync(srtFile)) {
      throw new Error('Whisper 未生成字幕文件')
    }

    const srtContent = readFileSync(srtFile, 'utf-8')
    const segments = parseSrtToSegments(srtContent)

    // 复制字幕文件到视频目录
    const finalSrtPath = videoPath.replace(/\.[^.]+$/, '') + '.whisper.ja.srt'
    writeFileSync(finalSrtPath, srtContent)

    onProgress?.('识别完成！')

    return {
      segments,
      fullText: segments.map((s) => s.text).join(' '),
      language: 'ja',
      duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    }
  } catch (err) {
    console.error('[AniBox] Whisper error:', err)
    throw err
  } finally {
    // 清理临时文件
    try {
      if (existsSync(audioPath)) {
        // 保留音频文件供后续使用，不要删除
      }
    } catch {
      /* ok */
    }
  }
}

function parseSrtToSegments(srt: string): Array<{ start: number; end: number; text: string }> {
  const segments: Array<{ start: number; end: number; text: string }> = []
  const blocks = srt.trim().split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) continue

    const tsMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
    )
    if (!tsMatch) continue

    const start =
      parseInt(tsMatch[1]) * 3600 +
      parseInt(tsMatch[2]) * 60 +
      parseInt(tsMatch[3]) +
      parseInt(tsMatch[4]) / 1000
    const end =
      parseInt(tsMatch[5]) * 3600 +
      parseInt(tsMatch[6]) * 60 +
      parseInt(tsMatch[7]) +
      parseInt(tsMatch[8]) / 1000
    const text = lines.slice(2).join('\n').trim()

    segments.push({ start, end, text })
  }

  return segments
}

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr}`))
    })

    proc.on('error', (err) => reject(err))
  })
}

// ========== AI 翻译 ==========

export type TranslationEngine = 'google' | 'deepl' | 'libre'

export interface TranslationConfig {
  engine: TranslationEngine
  apiKey?: string // DeepL API Key
  apiUrl?: string // LibreTranslate 服务器 URL
}

let translationConfig: TranslationConfig = { engine: 'google' }

export function setTranslationConfig(config: Partial<TranslationConfig>): void {
  translationConfig = { ...translationConfig, ...config }
}

/**
 * 翻译文本（日/英 → 中文）
 */
export async function translateText(
  text: string,
  fromLang: string = 'ja',
  toLang: string = 'zh-CN',
): Promise<string> {
  if (!text.trim()) return ''

  try {
    switch (translationConfig.engine) {
      case 'deepl':
        return await translateDeepL(text, fromLang, toLang)
      case 'libre':
        return await translateLibre(text, fromLang, toLang)
      case 'google':
      default:
        return await translateGoogle(text, fromLang, toLang)
    }
  } catch {
    // 回退到 Google
    return await translateGoogle(text, fromLang, toLang).catch(() => text)
  }
}

async function translateGoogle(text: string, from: string, to: string): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single?' +
    new URLSearchParams({
      client: 'gtx',
      sl: from === 'ja' ? 'ja' : 'auto',
      tl: to,
      dt: 't',
      ie: 'UTF-8',
      oe: 'UTF-8',
      q: text.substring(0, 1500),
    }).toString()

  // 最多重试 3 次
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(8000 + attempt * 2000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      })

      if (!resp.ok) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
          continue
        }
        throw new Error(`HTTP ${resp.status}`)
      }

      const data = (await resp.json()) as any
      const result = (data[0] || []).map((item: any) => item[0] || '').join('')

      if (result && result !== text) return result
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        continue
      }
      return text
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        continue
      }
      return text
    }
  }
  return text
}

async function translateDeepL(text: string, from: string, to: string): Promise<string> {
  if (!translationConfig.apiKey) throw new Error('DeepL API Key 未配置')

  const targetLang = to === 'zh-CN' ? 'ZH' : 'EN-US'
  const resp = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${translationConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang,
      source_lang: from === 'ja' ? 'JA' : 'EN',
    }),
    signal: AbortSignal.timeout(5000),
  })

  if (!resp.ok) throw new Error(`DeepL HTTP ${resp.status}`)
  const data = (await resp.json()) as any
  return data.translations?.[0]?.text || text
}

async function translateLibre(text: string, from: string, to: string): Promise<string> {
  const apiUrl = translationConfig.apiUrl || 'https://translate.argosopentech.com'
  const resp = await fetch(`${apiUrl}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: from,
      target: to === 'zh-CN' ? 'zh' : to,
      format: 'text',
    }),
    signal: AbortSignal.timeout(5000),
  })

  if (!resp.ok) throw new Error(`Libre HTTP ${resp.status}`)
  const data = (await resp.json()) as any
  return data.translatedText || text
}

/**
 * 批量翻译字幕段落（带进度回调）
 */
export async function translateSubtitleSegments(
  segments: Array<{ start: number; end: number; text: string }>,
  fromLang: string = 'ja',
  toLang: string = 'zh-CN',
  onProgress?: (current: number, total: number) => void,
): Promise<Array<{ start: number; end: number; text: string }>> {
  const results: Array<{ start: number; end: number; text: string }> = []
  const total = segments.length

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const translated = await translateText(seg.text, fromLang, toLang)
    results.push({ ...seg, text: translated })
    onProgress?.(i + 1, total)
  }

  return results
}

// ========== 日语词典（生词点查） ==========

// 精简 JMdict 日语词典（常用词条）
// 完整词典可通过下载 JMdict XML 文件扩展
interface DictEntry {
  word: string
  reading: string
  meanings: Array<{
    pos: string // 词性
    gloss: string // 释义
  }>
}

// 内置常用动漫词汇词典
const BUILTIN_DICT: DictEntry[] = [
  { word: 'ありがとう', reading: 'arigatou', meanings: [{ pos: '感', gloss: '谢谢' }] },
  {
    word: 'すみません',
    reading: 'sumimasen',
    meanings: [{ pos: '感', gloss: '对不起；不好意思；谢谢（用于麻烦他人时）' }],
  },
  { word: 'おはよう', reading: 'ohayou', meanings: [{ pos: '感', gloss: '早上好' }] },
  {
    word: 'こんにちは',
    reading: 'konnichiwa',
    meanings: [{ pos: '感', gloss: '你好（白天问候）' }],
  },
  { word: 'こんばんは', reading: 'konbanwa', meanings: [{ pos: '感', gloss: '晚上好' }] },
  { word: 'さようなら', reading: 'sayounara', meanings: [{ pos: '感', gloss: '再见' }] },
  {
    word: 'お願いします',
    reading: 'onegaishimasu',
    meanings: [{ pos: '慣', gloss: '拜托了；请（礼貌请求）' }],
  },
  {
    word: 'いただきます',
    reading: 'itadakimasu',
    meanings: [{ pos: '慣', gloss: '我开动了（饭前用语）' }],
  },
  {
    word: 'ごちそうさま',
    reading: 'gochisousama',
    meanings: [{ pos: '慣', gloss: '我吃好了（饭后用语）' }],
  },
  { word: '大丈夫', reading: 'daijoubu', meanings: [{ pos: '形動', gloss: '没关系；没问题' }] },
  { word: 'すごい', reading: 'sugoi', meanings: [{ pos: '形', gloss: '厉害；了不起' }] },
  { word: 'かわいい', reading: 'kawaii', meanings: [{ pos: '形', gloss: '可爱' }] },
  {
    word: 'やばい',
    reading: 'yabai',
    meanings: [{ pos: '形', gloss: '糟了；不妙；厉害（口语）' }],
  },
  { word: 'ちょっと', reading: 'chotto', meanings: [{ pos: '副', gloss: '稍微；有点' }] },
  { word: 'もう', reading: 'mou', meanings: [{ pos: '副', gloss: '已经；再也' }] },
  { word: 'まだ', reading: 'mada', meanings: [{ pos: '副', gloss: '还；尚未' }] },
  { word: 'ずっと', reading: 'zutto', meanings: [{ pos: '副', gloss: '一直；始终' }] },
  { word: '本当', reading: 'hontou', meanings: [{ pos: '名/形動', gloss: '真的；真实' }] },
  { word: '友達', reading: 'tomodachi', meanings: [{ pos: '名', gloss: '朋友' }] },
  { word: '先生', reading: 'sensei', meanings: [{ pos: '名', gloss: '老师；医生；律师（尊称）' }] },
  { word: '先輩', reading: 'senpai', meanings: [{ pos: '名', gloss: '前辈；学长/学姐' }] },
  { word: '後輩', reading: 'kouhai', meanings: [{ pos: '名', gloss: '后辈；学弟/学妹' }] },
  { word: '敵', reading: 'teki', meanings: [{ pos: '名', gloss: '敌人' }] },
  { word: '味方', reading: 'mikata', meanings: [{ pos: '名', gloss: '伙伴；我方' }] },
  { word: '力', reading: 'chikara', meanings: [{ pos: '名', gloss: '力量；力气' }] },
  { word: '魔法', reading: 'mahou', meanings: [{ pos: '名', gloss: '魔法' }] },
  { word: '世界', reading: 'sekai', meanings: [{ pos: '名', gloss: '世界' }] },
  { word: '戦う', reading: 'tatakau', meanings: [{ pos: '動', gloss: '战斗' }] },
  { word: '守る', reading: 'mamoru', meanings: [{ pos: '動', gloss: '保护；守护' }] },
  { word: '信じる', reading: 'shinjiru', meanings: [{ pos: '動', gloss: '相信' }] },
  { word: '殺す', reading: 'korosu', meanings: [{ pos: '動', gloss: '杀' }] },
  { word: '死ぬ', reading: 'shinu', meanings: [{ pos: '動', gloss: '死' }] },
  { word: '生きる', reading: 'ikiru', meanings: [{ pos: '動', gloss: '活；生存' }] },
  { word: '助ける', reading: 'tasukeru', meanings: [{ pos: '動', gloss: '帮助；救助' }] },
  { word: '約束', reading: 'yakusoku', meanings: [{ pos: '名', gloss: '约定；承诺' }] },
  { word: '夢', reading: 'yume', meanings: [{ pos: '名', gloss: '梦；梦想' }] },
  { word: '愛', reading: 'ai', meanings: [{ pos: '名', gloss: '爱' }] },
  { word: '恋', reading: 'koi', meanings: [{ pos: '名', gloss: '恋爱' }] },
  { word: '涙', reading: 'namida', meanings: [{ pos: '名', gloss: '眼泪' }] },
  { word: '笑顔', reading: 'egao', meanings: [{ pos: '名', gloss: '笑容' }] },
  { word: '気持ち', reading: 'kimochi', meanings: [{ pos: '名', gloss: '心情；感受' }] },
  { word: '記憶', reading: 'kioku', meanings: [{ pos: '名', gloss: '记忆' }] },
  { word: '未来', reading: 'mirai', meanings: [{ pos: '名', gloss: '未来' }] },
  { word: '過去', reading: 'kako', meanings: [{ pos: '名', gloss: '过去' }] },
  { word: '運命', reading: 'unmei', meanings: [{ pos: '名', gloss: '命运' }] },
  { word: '勇気', reading: 'yuuki', meanings: [{ pos: '名', gloss: '勇气' }] },
  { word: '希望', reading: 'kibou', meanings: [{ pos: '名', gloss: '希望' }] },
  { word: '絶望', reading: 'zetsubou', meanings: [{ pos: '名', gloss: '绝望' }] },
  { word: '平和', reading: 'heiwa', meanings: [{ pos: '名', gloss: '和平' }] },
  { word: '地獄', reading: 'jigoku', meanings: [{ pos: '名', gloss: '地狱' }] },
  { word: '天国', reading: 'tengoku', meanings: [{ pos: '名', gloss: '天堂' }] },
  { word: '人間', reading: 'ningen', meanings: [{ pos: '名', gloss: '人类' }] },
  { word: '悪魔', reading: 'akuma', meanings: [{ pos: '名', gloss: '恶魔' }] },
  { word: '天使', reading: 'tenshi', meanings: [{ pos: '名', gloss: '天使' }] },
  { word: '神', reading: 'kami', meanings: [{ pos: '名', gloss: '神' }] },
  { word: '魂', reading: 'tamashii', meanings: [{ pos: '名', gloss: '灵魂' }] },
  { word: '心', reading: 'kokoro', meanings: [{ pos: '名', gloss: '心；内心' }] },
  { word: '剣', reading: 'ken', meanings: [{ pos: '名', gloss: '剑' }] },
  { word: '刀', reading: 'katana', meanings: [{ pos: '名', gloss: '刀' }] },
  { word: '忍者', reading: 'ninja', meanings: [{ pos: '名', gloss: '忍者' }] },
  { word: '侍', reading: 'samurai', meanings: [{ pos: '名', gloss: '武士' }] },
  { word: '王', reading: 'ou', meanings: [{ pos: '名', gloss: '王' }] },
  { word: '姫', reading: 'hime', meanings: [{ pos: '名', gloss: '公主' }] },
  { word: '勇者', reading: 'yuusha', meanings: [{ pos: '名', gloss: '勇者' }] },
  { word: '魔王', reading: 'maou', meanings: [{ pos: '名', gloss: '魔王' }] },
  { word: '呪い', reading: 'noroi', meanings: [{ pos: '名', gloss: '诅咒' }] },
  { word: '願い', reading: 'negai', meanings: [{ pos: '名', gloss: '愿望；心愿' }] },
  { word: '許す', reading: 'yurusu', meanings: [{ pos: '動', gloss: '原谅；允许' }] },
  { word: '忘れる', reading: 'wasureru', meanings: [{ pos: '動', gloss: '忘记' }] },
  { word: '覚える', reading: 'oboeru', meanings: [{ pos: '動', gloss: '记住；学会' }] },
  { word: '戻る', reading: 'modoru', meanings: [{ pos: '動', gloss: '返回；回去' }] },
  { word: '始まる', reading: 'hajimaru', meanings: [{ pos: '動', gloss: '开始' }] },
  { word: '終わる', reading: 'owaru', meanings: [{ pos: '動', gloss: '结束' }] },
  { word: '変わる', reading: 'kawaru', meanings: [{ pos: '動', gloss: '改变；变化' }] },
  { word: '強い', reading: 'tsuyoi', meanings: [{ pos: '形', gloss: '强；强大' }] },
  { word: '弱い', reading: 'yowai', meanings: [{ pos: '形', gloss: '弱' }] },
  { word: '早い', reading: 'hayai', meanings: [{ pos: '形', gloss: '快；早' }] },
  { word: '遅い', reading: 'osoi', meanings: [{ pos: '形', gloss: '慢；晚' }] },
  { word: '大きい', reading: 'ookii', meanings: [{ pos: '形', gloss: '大' }] },
  { word: '小さい', reading: 'chiisai', meanings: [{ pos: '形', gloss: '小' }] },
  { word: '新しい', reading: 'atarashii', meanings: [{ pos: '形', gloss: '新' }] },
  { word: '古い', reading: 'furui', meanings: [{ pos: '形', gloss: '旧；古老' }] },
  { word: '美味しい', reading: 'oishii', meanings: [{ pos: '形', gloss: '好吃' }] },
  { word: '楽しい', reading: 'tanoshii', meanings: [{ pos: '形', gloss: '快乐；愉快' }] },
  { word: '悲しい', reading: 'kanashii', meanings: [{ pos: '形', gloss: '悲伤' }] },
  { word: '嬉しい', reading: 'ureshii', meanings: [{ pos: '形', gloss: '高兴' }] },
  { word: '怖い', reading: 'kowai', meanings: [{ pos: '形', gloss: '可怕' }] },
  { word: '危ない', reading: 'abunai', meanings: [{ pos: '形', gloss: '危险' }] },
  { word: '優しい', reading: 'yasashii', meanings: [{ pos: '形', gloss: '温柔；善良' }] },
  { word: '厳しい', reading: 'kibishii', meanings: [{ pos: '形', gloss: '严厉' }] },
]

/**
 * 加载完整 JMdict 词典（如果有）
 * 格式：每行 JSON: {"word":"漢字","reading":"よみ","meanings":[{"pos":"名","gloss":"定义"}]}
 */
let dictLoaded = false

function ensureDictLoaded(): void {
  if (dictLoaded) return
  dictLoaded = true

  try {
    const dictPath = join(app.getPath('userData'), 'jmdict.json')
    if (existsSync(dictPath)) {
      const data = JSON.parse(readFileSync(dictPath, 'utf-8'))
      if (Array.isArray(data)) {
        BUILTIN_DICT.push(...data)
      }
    }
  } catch {
    /* 使用内置词典 */
  }
}

/**
 * 查询单词
 */
export function lookupWord(word: string): DictEntry[] {
  ensureDictLoaded()
  const lower = word.toLowerCase()
  return BUILTIN_DICT.filter(
    (e) =>
      e.word === word ||
      e.word === lower ||
      e.reading === word ||
      e.reading === lower ||
      (word.length >= 2 && e.word.includes(word)),
  ).slice(0, 5)
}

/**
 * 从日语句子中提取可能的单词并查询
 */
export function analyzeJapaneseText(text: string): Array<{
  word: string
  entries: DictEntry[]
}> {
  ensureDictLoaded()

  const results: Array<{ word: string; entries: DictEntry[] }> = []
  const seen = new Set<string>()

  // 在词典中查找可能匹配的单词
  for (const entry of BUILTIN_DICT) {
    if (seen.has(entry.word)) continue
    if (text.includes(entry.word)) {
      seen.add(entry.word)
      results.push({
        word: entry.word,
        entries: [entry],
      })
    }
  }

  return results
}

/**
 * 获取翻译引擎状态
 */
export function getTranslationStatus(): {
  engine: string
  apiKeyConfigured: boolean
} {
  return {
    engine: translationConfig.engine,
    apiKeyConfigured: !!translationConfig.apiKey,
  }
}
