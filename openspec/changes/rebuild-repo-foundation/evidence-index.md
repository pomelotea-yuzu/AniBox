# 证据索引：rebuild-repo-foundation

对应 `specs/repo-foundation/spec.md` 的 R1–R5。**未执行的项如实留空。**

| 判据 | 证据 |
|---|---|
| R1 目录归属 | `docs/README.md` 的目录地图 + `AGENTS.md` §八 + 各目录 `README.md` |
| R1 应用整包搬迁 | `git show --stat b127989`（rename 条目） |
| R2 三层洁净度 | `.gitignore`、`.git-hygiene-allowlist`、`scripts/check-hygiene.mjs` |
| R2 场景"大文件/无理由/忽略泄露" | `check-hygiene.mjs` 的 `detect()` + `ignoredLeaks()`；`--selftest` 的 6 个样例 |
| R2 自测会红 | `check-hygiene.mjs --selftest` 断言"必坏样例被报出、干净样例放行" |
| R3 单点入口 | `scripts/check-repo.mjs` 的 `checks` 数组；`.githooks/pre-commit`；两份 CI yml |
| R3 提交快照 | `check-repo.mjs` 的 `--staged` 分支（`git checkout-index` + `GIT_INDEX_FILE`） |
| R4 文档纪律 | `i18n/docs-manifest.json`、`docs/README.md`「命名约定」 |
| R5 产物隔离 | `.gitignore` 的 `artifacts/` 与 `.anibox/` 段 |

## 已验证记录

- 2026-11-22：`check-hygiene --all` → 192 个已跟踪文件通过（含首轮 5 处命中的处置：2 处本机绝对路径、
  2 处占位符误报、1 处脚本自命中）
- 2026-11-22：`check-i18n` → 成对 1 篇、链接 86 篇 Markdown 通过

## 实机证据（待补）

- 未执行：`npm run typecheck` 输出
- 未执行：`npm run dev` 首屏与控制台日志
- 未执行：`npm run build` 后 `out/` 清单
- 未执行：便携 zip 产物名与体积、解压后启动
- 未执行：`git commit` 时 pre-commit 的门禁输出
