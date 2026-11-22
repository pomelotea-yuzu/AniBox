# AniBox · 接手索引（AGENTS.md）

> 本文默认以中文维护。

> **这是唯一入口。** 任何开发者、任何智能体，读完本文件就该能动手。
> 各工具的本机记忆文件（`CLAUDE.md`、`.cursor/`、`.trae/` 等）一律不入库；若你的工具只认它们，
> 让它指向本文件，**不要另抄一份内容**——两处口径迟早分叉。
>
> **体积预算**：本文件 ≤ 300 行 / ≤ 18 KB。写不下说明内容该进 [`docs/knowledge/`](docs/knowledge/README.md)，
> 不是该在这里加段落。
>
> **权威性排序**（冲突时以靠左的为准）：
> `apps/*/src` 源码 > `openspec/changes/archive/` > `openspec/specs/` > `docs/` > 本文件。
> ⚠️ 本文件**已知会滞后**：判断真实进度只认 `git log` 与 `openspec/changes/archive/`。

---

## 一、项目一句话

**AniBox** — 本地番剧库浏览器与播放器，Windows 优先、开箱即用、便携分发。

定位句：把本地视频目录扫成番剧库，用 libmpv 内嵌播放（HEVC/字幕/音轨/OP·ED 跳秒都自己管），
元数据离线可查，不依赖任何在线服务也能用。

- 四条不能混为一谈的边界：**扫库 ≠ 刮削 ≠ 播放 ≠ 转码**。任何一条坏了不许用另一条的现象顶包。
- 元数据链路的主线是**本地 Bangumi dump 索引**，在线源只是回退（见不变量 I5）。
- 画质路线已定：Anime4K 三预设 + 后期滤镜；24→60 插帧**已跳过**。

## 二、当前状态卡

> 每次接手**先更新这四行**，再干活。字段固定，不许改成自由叙事。

| 字段 | 当前值 |
|---|---|
| 阶段 | v1.2.3 已发布；2026-11-22 完成仓库重整（根目录上移 + Layress 治理骨架 + `apps/desktop` 成形），方向见 [`docs/engineering/plans/2026-11-22-anibox-rebuild-proposal.md`](docs/engineering/plans/2026-11-22-anibox-rebuild-proposal.md)。已知门禁缺口：ESLint 存量错误未清、Vitest 在本机沙箱未能启动，二者都还没进 CI。 |
| 活动 change | `add-portable-data-root`（数据根迁到产品目录，实施完成、**实机验证未做**，见 [`openspec/changes/add-portable-data-root/`](openspec/changes/add-portable-data-root/tasks.md)）。下一个应立 `rebuild-repo-foundation`（骨架与门禁的验收），产品向的电视模式 / RIFE / 采集串流排在后面。 |
| 代码 | `apps/desktop`（Electron main/preload/renderer）+ `packages/`（尚未拆包，不预建空包）+ 根 `scripts/`（门禁） |
| 发行 | Gitee `yuzu-tea-duck/ani-box`（origin）+ GitHub `pomelotea-yuzu/AniBox`（`github`）；便携 zip 手动打包，**push 与 tag 归用户** |

判定真相的地方：进度 ⇒ `git log --oneline` 与 `openspec/changes/archive/`；
门禁基线 ⇒ 实跑 `node scripts/check-repo.mjs --all` 的回显；
**push 状态 ⇒ 只认 `git ls-remote` 的回显，不认本文件写了什么。**

## 三、必读顺序（约 10 分钟）

1. 本文件 §一 §二 §五 §六。
2. [`openspec/config.yaml`](openspec/config.yaml) — 项目圣经：定位、技术栈、**架构不变量**、执行边界。
3. [`docs/knowledge/README.md`](docs/knowledge/README.md) — 经验库结构与本仓踩过的硬坑。
4. [`docs/development/workflow.md`](docs/development/workflow.md) — 门禁链、openspec 流程、commit 与 push 口径。
5. [`docs/README.md`](docs/README.md) — 文档地图，新文档该放哪、怎么命名。
6. [`i18n/README.md`](i18n/README.md) — 双语口径；**动手写对外文档前先确认它要不要成对**。

