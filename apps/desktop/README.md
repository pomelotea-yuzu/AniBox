# apps/desktop/ · AniBox 桌面端

入口在仓库根 [`AGENTS.md`](../../AGENTS.md)；开发命令与门禁见
[`docs/development/workflow.md`](../../docs/development/workflow.md)。

```
desktop/
├─ src/main/       主进程：协议、扫描、store、libmpv bridge、IPC（按域拆）
├─ src/preload/    contextBridge 白名单
├─ src/renderer/   React 界面与 MpvCanvas（WebGL 上屏）
├─ resources/      图标、内置索引资源（随包分发）
├─ scripts/        打包流水（mk-stage / asar / pack-zip）与资源处理
├─ electron.vite.config.ts · electron-builder.yml · tsconfig*.json
└─ AniBox.bat / AniBox.vbs / AniBox-prod.bat   本机启动脚本
```

本目录不入库的东西（见根 `.gitignore`）：`node_modules/`、`out/`、`dist/`、`models/`、
`yuc-covers/`、`*.exe`、`*.dll`。**二进制与本机产物不要提交**，仓库只留脚本。

## 最小命令

```bash
npm install
npm run dev          # electron-vite dev
npm run typecheck    # 已通过
npm run build        # clean-assets + electron-vite build
npm run package      # build + electron-builder（本机沙箱不可用，见 knowledge/engineering.md）
```

打包走 `scripts/` 的手工流水，**不要**直接信 `electron-builder` 出包；细节见
[`docs/knowledge/engineering.md`](../../docs/knowledge/engineering.md)。
