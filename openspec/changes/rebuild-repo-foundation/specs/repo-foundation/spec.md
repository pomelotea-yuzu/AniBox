# 规格：repo-foundation（仓库地基）

## R1 目录归属

每个顶层目录必须有唯一职责，并在 `docs/README.md` 与对应 `README.md` 登记。

| 路径 | 职责 |
|---|---|
| `AGENTS.md` | 唯一接手入口 |
| `apps/*` | 可交付应用（当前仅 `desktop`） |
| `packages/*` | 可独立构建与验收的模块（当前为空） |
| `openspec/` | 规格与变更 |
| `docs/` | 文档与过程资产 |
| `scripts/` | 仓库门禁 |
| `artifacts/` | 一次性产物（不入库） |
| `i18n/` | 双语口径与登记 |

### 场景：新增目录
- 给定有人要新增顶层目录
- 当该目录未在 `docs/README.md` 登记
- 则视为归属未定，不得先建后用

## R2 门禁三层

洁净度必须三层齐备：`.gitignore`（兜底）、`scripts/check-hygiene.mjs`（默认拒绝）、
`.git-hygiene-allowlist`（glob + 理由）。

### 场景：大文件入库
- 给定要提交一个 > 1 MiB 的文件
- 且未在 allowlist 登记 `size=`
- 则 `check-hygiene --all` 失败并指出体积原因

### 场景：无理由豁免
- 给定 allowlist 里某行没有 `# 理由`
- 则门禁失败

### 场景：忽略泄露
- 给定某文件已跟踪且命中 `.gitignore`
- 则门禁失败并指出"忽略泄露"

### 场景：自测必须真的会红
- 给定运行 `check-repo.mjs --all`
- 则其中包含 `check-hygiene --selftest` 与 `check-i18n --selftest`，用必坏样例证明规则有效

## R3 单点入口

`scripts/check-repo.mjs` 是唯一门禁入口；`.githooks/pre-commit` 与两侧 CI
（`.github/workflows/ci.yml`、`.workflow/ci.yml`）都调它，不另写判据。

### 场景：提交快照
- 给定部分暂存
- 当 pre-commit 触发
- 则以 `--staged` 按实际索引快照判定，而不是工作区

## R4 文档纪律

- 内部文档默认中文；只有 `i18n/docs-manifest.json` 登记的文件才要求 `*.en.md` 同轮成对。
- 带日期的文档描述"当时"，不代表当前状态。
- 未执行项必须单列，不许勾完成（I9）。

## R5 产物隔离

`artifacts/` 与 `.anibox/` 均不入库；二进制、模型、便携包、截图一律不进历史。

## 不在本规格范围

应用功能行为（见各 capability 规格）、CI 里的产品检查（lint/test 尚未进 CI）。
