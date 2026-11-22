# docs/ · 文档地图与索引

> 本文默认以中文维护。

本目录分两层：**面向使用者的文档**（`guide` / `architecture` / `development`）与
**工程过程资产**（`research` / `product` / `engineering` / `reviews` / `drafts`）。
后者是调研、探讨、审阅、规划与验收记录，不是产品说明。

## 权威性排序

判断项目状态时，冲突以下列顺序为准：

1. `apps/*/src` 与 `packages/*/src` 源码
2. `openspec/changes/archive/` —— 已归档 change 的 tasks / design / evidence-index
3. `openspec/specs/` —— 合入主 spec 的能力口径
4. 本目录
5. [`/AGENTS.md`](../AGENTS.md) —— 接手索引，已知会滞后

过程文档里的日期就是它的时效边界：**带日期的文档描述的是当时**，不代表当前状态。

## 面向使用者

| 目录 | 内容 | 双语 |
|---|---|---|
| [`guide/`](guide/README.md) | 快速开始：安装便携包、扫库、播放、常见问题 | 默认中文 |
| [`architecture/`](architecture/README.md) | 架构总览：三进程边界、播放引擎、数据流 | 默认中文 |
| [`development/`](development/workflow.md) | 开发工作流：门禁链、openspec 流程、提交与打包口径 | 默认中文 |

## 经验库

[`knowledge/`](knowledge/README.md) —— 本仓最重要的机制：踩过的坑、实机硬事实、不许重开的不变量
与关键决策**全部入库**，任何人 clone 后即可接手，不依赖某个人的本机记忆。

| 文件 | 收什么 |
|---|---|
| [`knowledge/engineering.md`](knowledge/engineering.md) | 构建、打包、门禁、依赖、koffi/asar/脚本通道上的坑 |
| [`knowledge/runtime-probe.md`](knowledge/runtime-probe.md) | 实机硬事实：libmpv 渲染、帧率、音轨/字幕、seek 判据 |
| [`knowledge/invariants.md`](knowledge/invariants.md) | 架构不变量，每条给出不成立时的后果 |
| [`knowledge/decisions.md`](knowledge/decisions.md) | 关键决策速查：决定 / 理由 / 代价 / 推翻条件 |
| [`knowledge/debt.md`](knowledge/debt.md) | 未决口径与欠账，标注归谁定夺与必须定下的时点 |

## 工程过程资产

| 目录 | 内容 | 双语 |
|---|---|---|
| [`research/`](research/README.md) | 数据源、播放器引擎、分发方式的调研与对照 | 不需要 |
| [`product/`](product/README.md) | 方向定稿、路线图、能力边界 | 不需要 |
| [`engineering/`](engineering/README.md) | `plans/` 执行方案 · `reports/` 交付与构建报告 · `notes/` 功能说明与约定 | 不需要 |
| [`reviews/`](reviews/README.md) | 实机验收与审阅证据；**过程截图默认不入库** | 不需要 |
| `drafts/` | 个人工作草稿，**整目录不入库** | — |

当前规划入口：[简短路线图](product/roadmap.md) 与
[仓库重整提案](engineering/plans/2026-11-22-anibox-rebuild-proposal.md)（Windows 优先、Layress 治理、
电视模式 / RIFE / 采集串流三条候选 change 的边界）。

## 双语范围

成对规则与门禁检查项写在 [`/i18n/README.md`](../i18n/README.md)。
一句话版本：**文档默认中文，只有逐篇登记的文件才维护中英双版本**；当前登记表为空
（根 `README.md` 暂时只写中文，英文版待补）。
全库文件链接由 `node scripts/check-i18n.mjs --links` 独立检查；
统一门禁入口是 [`scripts/check-repo.mjs`](../scripts/check-repo.mjs)，本地提交与两侧 CI 共用。

## 命名约定

- **稳定主题名 `<english-kebab-case>.md`**：已批准并作为当前依据的方案、现行规则、已核实事实
  （如 `workflow.md`、`invariants.md`）。
- **过程记录 `YYYY-MM-DD-<english-kebab-case>.md`**：调研、探讨、待批提案、审阅与当次报告
  （如 `2026-11-22-anibox-rebuild-proposal.md`）。
- **按用途与状态判断，不按篇幅判断**：重要调研仍是过程记录；已批准方案才成为当前依据。
- **从过程结论晋升为当前依据**：提炼到稳定主题文档或经验条目，保留带日期的原始记录并互相链接；
  迁移须同轮修复引用与下方路径变更记录。
- 新增文档先在上表选目录，再在本文件登记一行；跨目录链接按当前 Markdown 文件计算相对路径。
- 术语中英对应查 [`/i18n/glossary.md`](../i18n/glossary.md)；代码标识与错误码原值不翻译。

## 路径变更记录

- **2026-11-22 仓库重整（Layress 治理 + `apps/desktop`）**：仓库根从 `D:\AniBox\anibox` 上移到
  `D:\AniBox`；应用本体迁入 `apps/desktop/`（`src`、`resources`、打包脚本、Electron/TS 配置、
  运行时二进制与 `models/` 随之移动，包内相对路径不变）；`stage121-123` 迁入 `artifacts/`；
  旧根杂物（1.2.1–1.2.3 便携包、`data/`、`mpv-dev`、git 修复报告）移到 `D:\AniBox-Archive\`。
  新增 `AGENTS.md`、`openspec/`、`docs/`、`i18n/`、`packages/`、`.githooks/`、`.github/workflows/`、
  `.workflow/`、`.git-hygiene-allowlist` 与根 `scripts/` 门禁脚本；重整提案由旧根迁入
  [`engineering/plans/`](engineering/plans/2026-11-22-anibox-rebuild-proposal.md)。
