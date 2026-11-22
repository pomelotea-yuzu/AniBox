#!/usr/bin/env node
// 洁净度门禁：默认拒绝。体积 / 后缀 / 垃圾场路径 / 凭据形态 / 忽略泄露 五项。
// 唯一放行入口是根目录 .git-hygiene-allowlist（glob + 一句话理由，无理由即失败）。
//
// 用法：
//   node scripts/check-hygiene.mjs --all       查全部已跟踪文件（按当前索引）
//   node scripts/check-hygiene.mjs --staged    与 --all 同链，由 check-repo 传入索引快照
//   node scripts/check-hygiene.mjs --selftest  构造必坏样例，确认规则真的会报红
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
// ANIBOX_REPO_ROOT 仅供受限环境（AppContainer 沙箱里 node 无法 realpath 盘根）从别处调用时覆盖，
// CI 与本地正常终端不要设置它。
const ROOT = path.resolve(process.env.ANIBOX_REPO_ROOT || path.join(SELF_DIR, '..'));
const MAX_SIZE = 1024 * 1024; // 1 MiB
const BANNED_EXT = new Set([
  '.exe', '.dll', '.node', '.pdb', '.lib', '.msi',
  '.7z', '.rar', '.iso', '.zip', '.mp4', '.mkv', '.onnx',
]);
const BANNED_PATH = /(^|\/)(artifacts|node_modules|\.workbuddy|\.vscode|\.idea|\.claude|\.cursor|\.trae|data|docs\/drafts)(\/|$)/;
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md',
  '.yml', '.yaml', '.py', '.bat', '.vbs', '.txt', '.html', '.css', '.sh', '.cfg', '.ini',
]);
const CREDENTIALS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: '私钥块' },
  { re: /\bsk-[A-Za-z0-9]{16,}\b/, label: '疑似 OpenAI 风格密钥' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, label: '疑似 GitHub token' },
  {
    re: /(api[_-]?key|secret|token|password)\s*[:=]\s*['"]([^'"\s]{12,})['"]/i,
    label: '疑似硬编码凭据',
    group: 2,
  },
  { re: /[Cc]:[\\/]Users[\\/][^/\s]+/i, label: '含本机 C 盘用户绝对路径' },
];
// 占位符不算凭据：sk-xxxx / __BUILD_TOKEN__ / <YOUR_KEY> / {{key}} / your-api-key 等
const PLACEHOLDER = /^(?:sk-x+|x{6,}|_+[A-Za-z_]+_+|<[^>]*>|\{\{[^}]*\}\}|[a-z0-9_-]*(?:your|example|placeholder|changeme|dummy)[a-z0-9_-]*)$/i;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1;
        if (glob[i + 1] === '/') {
          i += 1;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

function loadAllowlist() {
  const file = path.join(ROOT, '.git-hygiene-allowlist');
  const entries = [];
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return entries;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const hash = line.indexOf('#');
    if (hash < 0) {
      entries.push({ glob: line, reason: '', size: 0, malformed: true });
      continue;
    }
    const glob = line.slice(0, hash).trim();
    const reason = line.slice(hash + 1).trim();
    if (!glob || !reason) {
      entries.push({ glob, reason, size: 0, malformed: true });
      continue;
    }
    const sizeMatch = reason.match(/size=(\d+)([KMG])/i);
    let size = 0;
    if (sizeMatch) {
      const n = Number(sizeMatch[1]);
      size = n * ({ K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[sizeMatch[2].toUpperCase()] ?? 1);
    }
    entries.push({ glob, reason, size, re: globToRegExp(glob), malformed: false });
  }
  return entries;
}

function allowlistHit(entries, rel, size) {
  for (const e of entries) {
    if (!e.re || !e.re.test(rel)) continue;
    if (size !== undefined && e.size && size > e.size) continue;
    return e;
  }
  return null;
}

// 纯函数：给定一条记录返回违规原因数组（自测直接调它）
function detect(entry, allowlist) {
  const problems = [];
  const rel = entry.path.replace(/\\/g, '/');
  const allow = allowlistHit(allowlist, rel, entry.size);

  if (entry.size > MAX_SIZE && !(allow && allow.size)) {
    problems.push(`体积 ${(entry.size / 1024 / 1024).toFixed(2)} MB > 1 MB（如需入库请在 allowlist 写 size=）`);
  }
  const ext = path.extname(rel).toLowerCase();
  if (BANNED_EXT.has(ext) && !allow) {
    problems.push(`后缀 ${ext} 属黑名单（仓库只留生成脚本）`);
  }
  if (BANNED_PATH.test(rel) && !allow) {
    problems.push('路径落在垃圾场/本机目录（artifacts、data、node_modules、.workbuddy 等）');
  }
  if (TEXT_EXT.has(ext) && typeof entry.text === 'string' && entry.text) {
    for (const { re, label, group } of CREDENTIALS) {
      const m = entry.text.match(re);
      if (!m) continue;
      const value = String(group ? (m[group] ?? '') : m[0]);
      if (PLACEHOLDER.test(value)) continue;
      problems.push(`内容命中：${label}`);
    }
  }
  return problems;
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function readTextIfSmall(rel) {
  const abs = path.join(ROOT, rel);
  try {
    const st = statSync(abs);
    if (st.size > MAX_SIZE * 2) return '';
    const ext = path.extname(rel).toLowerCase();
    if (!TEXT_EXT.has(ext)) return '';
    return readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}

function ignoredLeaks(files) {
  if (!files.length) return [];
  let out = '';
  try {
    out = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
      cwd: ROOT,
      input: files.join('\n'),
      encoding: 'utf8',
    });
  } catch (error) {
    // check-ignore 在"没有命中"时退出码为 1，属正常
    out = error.stdout ?? '';
  }
  return out.split(/\r?\n/).filter(Boolean);
}

function runAll() {
  const allowlist = loadAllowlist();
  const malformed = allowlist.filter((e) => e.malformed);
  for (const e of malformed) {
    fail(`allowlist 行缺少理由：${e.glob || '(空)'}`);
  }

  const files = trackedFiles();
  let violations = 0;
  for (const rel of files) {
    let size = 0;
    try {
      size = statSync(path.join(ROOT, rel)).size;
    } catch {
      continue; // 索引里有、工作区已删：交给 git status 处理
    }
    const problems = detect({ path: rel, size, text: readTextIfSmall(rel) }, allowlist);
    for (const p of problems) {
      fail(`${rel} :: ${p}`);
      violations += 1;
    }
  }

  for (const leak of ignoredLeaks(files)) {
    if (allowlistHit(allowlist, leak.replace(/\\/g, '/'), undefined)) continue;
    fail(`${leak} :: 已跟踪但命中 .gitignore（忽略泄露）`);
    violations += 1;
  }

  if (violations === 0) ok(`洁净度：${files.length} 个已跟踪文件全部通过`);
  return violations;
}

function selftest() {
  const dir = path.join(ROOT, 'artifacts', 'hygiene-selftest');
  mkdirSync(dir, { recursive: true });
  const allowlist = [];
  // 自测样例拆开拼接：否则这行字面量本身会被门禁命中（脚本自查自）
  const SECRET_SAMPLE = ['const api', 'Key = "', 'abcdefghijklmnop', '";'].join('');
  const cases = [
    [{ path: 'artifacts/huge.bin', size: 3 * 1024 * 1024, text: '' }, '体积'],
    [{ path: 'apps/desktop/resources/mpv.exe', size: 10, text: '' }, '后缀'],
    [{ path: 'node_modules/x/index.js', size: 10, text: '' }, '垃圾场'],
    [{ path: 'docs/leak.md', size: 10, text: SECRET_SAMPLE }, '凭据'],
    [{ path: 'docs/placeholder.md', size: 10, text: 'placeholder="sk-xxxxxxxxxxxxxxxx"' }, null],
    [{ path: 'docs/ok.md', size: 10, text: '# 正常文档\n' }, null],
  ];
  let passed = 0;
  for (const [entry, expect] of cases) {
    const problems = detect(entry, allowlist);
    if (expect === null) {
      if (problems.length === 0) passed += 1;
      else fail(`自测：干净样例被误报 → ${problems.join('; ')}`);
      continue;
    }
    if (problems.some((p) => p.includes(expect))) passed += 1;
    else fail(`自测：${entry.path} 未按预期报出「${expect}」`);
  }
  writeFileSync(path.join(dir, 'README.txt'), 'self-test scratch dir, regenerated on demand\n');
  rmSync(dir, { recursive: true, force: true });
  if (passed === cases.length) ok(`洁净度自测：${passed}/${cases.length} 项按预期报红/放行`);
  return passed === cases.length ? 0 : 1;
}

if (process.argv.includes('--selftest')) {
  process.exitCode = selftest() === 0 ? process.exitCode ?? 0 : 1;
} else {
  runAll();
}
