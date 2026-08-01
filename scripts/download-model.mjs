/**
 * 预下载翻译模型到 AniBox userData 目录
 * 运行: node scripts/download-model.mjs
 */
import { pipeline, env } from '@xenova/transformers'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const projectDir = join(__dirname, '..', 'models')
env.cacheDir = projectDir
env.allowLocalModels = false
// 使用 HuggingFace 国内镜像加速
env.remoteHost = 'https://hf-mirror.com'

console.log(`模型缓存目录: ${projectDir}`)
console.log('开始下载翻译模型 Xenova/opus-mt-en-zh (~300MB)...')

try {
  const pipe = await pipeline('translation', 'Xenova/opus-mt-en-zh', {
    progress_callback: (p) => {
      if (p?.status === 'downloading' && p?.progress) {
        process.stdout.write(`\r  下载中... ${Math.round(p.progress)}% (${p.file || ''})    `)
      } else if (p?.status === 'loading') {
        console.log('\n  加载模型中...')
      }
    }
  })

  // 测试一次翻译
  const result = await pipe('Hello, this is a test translation.', { max_new_tokens: 100 })
  const text = Array.isArray(result) ? result[0]?.translation_text : result?.translation_text
  console.log(`\n测试翻译: "Hello, this is a test translation."`)
  console.log(`翻译结果: "${text}"`)
  console.log('\n✓ 模型下载并验证成功!')
} catch (err) {
  console.error('\n✗ 下载失败:', err.message)
  process.exit(1)
}
