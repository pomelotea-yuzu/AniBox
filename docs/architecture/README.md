# architecture/ · 架构总览

> 本文默认以中文维护。**不变量以 [`../knowledge/invariants.md`](../knowledge/invariants.md) 为准**，
> 本文只讲结构，不重复后果。

## 三进程边界

```
apps/desktop/src/
├─ main/       Electron 主进程：协议、扫描、store、libmpv bridge、IPC（按域拆在 src/main/ipc/）
├─ preload/    contextBridge 暴露的白名单 API
└─ renderer/   React 19 + Tailwind：库视图、播放器（MpvCanvas / HTML5）、设置
```

- **渲染进程不碰 Node**：文件、进程、FFI 全走 IPC。
- **IPC 按域拆分**：每个域一个模块 `registerXxxIpc(getWin)`，统一在 `main/index.ts` 注册；
  新增能力时同时改 preload 白名单。
- **单一数据源**：播放控制项与默认布局只在 `renderer/src/components/controls/controlsData.ts` 定义。

## 播放链路

```
用户点播
  └─ main: 解析路径 → 读进度/音轨偏好
       ├─ libmpv 内嵌（默认）：koffi FFI + Render API → 帧经 IPC 送到 MpvCanvas（WebGL 纹理）
       ├─ HTML5 video（回退）：anibox:// 协议支持 Range
       └─ mpv.exe 管道窗口（兜底）
```

三条引擎都要能独立跑；回退必须**自动且可见**（I1）。

## 数据流

| 链路 | 来源 | 落点 |
|---|---|---|
| 扫库 | 用户配置的根目录（chokidar 监听） | JSON store：series / episodes / progress |
| 元数据 | 本地 Bangumi dump 索引 → 在线回退 | JSON store：metadata |
| 封面 | yuc.wiki 季度页 → `userData/yuc-covers` | `anibox://cover?path=` 本地协议 |
| 新番时间表 | 本地索引按放送星期分组 + 封面缓存 | 渲染层 SeasonCalendar |

**数据根**（`main/bootstrap.ts`，`ready` 之前解析）：

```
ANIBOX_DATA_DIR  →  便携包 <软件目录>/data  →  开发态 <仓库根>/.anibox  →  安装版系统 userData
```

全仓所有持久化路径都写成 `app.getPath('userData')/…` 的函数懒加载（如 `store.storePath()`），
所以换根只需要改这一处；Chromium 的 `sessionData` 跟随 userData，不单独设。

## 关键文件

| 文件 | 职责 |
|---|---|
| `main/index.ts` | 装配：窗口、协议、mpv 后端、IPC 注册（保持轻，逻辑进 ipc/ 与专文件） |
| `main/protocol.ts` | `anibox://` 协议（文件 Range、封面） |
| `main/libmpv-bridge.ts` | koffi 绑定、SW_POINTER、事件 drain、track-list 解析 |
| `main/mpv-backend.ts` | 引擎选择与 mpv.exe 兜底 |
| `main/bangumi-index.ts` | 本地索引加载与三级标题匹配 |
| `main/cover-yuc.ts` | 季度页抓取、封面缓存与 TTL |
| `renderer/components/MpvCanvas.tsx` | WebGL 上屏、帧率自适应 |

## 打包形态

便携 zip：`electron-builder` 的 `win-unpacked` 布局 + 手工 asar 覆盖；
`resources/`、`mpv.exe`、`libmpv-2.dll` 作为 extraResources 随包走。流水见
[`../knowledge/engineering.md`](../knowledge/engineering.md)。
