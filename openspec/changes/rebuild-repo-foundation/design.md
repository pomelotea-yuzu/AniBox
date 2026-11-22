# 设计：仓库地基

## 目录映射（旧址 → 新址）

| 旧 | 新 | 说明 |
|---|---|---|
| `anibox/src`、`anibox/resources`、`anibox/scripts` | `apps/desktop/…` | 整包一起搬，`__dirname/../..` 的相对关系不变 |
| `anibox/electron*.ts`、`tsconfig*.json`、`eslint.config.mjs`、`electron-builder.yml` | `apps/desktop/` | package 级配置跟着 package 走 |
| `anibox/package.json`、`package-lock.json`、`pnpm-lock.yaml`、`.npmrc`、`pnpm-workspace.yaml` | `apps/desktop/` | 依赖与 lockfile 与 package 同处 |
| `anibox/{mpv.exe,libmpv-2.dll,ffmpeg.exe,d3dcompiler_43.dll}`、`models/` | `apps/desktop/` | 运行时二进制与模型，仍不入库 |
| `anibox/{AniBox.bat,AniBox.vbs,AniBox-prod.bat}` | `apps/desktop/` | 双击启动入口 |
| `stage121-123/`、`anibox-dev.log` | `artifacts/` | 一次性产物归垃圾场 |
| 便携包×3、`data/`、`mpv-dev/`、修复报告、`hosts`、`icon.png` | `D:\AniBox-Archive\`（**仓外**） | 3.4 GB 历史产物，不进新仓 |
| 根 `2026-11-22-anibox-rebuild-proposal.md` | `docs/engineering/plans/` | 过程文档归位 |

## 关键取舍

1. **为什么整包搬而不是把 `src/` 直接铺到仓库根**：`main/index.ts`、`libmpv-bridge.ts` 等 10 处用
   `join(__dirname, '../../resources')`、`'../../mpv.exe'` 定位运行时资源。只要 package 内相对结构不变，
   搬目录就是零代码改动；一旦把 `src/` 拆出去，这 10 处全要改（属 I8 打包路径不变量）。
2. **为什么 `pnpm-workspace.yaml` 放 package 内**：它的位置决定 pnpm 认哪一层是 workspace 根。
   放仓库根会把 `pnpm install` 的 node_modules 拽到根上，与"依赖跟着 package"冲突。
3. **为什么门禁只读 `git ls-files`**：门禁要判的是"要提交什么"，而不是"硬盘上有什么"。
   未跟踪的 `node_modules`、`artifacts/` 不该参与判定，`--staged` 模式因此用 `git checkout-index` 造快照。
4. **为什么 `check-i18n` 的成对登记从空开始**：当时只有中文 README，硬造 `README.en.md` 等于让门禁假装
   双语文档已就绪。登记表为空 + `pendingEn` 更诚实；后续补英文版时再登记（已在 `124995c` 完成）。

## 风险与回退

| 风险 | 处理 |
|---|---|
| 搬目录导致构建/打包路径断 | 包内相对结构不变；实机 `npm run build` 与打包各跑一次（本 change 的验收项） |
| 用户本机习惯 `cd anibox` 失效 | 根提供同名委托脚本 `npm run dev/build/...`；README/AGENTS 同步 |
| 门禁误伤历史文件 | 首轮跑出 5 处命中，逐条判断：2 处本机绝对路径（改掉）、2 处占位符误报（收紧规则）、1 处脚本自命中（拆样例） |
| 迁走后引用旧路径的脚本静默失效 | 6 个脚本改为从 `__file__` 推导；`scripts/archive/*` 保留旧路径（历史脚本，明示不用于当前发布） |

**回退办法**：`git revert` 重整提交即可回到 `anibox/` 布局；真机产物未进库，不受影响。

## 与不变量的关系

本 change 只搬运与治理，不改运行期行为；但必须保证 **I8（打包路径显式）** 与
**I2/I3/I4（libmpv 渲染禁忌）** 不受影响——前者靠 `electron-builder.yml` 与脚本自查，
后者靠"一行播放器代码未动"这一事实（`git diff` 里 `src/main/libmpv-bridge.ts` 只改了 `DEV_DLL` 常量）。
