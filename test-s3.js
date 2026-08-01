var fs = require('fs');
var path = require('path');
var os = require('os');
var logFile = path.join(os.tmpdir(), 'anibox-log.txt');
var log = [];
function flush() { fs.writeFileSync(logFile, log.join('\n')); }

try {
  var testDir = path.join(os.tmpdir(), 'anibox-test3');
  fs.mkdirSync(testDir, {recursive: true});
  log.push('dir created');
  
  var data = { series: {}, episodes: {}, progress: {} };
  data.series.test = { id: 'test', title: 'OK', folderPath: testDir, season: 1, totalEps: 0, status: 'watching', addedAt: '' };
  log.push('data created');
  
  var storePath = path.join(os.tmpdir(), 'anibox-store-test.json');
  fs.writeFileSync(storePath, JSON.stringify(data));
  log.push('store written');
  
  var read = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  log.push('store read OK: ' + Object.keys(read.series).length + ' series');
  
  fs.rmSync(testDir, {recursive: true});
  fs.unlinkSync(storePath);
  log.push('cleanup done');
  log.push('SUCCESS');
} catch(e) {
  log.push('CRASH: ' + e.message);
}
flush();
process.exit(0);
