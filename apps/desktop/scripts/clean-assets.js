// 清理 out/renderer/assets/ 中的旧构建产物
// 保留 index.html，只清理旧的 hash 文件
const fs = require('fs')
const path = require('path')

const assetsDir = path.join(__dirname, '..', 'out', 'renderer', 'assets')
if (!fs.existsSync(assetsDir)) process.exit(0)

const files = fs.readdirSync(assetsDir)
let removed = 0

for (const file of files) {
  // 跳过非构建产物文件
  if (!file.startsWith('index-')) continue
  const ext = path.extname(file)
  if (ext !== '.js' && ext !== '.css') continue

  // 跳过今天的文件（可能正在使用）
  try {
    const stat = fs.statSync(path.join(assetsDir, file))
    const ageHours = (Date.now() - stat.mtimeMs) / 3600000
    if (ageHours < 1) continue  // 保留 1 小时内构建的
  } catch { continue }

  try {
    fs.unlinkSync(path.join(assetsDir, file))
    removed++
  } catch { /* file in use */ }
}

if (removed > 0) {
  console.log(`[clean-assets] Removed ${removed} old build artifacts`)
}
