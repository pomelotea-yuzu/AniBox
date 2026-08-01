var fs=require('fs');
var path=require('path');
var tmp = require('os').tmpdir();
var fp = path.join(tmp, 'anibox-test-ok.txt');
fs.writeFileSync(fp, 'hello from electron');
console.log('wrote to', fp);
process.exit(0);
