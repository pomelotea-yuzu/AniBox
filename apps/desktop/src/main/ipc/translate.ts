// === AI / 翻译 / 词典 IPC：Whisper、本地模型、AI 翻译、日语词典 ===
import { ipcMain, type BrowserWindow } from 'electron'
import {
  loadModel,
  getTranslateStatus,
  loadJaModel,
  translateJaToZh,
  translateEnToZh,
} from '../local-translate'
import { configureAI, translateWithAI, getAIKey } from '../ai-translate'
import {
  setWhisperConfig,
  getWhisperStatus,
  getDefaultWhisperPaths,
  transcribeWithWhisper,
  setTranslationConfig,
  translateText,
  translateSubtitleSegments,
  lookupWord,
  analyzeJapaneseText,
  getTranslationStatus,
} from '../whisper-translate'

export function registerTranslateIpc(getWin: () => BrowserWindow | null): void {
  // ===== Whisper 语音识别 =====
  ipcMain.handle('whisper:status', () => {
    return { ...getWhisperStatus(), defaultPaths: getDefaultWhisperPaths() }
  })

  ipcMain.handle('whisper:configure', (_e, config: { binaryPath: string; modelPath: string }) => {
    setWhisperConfig({
      binaryPath: config.binaryPath,
      modelPath: config.modelPath,
      modelSize: 'small',
    })
  })

  ipcMain.handle('whisper:transcribe', async (_e, videoPath: string) => {
    try {
      const result = await transcribeWithWhisper(videoPath, (msg) => {
        getWin()?.webContents.send('whisper:progress', { message: msg })
      })
      if (result) {
        getWin()?.webContents.send('whisper:progress', { message: '完成', result })
      }
      return result
    } catch (err: any) {
      getWin()?.webContents.send('whisper:progress', { message: '失败', error: err.message })
      throw err
    }
  })

  // ===== AI 翻译 =====
  ipcMain.handle('translate:status', () => getTranslationStatus())

  ipcMain.handle(
    'translate:configure',
    (_e, config: { engine?: string; apiKey?: string; apiUrl?: string }) => {
      setTranslationConfig(config as Parameters<typeof setTranslationConfig>[0])
    },
  )

  ipcMain.handle('translate:text', async (_e, text: string, fromLang?: string, toLang?: string) => {
    return await translateText(text, fromLang || 'ja', toLang || 'zh-CN')
  })

  ipcMain.handle(
    'translate:segments',
    async (_e, segments: any[], fromLang?: string, toLang?: string) => {
      return await translateSubtitleSegments(
        segments,
        fromLang || 'ja',
        toLang || 'zh-CN',
        (cur, total) => {
          getWin()?.webContents.send('translate:progress', { current: cur, total })
        },
      )
    },
  )

  // ===== 日语词典 =====
  ipcMain.handle('dict:lookup', (_e, word: string) => {
    return lookupWord(word)
  })

  ipcMain.handle('dict:analyze', (_e, text: string) => {
    return analyzeJapaneseText(text)
  })

  // 本地翻译模型 (opus-mt-en-zh)
  ipcMain.handle('translate:localLoadModel', async () => {
    try {
      return await loadModel((msg) => {
        getWin()?.webContents.send('translate:localProgress', msg)
      })
    } catch {
      return false
    }
  })

  ipcMain.handle('translate:localStatus', () => {
    return getTranslateStatus()
  })

  ipcMain.handle('translate:jaModelLoad', async () => {
    const onProgress = (msg: string) => {
      getWin()?.webContents.send('translate:localProgress', msg)
    }
    return await loadJaModel(onProgress)
  })

  ipcMain.handle('translate:jaToZh', async (_e, text: string) => {
    return await translateJaToZh(text)
  })

  ipcMain.handle('translate:enToZh', async (_e, text: string) => {
    return await translateEnToZh(text)
  })

  // AI 翻译
  ipcMain.handle('ai:configure', (_e, key: string) => {
    configureAI(key)
    return true
  })
  ipcMain.handle('ai:getKey', () => getAIKey())
  ipcMain.handle('ai:translate', async (_e, text: string, from: string, to: string) => {
    try {
      return await translateWithAI(text, from, to)
    } catch {
      return text
    }
  })
}
