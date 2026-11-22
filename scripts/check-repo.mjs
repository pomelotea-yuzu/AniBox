#!/usr/bin/env node
// 门禁公共入口：pre-commit 与两侧 CI 都调这里，不另写判据。
//   node scripts/check-repo.mjs --all      工作区排查
//   node scripts/check-repo.mjs --staged   按实际暂存快照跑同一条链
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
// ANIBOX_REPO_ROOT 仅供受限环境（AppContainer 沙箱里 node 无法 realpath 盘根）从别处调用时覆盖。
const ROOT = path.resolve(process.env.ANIBOX_REPO_ROOT || path.join(SELF_DIR, '..'));
let snapshot;

try {
  let checkRoot = ROOT;
  let env = process.env;
  if (process.argv.includes('--staged')) {
    const artifacts = path.join(ROOT, 'artifacts');
    mkdirSync(artifacts, { recursive: true });
    snapshot = mkdtempSync(path.join(artifacts, 'staged-checks-'));
    const prefix = `${snapshot.replace(/\\/g, '/')}/`;
    execFileSync('git', ['checkout-index', '--all', `--prefix=${prefix}`], { cwd: ROOT, stdio: 'inherit' });
    const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const index = execFileSync('git', ['rev-parse', '--git-path', 'index'], { cwd: ROOT, encoding: 'utf8' }).trim();
    checkRoot = snapshot;
    env = {
      ...process.env,
      GIT_DIR: gitDir,
      GIT_WORK_TREE: snapshot,
      GIT_INDEX_FILE: path.resolve(ROOT, index),
    };
  }

  // 子脚本按本文件所在目录定位（快照里没有 scripts/ 也能跑），仓库根经环境变量传入。
  const childEnv = { ...env, ANIBOX_REPO_ROOT: checkRoot };

  const checks = [
    ['check-hygiene.mjs', '--all'],
    ['check-hygiene.mjs', '--selftest'],
    ['check-i18n.mjs', '--selftest'],
    ['check-i18n.mjs', '--links'],
    ['check-i18n.mjs'],
  ];

  for (const [script, ...args] of checks) {
    const result = spawnSync(process.execPath, [path.join(SELF_DIR, script), ...args], {
      cwd: checkRoot,
      env: childEnv,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
} catch (error) {
  console.error(`仓库门禁执行失败：${error.message}`);
  process.exitCode = 1;
} finally {
  if (snapshot) rmSync(snapshot, { recursive: true, force: true });
}
