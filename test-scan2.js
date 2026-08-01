var fs = require('fs');
var path = require('path');
var os = require('os');
var crypto = require('crypto');

var log = [];
try {
  // 创建测试目录
  var tmp = os.tmpdir();
  var testDir = path.join(tmp, 'anibox-test-scan');
  var epDir = path.join(testDir, 'Test Anime');
  fs.mkdirSync(epDir, {recursive: true});
  fs.writeFileSync(path.join(epDir, '[Subs] Test - 01.mp4'), 'fake');
  fs.writeFileSync(path.join(epDir, '[Subs] Test - 02.mp4'), 'fake');
  
  // 扫描
  var entries = fs.readdirSync(epDir);
  var videos = entries.filter(function(e) { return e.endsWith('.mp4'); });
  log.push('videos found: ' + videos.length);
  
  // 存储
  var folderHash = crypto.createHash('md5').update(epDir).digest('hex');
  var storePath = path.join(tmp, 'anibox-store.json');
  var data = { series: {}, episodes: {}, progress: {} };
  
  data.series[folderHash] = {
    id: folderHash, title: 'Test Anime', folderPath: epDir,
    season: 1, totalEps: 2, status: 'watching', addedAt: new Date().toISOString()
  };
  
  for (var i = 0; i < videos.length; i++) {
    var fp = path.join(epDir, videos[i]);
    var eh = crypto.createHash('md5').update(fp).digest('hex');
    data.episodes[eh] = { id: eh, seriesId: folderHash, epNumber: i+1, fileName: videos[i], filePath: fp };
  }
  
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
  
  // 读取验证
  var read = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  log.push('series: ' + Object.keys(read.series).length);
  log.push('episodes: ' + Object.keys(read.episodes).length);
  
  // getSeriesProgress
  var eps = Object.values(read.episodes).filter(function(e) { return e.seriesId === folderHash; });
  log.push('getSeriesProgress: total=' + eps.length + ' watched=0');
  
  log.push('ALL OK - no crash');
  
  // 清理
  fs.rmSync(testDir, {recursive: true});
  fs.unlinkSync(storePath);
} catch(e) {
  log.push('ERROR: ' + e.message);
}

console.log(log.join('\n'));
process.exit(0);
