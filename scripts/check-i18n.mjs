#!/usr/bin/env node
// 文档检查：成对登记（i18n/docs-manifest.json）+ 全库 Markdown 本地链接。
// 用法：
//   node scripts/check-i18n.mjs            成对 + 链接（默认全查）
//   node scripts/check-i18n.mjs --links    只查链接
//   node scripts/check-i18n.mjs --selftest 自测：构造必坏样例，确认规则真会报红
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
// ANIBOX_REPO_ROOT 仅供受限环境（AppContainer 沙箱里 node 无法 realpath 盘根）从别处调用时覆盖。
const ROOT = path.resolve(process.env.ANIBOX_REPO_ROOT || path.join(SELF_DIR, '..'));
let failures = 0;

function fail(msg) {
  console.error(`✗ ${msg}`);
  failures += 1;
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

function trackedMarkdown() {
  const out = execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function checkPairs() {
  const manifestPath = path.join(ROOT, 'i18n', 'docs-manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`i18n/docs-manifest.json 读取失败：${error.message}`);
    return;
  }
  const before = failures;
  for (const rel of manifest.docs ?? []) {
    const abs = path.join(ROOT, rel);
    const en = abs.replace(/\.md$/, '.en.md');
    if (!isFile(abs)) fail(`登记文件不存在：${rel}`);
    if (!isFile(en)) fail(`缺少英文配对：${path.relative(ROOT, en).replace(/\\/g, '/')}`);
  }
  if (failures === before) ok(`双语配对：${(manifest.docs ?? []).length} 篇已登记文件成对`);
}

function isFile(abs) {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function isDir(abs) {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function localLinks(text) {
  const out = [];
  for (const match of text.matchAll(LINK)) {
    const raw = match[1];
    if (!raw || /^(https?:|mailto:|tel:|data:|#)/i.test(raw)) continue;
    out.push(raw);
  }
  return out;
}

function resolveLink(fromRel, raw) {
  const cleaned = raw.split('#')[0].split('?')[0];
  if (!cleaned) return null;
  let decoded = cleaned;
  try {
    decoded = decodeURI(cleaned);
  } catch {
    /* 保留原样 */
  }
  if (decoded.startsWith('/')) return path.join(ROOT, decoded.slice(1));
  return path.resolve(ROOT, path.dirname(fromRel), decoded);
}

function checkLinks(files = trackedMarkdown()) {
  const before = failures;
  for (const rel of files) {
    let text = '';
    try {
      text = readFileSync(path.join(ROOT, rel), 'utf8');
    } catch {
      continue;
    }
    for (const raw of localLinks(text)) {
      const abs = resolveLink(rel, raw);
      if (!abs) continue;
      if (isFile(abs) || isDir(abs)) continue;
      fail(`${rel} :: 链接目标不存在 → ${raw}`);
    }
  }
  if (failures === before) ok(`本地链接：${files.length} 篇 Markdown 全部可解析`);
}

function selftest() {
  const dir = path.join(ROOT, 'artifacts', 'i18n-selftest');
  mkdirSync(dir, { recursive: true });
  const good = path.join(dir, 'good.md');
  const bad = path.join(dir, 'bad.md');
  writeFileSync(good, '# ok\n\n[lead](../../AGENTS.md)\n');
  writeFileSync(bad, '# bad\n\n[ghost](./definitely-missing.md)\n');

  const goodLinks = localLinks(readFileSync(good, 'utf8'));
  const badLinks = localLinks(readFileSync(bad, 'utf8'));
  const goodAbs = goodLinks.map((l) => resolveLink(path.relative(ROOT, good), l));
  const badAbs = badLinks.map((l) => resolveLink(path.relative(ROOT, bad), l));
  const goodOk = goodLinks.length === 1 && goodAbs.every((p) => isFile(p));
  const badDetected = badLinks.length === 1 && badAbs.every((p) => !isFile(p));
  rmSync(dir, { recursive: true, force: true });

  if (!goodOk) fail('自测：正常链接未被识别');
  if (!badDetected) fail('自测：坏链接未被识别');
  if (goodOk && badDetected) ok('文档自测：正常链接放行、坏链接报红');
}

const args = process.argv.slice(2);
if (args.includes('--selftest')) {
  selftest();
} else {
  if (!args.includes('--links')) checkPairs();
  checkLinks();
}

if (failures > 0) {
  console.error(`\n共 ${failures} 处问题。`);
  process.exitCode = 1;
}
