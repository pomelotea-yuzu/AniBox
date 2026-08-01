/**
 * 替换 Electron 自带的 ffmpeg.dll 为支持 HEVC/MKV 的社区预编译版本。
 * 运行: node scripts/replace-ffmpeg.cjs
 *
 * 原理: Electron 默认的 ffmpeg.dll 不包含 H.265/MKV 解码器。
 * 替换后 Chromium 的 <video> 元素就能原生播放所有常见动漫格式。
 */

const { execSync } = require('child_process')
const { existsSync, copyFileSync, renameSync } = require('fs')
const { join } = require('path')
const https = require('https')
const { createWriteStream } = require('fs')
const { pipeline } = require('stream/promises')

// Electron 安装目录
const electronDist = join(__dirname, '..', 'node_modules', 'electron', 'dist')
const dllPath = join(electronDist, 'ffmpeg.dll')
const backupPath = join(electronDist, 'ffmpeg.dll.bak')

// Electron 33 使用的 Chromium 130
// 从 nwjs-ffmpeg-prebuilt 下载兼容版本
// 0.93.0 对应 Chromium 130 左右
const FFMPEG_VERSION = '0.94.0'
const DOWNLOAD_URL = `https://github.com/nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt/releases/download/${FFMPEG_VERSION}/${FFMPEG_VERSION}-win-x64.zip`
const ZIP_PATH = join(__dirname, 'ffmpeg-temp.zip')

async function download(url, dest) {
  console.log(`下载 ${url} ...`)
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AniBox' } }, (res) => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      const file = createWriteStream(dest)
      pipeline(res, file).then(resolve).catch(reject)
    }).on('error', reject)
  })
}

function extractZip(zipPath, destDir) {
  // 使用 PowerShell 解压 (Windows 自带)
  console.log('解压中...')
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
    { stdio: 'inherit' }
  )
  return join(destDir, 'ffmpeg.dll')
}

async function main() {
  if (!existsSync(dllPath)) {
    console.error(`错误: 找不到 ${dllPath}`)
    console.error('请先运行 npm install')
    process.exit(1)
  }

  // 备份原始文件
  if (!existsSync(backupPath)) {
    console.log('备份原始 ffmpeg.dll...')
    copyFileSync(dllPath, backupPath)
  } else {
    console.log('备份已存在，跳过')
  }

  // 下载
  try {
    const extractDir = join(__dirname, 'ffmpeg-extract')
    await download(DOWNLOAD_URL, ZIP_PATH)

    const newDll = extractZip(ZIP_PATH, extractDir)
    if (!existsSync(newDll)) {
      // 解压后的文件名可能不同，搜索一下
      const { readdirSync } = require('fs')
      const files = readdirSync(extractDir)
      const found = files.find(f => f.endsWith('.dll'))
      if (found) {
        copyFileSync(join(extractDir, found), dllPath)
      } else {
        throw new Error('解压后未找到 ffmpeg.dll')
      }
    } else {
      copyFileSync(newDll, dllPath)
    }

    console.log('✅ ffmpeg.dll 替换成功!')
    console.log('')
    console.log('现在 HTML5 播放器支持:')
    console.log('  - H.265/HEVC 解码')
    console.log('  - MKV/Matroska 容器')
    console.log('  - AAC/FLAC/Opus 音频')
    console.log('')
    console.log('如果遇到问题，恢复原始文件:')
    console.log(`  copy "${backupPath}" "${dllPath}"`)

  } catch (err) {
    console.error(`下载失败: ${err.message}`)
    console.error('')
    console.error('手动下载步骤:')
    console.error(`1. 打开 ${DOWNLOAD_URL}`)
    console.error('2. 下载 win-x64.zip')
    console.error(`3. 解压 ffmpeg.dll 到:`)
    console.error(`   ${dllPath}`)
    process.exit(1)
  }
}

main()