## 四、怎么跑起来

```bash
# 依赖（桌面端 package 自带，不要在仓库根装）
cd apps/desktop && npm install

# 开发 / 构建 / 打包（根目录有同名委托脚本，等价）
npm run dev                     # electron-vite dev
npm run build                   # clean-assets + electron-vite build
npm run package                 # build + electron-builder（沙箱内不可用，见 knowledge/engineering.md）

# 质量
npm run typecheck               # tsc -p tsconfig.node.json && tsc -p tsconfig.web.json
npm run lint                    # eslint src/（存量错误未清）
npm test                        # vitest run
npm run check                   # 根：门禁 + 桌面端 check 链

# 仓库门禁（纯 node，无依赖）
node scripts/check-repo.mjs --all       # 洁净度 + 链接 + 双语配对 + 自测
node scripts/check-repo.mjs --staged    # pre-commit：按实际索引快照跑同一条链
```

每个克隆做一次（不做就等于没有门禁）：

```bash
git config core.hooksPath .githooks
```

打包走 `apps/desktop/scripts/`（`mk-stage121.py` → asar → `pack-zip*.py`），
流水与两个坑写在 [`docs/knowledge/engineering.md`](docs/knowledge/engineering.md)。

## 五、仓库洁净度红线

用户口径：**严格控制 push 上传，仓库要干净，不传垃圾。** 落法是三层，缺一层都会被撞穿：

| 层 | 位置 | 性质 |
|---|---|---|
| 兜底忽略 | [`.gitignore`](.gitignore) | 每段写「这是什么」+「有价值的东西该去哪」。默认放行，**不是防线** |
| 机器门禁 | [`scripts/check-hygiene.mjs`](scripts/check-hygiene.mjs) | **默认拒绝**。体积、后缀、垃圾场路径、凭据形态、忽略泄露五项 |
| 可审计豁免 | [`.git-hygiene-allowlist`](.git-hygiene-allowlist) | `glob + 一句话理由`；**无理由 = 门禁失败** |

五条不许碰的：

1. **只有一个垃圾场**：`artifacts/`（一次性产物，可重跑复原）。手写结论、审阅记录、方案**不许**先扔这里再说——直接写进 `docs/` 的正确子目录。
2. **二进制不进历史**。`mpv.exe`、`libmpv-2.dll`、`ffmpeg.exe`、模型文件、便携包一律不入库；仓库只留下载/打包脚本。图标是唯一例外，已在 allowlist 登记理由。
3. **凭据零容忍**：仓库只留占位符；`.env*`、`/.mcp.json`、含绝对路径的本机配置永不入库。
4. **截图默认留本地**：`docs/reviews/**/*.png` 已忽略；验收证据真要对外展示才 `add -f` 并登记豁免。
5. **push 归用户**。智能体每完成一个有价值的代码单元就 commit，**不 push**；远程、tag 与 Release 由用户操作。

## 六、经验与坑怎么写（本仓最重要的机制）

前置经验散落在各工具的本机记忆目录里，被 `.gitignore` 整目录排除 ⇒ clone 的人拿不到。
本仓把同一套东西**入库**，并且规定格式。

落点：[`docs/knowledge/`](docs/knowledge/README.md) 五个专题，**按主题不按日期**。

| 文件 | 收什么 |
|---|---|
| `engineering.md` | 构建、打包、门禁、依赖、koffi/asar/PowerShell 通道上的坑 |
| `runtime-probe.md` | 实机硬事实：libmpv 渲染、帧率、seek、音轨/字幕切换的判据 |
| `invariants.md` | **不许重开的架构不变量**，每条给出不成立时的后果 |
| `decisions.md` | 关键决策速查：决定了什么、为什么、代价是什么 |
| `debt.md` | 未决口径与欠账，标注归谁定夺 |

