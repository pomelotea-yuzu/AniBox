const fs = require('fs');
let out = [];
out.push('=== require electron ===');
try {
  const e = require('electron');
  out.push('type: ' + typeof e);
  out.push('is string: ' + (typeof e === 'string'));
  if (typeof e === 'string') out.push('path: ' + e.substring(0, 100));
} catch(err) {
  out.push('ERROR: ' + err.message);
}
out.push('=== require electron/main ===');
try {
  const e = require('electron/main');
  out.push('type: ' + typeof e);
  out.push('has app: ' + (typeof e.app));
} catch(err) {
  out.push('ERROR: ' + err.message);
}
fs.writeFileSync('test-output.txt', out.join('\n'));
process.exit(0);
