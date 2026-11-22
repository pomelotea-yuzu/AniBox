# 简短路线图

> 只有顺序与门槛，不含时间承诺。状态以 `git log` 与 `openspec/changes/archive/` 为准。

## 阶段 1：把地基立住（进行中）

- 仓库治理骨架已落地（2026-11-22）：`AGENTS.md`、`openspec/`、`docs/`、`i18n/`、门禁三层、`apps/desktop`。
- 下一个 change：**`rebuild-repo-foundation`** —— 把骨架、门禁与迁移验收写成可勾的 tasks；
  验收线包括：`node scripts/check-repo.mjs --all` 通过、`npm run typecheck` 通过、
  `npm run dev` 能起、扫库/播放/续播/切音轨切字幕可用、便携包能出且体积合理。
- 门槛：lint 与 test 至少要有一个真实绿灯，才谈把它们写进 CI 必过项。

## 阶段 2：客厅体验（`add-windows-tv-mode`）

- Windows 接 HDMI，电视当显示器：全屏片库、大字号、清楚焦点高亮，方向键/手柄完成选番→续播→切集→退出。
- 验收：真实电视上从片库到播放再返回全程不碰鼠标；退出后回到原选中项。
- 不做：电视原生 App，也不承诺电视遥控器经 HDMI 控 Windows。

## 阶段 3：插帧与采集（两条独立 change）

- **`add-windows-rife-playback`**：先用同一片段做 24→48 fps 离线 A/B，再测 RTX 3060 6GB 实时 2×。
  记录丢帧、帧时间、显存、音画同步与 seek 后恢复；撑不住必须回退原始帧率。
- **`adapt-live-capture-streams`**：分输入（采集卡 → 预览/插帧 → 屏幕或电视）与输出（本机片库 → 局域网电视），
  两条各自的判据不通用；采集标称 60 Hz 可能只是重复 30 帧，以实际独立画面为准。

## 长期

- Anime4K 三预设 + 后期滤镜（去带/AA/色彩）——已在路线内，但排在阶段 2 之后。
- 补齐自动化测试与 Lint 门禁（现在还是欠账，见 [`../knowledge/debt.md`](../knowledge/debt.md)）。
- 便携优先真正落地：数据目录显式覆盖到产品目录并可见（I7 从方向变现状）。