四条写法纪律：

1. **一条一行一主题**，格式固定：`- [YYYY-MM-DD][级别] 现象 ⇒ 根因 ⇒ 规避 ⇒ 证据`。
   级别用 `P0` 致命 / `P1` 会误判 / `P2` 浪费时间的。
2. **只写结论，不写过程**。过程写在对应 change 的 `design.md` / `evidence-index.md`。
3. **同一坑第二次踩 ⇒ 升级**：从条目升进 `invariants.md` 或直接变成门禁/脚本断言。
4. **机器 PASS ≠ 人工通过**。播放、画面、字幕这类判定归实机复核；未执行的项**单列**，不许勾完成。

## 七、口径与纪律

- **语言**：代码注释、文档、commit message 默认中文；产品名 `AniBox` 保持英文。
- **便携优先**：业务数据跟随产品目录。解析顺序固定为
  `ANIBOX_DATA_DIR` → 便携包 `<软件目录>/data` → 开发态仓库根 `.anibox/` → 安装版系统 `userData`，
  实现在 `apps/desktop/src/main/bootstrap.ts`，启动日志会打印解析结果。
  安装版仍用系统目录属有意设计（没有可携带的产品目录），别再当成"待修"。
- **离线优先**：索引、封面、元数据都以本地缓存为准；在线链路失败必须回退而不是阻塞。
- **文档默认中文**；对外门面按 [`i18n/docs-manifest.json`](i18n/docs-manifest.json) 逐篇登记同轮维护 `*.en.md`
  （当前仅根 `README.md` ↔ `README.en.md`），成对关系由 `node scripts/check-i18n.mjs` 检查。内部文档不翻译。
- **命名**：`docs/` 内已批准并作为当前依据的方案用 `<english-kebab-case>.md`；
  探讨、调研、待批提案与当次记录用 `YYYY-MM-DD-<english-kebab-case>.md`。细则见 [`docs/README.md`](docs/README.md)。
- **单一数据源**：`main` 进程 IPC 按域拆在 `src/main/ipc/`，播放控制项定义在
  `renderer/src/components/controls/controlsData.ts`；不要在别处再抄一份常量。

## 八、目录地图

```
入库 ── 门面   README · LICENSE（MIT 原文）
        接手   AGENTS.md（唯一入口，默认中文）
        i18n   i18n/README 口径 · i18n/glossary 术语表 · i18n/docs-manifest 成对登记
        应用   apps/desktop/{src/main,src/preload,src/renderer} + resources/ + scripts/（打包脚本）
        模块   packages/                          可独立复用且可验收的模块（当前为空）
        门禁   scripts/check-repo.mjs 公共入口 · check-hygiene.mjs · check-i18n.mjs
        知识   docs/README 文档地图
              docs/guide architecture development  指南与工程说明（默认中文）
              docs/knowledge                        ★ 经验库（默认中文），见 §六
              docs/research product engineering/* reviews  过程资产
              openspec/  config.yaml + specs/ + changes/{,archive/}
        接入   .github/workflows · .gitee · .workflow · .githooks
不入库 .gitignore .git-hygiene-allowlist artifacts/ docs/drafts/ .workbuddy/ .vscode/ .anibox/
       apps/desktop/{node_modules,out,dist,models,yuc-covers} 与 *.exe/*.dll
```

`.anibox/` 是开发态数据根（库、进度、索引缓存、翻译模型），等同便携包的 `data/`；
它不入库，但**删掉等于重置库与进度**，清理前先确认。

## 九、本文件的维护规则

- 状态卡（§二）每次接手更新；其余段落**只在口径变了**时改，改不动就说明该改代码或该改门禁。
- 新增目录必须同时在 `docs/README.md` 地图与本仓对应 `README.md` 登记归属；没登记 = 归属未定，先别建。
- 每次整理文档要留「路径变更记录」（见 `docs/README.md` 末尾），否则三个月后没人知道东西搬去哪了。
