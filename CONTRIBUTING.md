# 贡献指南

> **语言 / Language:** [English](CONTRIBUTING.en.md) | 简体中文

谢谢愿意参与 AniBox！这是一份简短的合作约定。使用问题先看 [README](README.md) 与
[快速开始](docs/guide/README.md)。

## 参与方式

文档勘误、最小复现、测试改进、代码修复都欢迎。小范围文档修正可直接提 PR；功能建议先说明真实
使用场景、当前做法和预期结果，再讨论范围——**已被明确"不做"的方向**（Mac 正式发行、独立电视端 App、
本地硬盘直插电视、24→60 插帧、超分与插帧同时开）见
[路线图](docs/product/roadmap.md)，重复提不会让它们回到范围里。

反馈走 [GitHub Issues](https://github.com/pomelotea-yuzu/AniBox/issues) 或
[Gitee Issues](https://gitee.com/yuzu-tea-duck/ani-box/issues)。同一问题已有记录时优先补充原话题；
两端规则一致，不要求重复提 PR。

## 开发环境

- Windows 10/11 x64（**当前唯一打包与验收目标**）
- Node.js **≥ 20**，包管理用 pnpm ≥ 11
- 运行时依赖 `libmpv-2.dll`、`mpv.exe`、`ffmpeg.exe` 必须就位（仓库不入库，见 `.gitignore`）

```bash
cd apps/desktop
pnpm install
pnpm dev            # 开发模式
npm run typecheck   # 类型检查（当前通过）
npm run lint        # 存量错误未清，暂不作为门禁
npm test            # vitest

node scripts/check-repo.mjs --all   # 仓库门禁（在仓库根跑）
```

工作流、OpenSpec 流程与打包口径见 [docs/development/workflow.md](docs/development/workflow.md)；
踩过的坑与已知欠账见 [docs/knowledge/](docs/knowledge/README.md)。

## 提交改动

1. 从 `main` 拉分支，一个 PR 聚焦一件事；开始前看关联 issue 与
   [活动 change](openspec/changes/README.md)，避免重复改正在处理的内容。
2. 影响能力语义的改动先提交 OpenSpec proposal（`openspec/changes/<verb-led-name>/`），
   写清兼容性与验收条件；错别字、链接修复不必立项。
3. PR 里说明：问题、改动、关联 issue/change、验证结果、剩余限制。草稿 PR 不等于可合入。
4. 申请合入前跑 `node scripts/check-repo.mjs --all`；**播放器、渲染、打包、数据根**相关的改动
   必须附 Windows 实机验证（播放/字幕/音轨/seek 至少一项），并在 PR 里复述受影响的不变量
   （[`docs/knowledge/invariants.md`](docs/knowledge/invariants.md) 的 I1–I11）。
5. 环境限制导致某项没跑，就写明命令、阻碍与未覆盖范围，**不要勾成通过**；旧提交的绿灯不能代替
   新提交的验证。
6. 用户可见行为变化要同步 README 与 `docs/guide/`；提交标题写清具体改动（如
   `docs: 同步数据根口径`），背景与验证细节写正文。

## 代码约定

- TypeScript strict；UI 在 `apps/desktop/src/renderer/`，文件系统/媒体/原生依赖在 `src/main/`，
  跨进程接口只经 `src/preload/`。
- **单一数据源**：IPC 按域拆在 `src/main/ipc/`；播放控件与默认布局只在
  `renderer/src/components/controls/controlsData.ts` 定义，不要在别处再抄一份。
- 注释与文档默认中文；日志与错误信息要对用户可读（关键路径打数据目录、引擎选择、回退原因）。

## 数据与隐私

- 提 issue 或 PR 时**不要上传整个 `data/` 或 `.anibox/` 目录**：里面有媒体库绝对路径、观看进度、
  访问口令与可能的 API key。
- 日志只贴相关片段，先去掉路径中的用户名与磁盘结构。
- 涉及漏洞、口令、路径逃逸的，按 [SECURITY.md](SECURITY.md) 走私密渠道。

## 许可

提交贡献表示你有权提供该内容，并同意原创部分按项目 [MIT 许可证](LICENSE) 分发，不要求转让著作权。
第三方内容沿用其原许可；引入代码、图标、字体、文档片段时请列出来源、版本、许可与修改情况。

## 行为准则

参与即表示同意 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)（[English](CODE_OF_CONDUCT.en.md)）。
