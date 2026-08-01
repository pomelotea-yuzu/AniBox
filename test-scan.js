const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 模拟扫描+存储的完整流程
let log = [];
try {
  // 创建临时测试目录
  const testDir = path.join(__dirname, 'test-anime');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, {recursive: true});
  
  const epDir = path.join(testDir, 'Test Anime S1');
  if (!fs.existsSync(epDir)) fs.mkdirSync(epDir, {recursive: true});
  fs.writeFileSync(path.join(epDir, '[Subs] Test - 01 [1080p].mp4'), 'fake video');
  fs.writeFileSync(path.join(epDir, '[Subs] Test - 02 [1080p].mp4'), 'fake video');
  
  // 模拟扫描逻辑
  const entries = fs.readdirSync(epDir);
  const videos = entries.filter(e => e.endsWith('.mp4'));
  log.push('found videos: ' + videos.length);
  
  // 模拟 hash 和存储
  const folderPath = epDir;
  const folderHash = crypto.createHash('md5').update(folderPath).digest('hex');
  log.push('folderHash: ' + folderHash);
  
  for (const v of videos) {
    const fp = path.join(epDir, v);
    const fh = crypto.createHash('md5').update(fp).digest('hex');
    log.push('  ep: ' + v + ' hash: ' + fh);
  }
  
  // 写入 JSON store
  const storePath = path.join(__dirname, 'test-store.json');
  const store = { series: {}, episodes: {}, progress: {} };
  store.series[folderHash] = { id: folderHash, title: 'Test Anime', folderPath, season: 1, totalEps: 2, status: 'watching', addedAt: new Date().toISOString() };
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  
  const readBack = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  log.push('store series count: ' + Object.keys(readBack.series).length);
  log.push('ALL OK - no crash');
  
  // 清理
  fs.rmSync(testDir, {recursive: true, force: true});
  fs.unlinkSync(storePath);
  
} catch(e) {
  log.push('ERROR: ' + e.message);
}

fs.writeFileSync('scan-test-result.txt', log.join('\n'));
process.exit(0);
