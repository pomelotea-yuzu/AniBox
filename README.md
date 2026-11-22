# AniBox

本地番剧库管理器 + 播放器。扫描番剧目录自动生成海报墙，新番时间表追更，内置番剧检索与资源索引，点击即播。**局域网串流**让手机 / iPad 打开浏览器就能看电脑里的番剧。

## 项目地址

- **Gitee（国内仓库）**: https://gitee.com/yuzu-tea-duck/ani-box
- **GitHub**: https://github.com/pomelotea-yuzu/AniBox
- **Releases 下载**: https://gitee.com/yuzu-tea-duck/ani-box/releases · https://github.com/pomelotea-yuzu/AniBox/releases

## 快速开始

**普通用户（便携版）**
1. 下载 `AniBox-x.y.z-portable-x64.zip`（见上方 Releases 页），解压后双击 `AniBox.exe`
   - **便携版数据随软件走**：缓存/配置/进度都存放在软件目录的 `data/` 文件夹，随整个文件夹拷贝迁移，C 盘零占用
2. 首次使用点 **手动添加** 选择番剧目录（或直接在「搜索番剧」页在线检索）
3. 可选：在 **设置 → 下载** 配置下载客户端的 WebUI，解锁「一键下载 / 追番」
4. **手机/iPad 看番**：**设置 → 串流** 勾选「启用局域网串流」→ 手机连同一 WiFi → 浏览器打开显示的地址（形如 `http://192.168.x.x:17830`）→ 输入访问口令 → 选番剧开看，无需安装 App

**开发者**
```bash
cd apps/desktop
pnpm install      # 原生依赖（electron/esbuild/koffi 等）构建已由同目录 pnpm-workspace.yaml 放行
pnpm dev          # 开发模式

# 也可以在仓库根用同名委托脚本：pnpm dev / pnpm typecheck / pnpm build / pnpm package
```

仓库门禁（纯 node，不需要装依赖）：

```bash
node scripts/check-repo.mjs --all      # 洁净度 / 链接 / 双语登记 / 自测
git config core.hooksPath .githooks    # 每个克隆做一次，之后 pre-commit 自动跑同一条链
```

**数据落在哪**：开发态是仓库根的 `.anibox/`（启动日志会打印 `[AniBox] 数据目录（开发模式）= …`，
旧数据首次启动自动从系统 userData 搬一次）；便携版是 `<软件目录>/data`；
需要临时换一个干净数据根时设 `ANIBOX_DATA_DIR=<路径>`。

> 环境要求：Windows 10/11，Node.js ≥ 20（pnpm 11 要求）与 pnpm ≥ 11。
> 运行期需要 `libmpv-2.dll` 与 `mpv.exe` 与应用一同分发（内嵌播放与兜底播放引擎）。
> 局域网串流的 mkv/HEVC 转码依赖 `ffmpeg.exe`：应用会自动检测（应用目录 / PATH / userData），缺失时自动下载，也可手动放置到应用目录。

---

## 功能

### 番剧管理
- **多根扫描** — 支持多个番剧目录同时管理
- **海报墙** — 封面展示、搜索筛选、类型过滤、多种排序
- **元数据刮削** — AniList GraphQL + Bangumi v0 REST 双源，自动获取中文标题、简介、评分、Staff、类型标签；**Staff 职位自动中文化**（监督/演出/系列构成/作画监督… 90+ 日式动画职位术语）
- **本地翻译** — 内置 Helsinki-NLP/opus-mt-en-zh 模型（~114MB），离线 EN→ZH 翻译；搭配 200+ 动漫短语词典 + 130+ 句式模板
- **标题校验** — AniList 在线校验文件夹标题，给出建议
- **追番状态** — 在看/已追/弃番
- **收藏 & 播放列表** — 收藏番剧，自定义播放列表
- **最近观看** — 首页展示最近观看历史，点击续播

### 新番时间表
- **AniList 按季拉取** — 当前季度日本 TV 动画（按人气排序），缓存复用不重复请求
- **AI 标题翻译** — DeepSeek 批量日→中翻译标题与简介（有 API Key 时；无 Key 自动回退本地模型）
- **星期分组** — 按播出日排列、今天高亮、距播出倒计时、待定播出日分区
- **详情弹窗** — 封面/评分/制作公司/类型/播出时间/简介一站式展示

### 搜索番剧
- **在线搜索** — 输入番剧名（中/日/英文）搜索 AniList 番剧库，中文关键词自动经 Bangumi 转换为日文原名兜底
- **卡片展示** — 封面/评分/集数/类型/状态卡片网格，附热门番剧快捷搜索建议
- **详情弹窗** — 评分/制作公司/类型/播出时间/简介一站式展示
- **获取资源** — 详情页「🔗 获取资源」接入第三方番剧索引服务，复制资源链接 / 推送到下载客户端 / 订阅更新，体验与新番时间表完全一致

### 资源检索与自动追番
- **🔗 获取资源** — 时间表/搜索详情弹窗一键检索第三方公开番剧索引服务（AnimeGarden）
- **字幕组筛选** — 内置 800+ 字幕组列表（GET /teams，1h 缓存），按名称输入过滤，选中后搜索/RSS/追番自动限定该字幕组
- **资源列表** — 标题/大小/字幕组/类型/时间，支持复制资源链接、一键推送到下载客户端
- **RSS 订阅** — 由 AniBox 本地生成（`127.0.0.1:5860`），按「番剧 + 字幕组」精确过滤，可复制链接或直接添加到下载客户端
- **➕ 一键追番** — 自动创建下载客户端的订阅规则：匹配即下载，支持：
  - **翻译版本过滤**（正则）：简体 / 繁体 / 简繁内嵌 / 简日 / 繁日
  - **每番独立保存目录** — 追番时指定或直接文件夹选择器挑选
  - **封面简介自动写入** — 追番成功后自动把该番封面与简介写入保存目录（`.anibox/cover.jpg` + `metadata.json`），番剧库刷新即显示
- **版本自适应** — qBittorrent WebUI 客户端兼容 4.x / 5.x 差异（path 语义、登录响应格式）

### 局域网串流（1.2.1 大升级）
- **手机/iPad 直接看番** — 电脑端「设置 → 串流」一键开启，手机浏览器访问地址即可浏览番剧库并播放，免安装 App
- **口令访问** — 默认开启访问口令（设置页可开关/重置），口令不再明文暴露在页面源码
- **播放器 UI 对齐桌面主播放器** — 缓冲进度 + 已播填充、倍速菜单（9 档+自定义）、字幕多轨切换、选集面板、截图、画中画、画面比例、播放模式（顺序/单集循环/列表循环/随机）；控制条 3 秒无操作自动隐藏
- **10bit HEVC 番剧专项** — 8bit HEVC 免转码秒开（hvc1 标记，iPad Safari 原生支持）；10bit HEVC 自动硬件加速转 8bit HEVC（NVENC → QSV → AMF，体积小画质佳）；智能决策（探测设备解码能力 + ffprobe 位深），无法实现的功能统一提示「串流模式下无法使用」
- **整集缓存完再播放** — 无片段割裂、无卡壳；播放中**后台预转下一集**，切集秒开
- **转码引擎零配置** — 自动检测 ffmpeg（应用目录 / PATH / userData），缺失时自动下载（BtbN / gyan.dev 构建），也可手动放置
- **产物缓存** — 转封装/转码结果缓存于 `userData/stream-cache`，同一集再次播放秒开；设置页「存储」可查看大小并一键清理
- **进度双向同步** — 手机看到一半，电脑接着看
- **外挂字幕** — srt / ass 自动转 VTT 显示（与视频同目录、文件名含集号）
- **访问安全** — 默认开启访问口令；仅暴露扫描根目录内的文件；端口被占自动跳转

### 播放器
- **HTML5 video 为主** — 支持 30+ 视频格式（mp4/mkv/ts/rmvb 等），4K 走硬解
- **libmpv 内嵌播放** — 编码/字幕不兼容时自动切换：mpv-2.dll + koffi 软渲染取帧，单窗口内显示（画面/字幕/控制条不割裂），1080p 流畅
- **mpv.exe 回退** — libmpv 不可用时自动回退独立窗口（Named Pipe IPC）
- **anibox:// 协议** — 自定义协议实现本地文件 Range 请求
- **播放控制** — 播放/暂停、进度条拖拽、音量、倍速、全屏、静音（libmpv 模式同样支持：快捷键 Space/←→/↑↓/M/F/0-9/?）
- **进度记忆** — 精确记住每部番的集数 + 时间位置
- **自动连播** — 看完自动下一话（快进到底同样触发），支持顺序/单集循环/列表循环/随机
- **Anime4K 实时超分** — WebGL 管线（边缘上采样 + Unsharp Mask + Debanding + FXAA），三档预设，A/B 对比
- **AB 循环** — 标记起点终点循环播放
- **画中画** — 系统级画中画
- **截图保存** — 一键截图保存为 PNG

### 字幕
- **本地字幕自动匹配** — 扫描父目录 + subs/字幕子目录，跨文件名集号匹配
- **双语字幕** — Canvas 渲染双轨字幕，独立字体/颜色/描边/位置
- **在线搜索下载** — OpenSubtitles.com API
- **字幕样式设置** — 字体、描边、颜色、背景透明度
- **VTT 转换** — ASS/SSA/SRT → VTT 自动转换

### AI 功能（生肉辅助）
- **Whisper 语音识别** — whisper.cpp 离线识别，FFmpeg 提取音频 → SRT 字幕
- **日语词典** — 90+ 动漫常用词，支持精确+模糊匹配，悬浮查词

### 弹幕
- **B 站弹幕抓取** — 按番剧名+集号自动匹配
- **本地发送** — 播放时发送本地弹幕
- **导入/导出** — 支持 XML 格式
- **过滤** — 关键词+正则过滤

### 其他
- **OP/ED 智能跳过** — 快捷键模式：连按 3 次右方向键跳过 90 秒（OP/ED 固定时长），控制条一键开关
- **音轨管理** — 自动检测多音轨，按系列记忆偏好，音频延迟+音量均衡
- **莫兰迪配色主题** — 5 套主题（暖燕麦/冷亚麻/玫瑰灰/橄榄暮/薰衣雾），ThemeProvider + CSS 变量驱动
- **全局设置** — 主题/字幕/播放/快捷键/API/下载/串流/存储/关于 9 个 Tab 设置页（「存储」页展示数据根目录、各缓存大小与一键清理）
- **快捷键** — 30+ 键盘快捷键覆盖所有操作，`?` 键呼出帮助面板

---

## qBittorrent 联动使用指南

### 1. 开启 qBittorrent WebUI（一次性）

qBittorrent → **工具 → 选项 → Web UI**：
- 勾选 **"Web 用户界面（远程控制）"**
- 记下端口（默认 `8080`）与用户名（默认 `admin`）
- 凭据二选一：
  - **省事**：勾选 **"对本地主机跳过身份验证"** → AniBox 密码可留空
  - **标准**：设置用户名/密码（5.x 首次启用会生成随机临时密码，可在该页面修改）

### 2. AniBox 配置（一次性）

AniBox → **设置 → 下载**：
- 填 WebUI 地址（`127.0.0.1`）、端口、用户名、密码
- **默认保存路径**（可选）：单集下载与追番的兜底目录
- 点 **测试连接** → `✓ 连接成功 (v5.x)` → **保存配置**

### 3. 单集下载

**新番时间表** 或 **搜索番剧** → 点开番剧 → **🔗 获取资源** → 找到目标资源 → **⬇ 下载**，任务直接进 qBittorrent。

### 4. 一键追番（自动下载整部番）

**新番时间表** 或 **搜索番剧** → 详情 → **🔗 获取资源** → 目标字幕组的资源行点 **➕ 追番**：
1. **保存文件夹**：填该番专属目录，或点 **📁 选择…** 用系统文件夹选择器挑选（留空用默认目录）
2. **翻译版本**：选择下载规则要过滤的字幕标记 —— 简体 / 繁体 / 简繁内嵌 / 简日 / 繁日（或不限）
3. 点 **开始追番** → 自动完成：创建 RSS 订阅 + 创建下载规则「AniBox-番名-字幕组-版本」

之后 qBittorrent 每次抓取订阅，匹配到的新剧集**自动下载到指定目录**，无需再手动操作。

> 💡 追番成功后会**自动把该番的封面与简介**写入保存目录的 `.anibox/`（`cover.jpg` + `metadata.json`）。把该目录加入番剧库（扫描根目录）并刷新，海报墙即可直接显示封面与简介。

### 5. 管理订阅与规则

- **查看订阅**：qBittorrent → **工具 → RSS 阅读器** → 左侧列表（`AniBox-xxx` 节点）
- **查看/修改规则**：qBittorrent → **工具 → 选项 → RSS → 修改自动下载规则** → 找到「AniBox-番名」规则，可改匹配词、保存路径
- **立即触发**：RSS 阅读器顶部 **"Update all"** 强制抓取并执行规则
- **删除订阅**：RSS 阅读器里右键订阅 → 删除

> ⚠️ **注意**：AnimeGarden 服务端的 RSS 过滤不可用（feed.xml filter 不生效），AniBox 通过**本地 RSS 服务**（`127.0.0.1:5860`）实时生成按「番剧 + 字幕组」过滤的订阅，因此**追番期间需保持 AniBox 运行**（qBittorrent 抓取时由 AniBox 实时提供数据）。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron 33 + electron-vite |
| 前端 | React 19 + TypeScript + Tailwind CSS |
| 播放 | HTML5 video（主）+ libmpv 内嵌软渲染（koffi FFI 取帧 → WebGL 显示）+ mpv.exe 回退 |
| 局域网串流 | Node.js 内置 http（Range 流式 + 口令鉴权）+ mpv IPC 编码探测 + ffprobe 位深 + ffmpeg 转封装/硬件转码（fragmented mp4，整集缓存 + 后台预转下一集） |
| 存储 | JSON 文件（anibox-store.json，debounce 写入 + 原子保存） |
| 扫描 | Node.js fs 递归 + 跨文件夹合并算法 |
| 搜索 | AniList GraphQL（番剧库）+ Bangumi v0（中文转原名兜底） |
| 元数据 | AniList GraphQL + Bangumi v0 REST API |
| 翻译模型 | Helsinki-NLP/opus-mt-en-zh（ONNX Runtime, @xenova/transformers） |
| 配色主题 | React Context + CSS 变量桥接，5 套莫兰迪色系 |
| 打包 | electron-builder |

---

## 目录兼容性

典型结构即可识别：

```
F:/季度新番/
  鬼灭之刃 第一季 立志篇/
    [VCB-Studio] Kimetsu [01].mkv
    [VCB-Studio] Kimetsu [02].mkv
  铃芽之旅/
    [DBD-Raws][铃芽之旅][1080P][BDRip]/
      [DBD-Raws] Suzume [01].mkv

F:/收藏/
  进击的巨人/
    进击的巨人 第一季/
      [SubGroup] Shingeki [01].mkv
```

扫描引擎自动处理 BD 压制组嵌套（回退继承父目录中文标题）、非番剧子目录过滤（PV/menu/特典映像等）、跨文件夹合并（Levenshtein 相似度 ≥85%）。

---

## 项目结构

```
仓库根/
├─ AGENTS.md       唯一接手入口：状态卡、必读顺序、洁净度红线
├─ apps/desktop/   AniBox 应用本体
│  ├─ src/main/       Electron 主进程：扫描、元数据/字幕/弹幕抓取、libmpv bridge、qBittorrent 联动、局域网串流（stream-server / video-probe / transcode）
│  ├─ src/preload/    预加载脚本（IPC 桥，contextBridge 暴露 window.electronAPI）
│  ├─ src/renderer/   React 渲染进程：海报墙、播放器（Player/MpvCanvas）、时间表、搜索、设置
│  ├─ resources/      应用图标等静态资源
│  └─ scripts/        模型下载、索引预置、便携版打包（子目录 archive/ 为历史发布脚本）
├─ docs/          文档地图：指南 / 架构 / 开发流程 / 经验库 / 方案与调研
├─ openspec/      规格与变更（config.yaml + specs/ + changes/）
├─ scripts/       仓库门禁：check-repo / check-hygiene / check-i18n
├─ packages/      可复用模块（当前为空，不预拆空包）
├─ .anibox/       开发态数据根（库/进度/索引缓存/模型；不入库，等同便携包的 data/）
└─ apps/desktop/pnpm-workspace.yaml   pnpm 11 构建白名单（allowBuilds），随 package 存放
```

一次性产物只放 `artifacts/`（不入库）；`apps/desktop` 下的 `node_modules`、`out`、`dist`、
`models`、`yuc-covers` 与 `*.exe`、`*.dll` 均不入库。

---

## 开发

接手先读 [`AGENTS.md`](AGENTS.md)：状态卡、必读顺序与洁净度红线都在那里，本文不复述。
应用本体在 [`apps/desktop/`](apps/desktop/README.md)；仓库根只放治理与门禁，不放应用依赖。
Windows 是当前主平台。UI 放在 `apps/desktop/src/renderer/`，文件系统、媒体处理与原生依赖留在 `apps/desktop/src/main/`，跨进程接口由 `apps/desktop/src/preload/` 暴露。

小改动直接实现并检查；涉及播放器、串流、打包或跨平台的改动，先写清方案、验收条件和回退方式，再分步实施。
自动检查与 Windows 实机验收分别记录，未执行的步骤不计为通过。

```bash
# 依赖：Node.js >= 20（pnpm 11 要求）、pnpm >= 11
# 原生依赖（electron/esbuild/koffi/onnxruntime-node/sharp）的构建脚本已通过
# apps/desktop/pnpm-workspace.yaml 的 allowBuilds 放行，首次 pnpm install 会自动下载/编译（需联网）

cd apps/desktop
pnpm install

# 预下载翻译模型（可选，否则首次获取番剧信息时自动下载）
node scripts/download-model.mjs

# 开发
pnpm dev

# 按序运行类型检查、lint 与单元测试，第一项失败时停止
npm run check

# 单项排查：npm run typecheck / npm run lint / npm test

# Windows NSIS 安装包（与便携 ZIP 是两条路径）
pnpm package
```

> 聚合检查与发布验收是两回事。若现有 lint 问题阻断了聚合命令，仍可单独运行 `npm test`，分别记录结果；不要跳过 lint 并将其记为通过。
>
> 提示：`apps/desktop/AniBox.bat`（开发模式）与 `AniBox-prod.bat`（生产模式）可直接双击启动。
> qBittorrent 联动需在「设置 → 下载」中配置 WebUI（默认端口 8080）；RSS 追番时 AniBox 需保持运行。

---

## 鸣谢

本项目在开发过程中使用了以下外部服务与开源项目，特此鸣谢：

| 服务 / 项目 | 用途 | 链接 |
|---|---|---|
| [AniList](https://anilist.co) | 新番时间表、元数据刮削、标题校验（GraphQL API） | https://anilist.co |
| [Bangumi 番组计划](https://bgm.tv) | 元数据刮削（REST API） | https://bgm.tv |
| [AnimeGarden](https://animes.garden) | 番剧资源索引与 RSS 订阅（开放 API） | https://animes.garden |
| [DeepSeek](https://platform.deepseek.com) | 新番标题/简介 AI 翻译（日→中） | https://platform.deepseek.com |
| [OpenSubtitles](https://opensubtitles.com) | 在线字幕搜索下载 | https://opensubtitles.com |
| [Hugging Face](https://huggingface.co) | opus-mt 离线翻译模型（国内走 hf-mirror.com） | https://huggingface.co |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Whisper 离线语音识别 | https://github.com/ggerganov/whisper.cpp |
| [mpv](https://mpv.io) | 播放器兜底引擎（libmpv 内嵌软渲染 + mpv.exe 回退） | https://mpv.io |
| [FFmpeg](https://ffmpeg.org) | 局域网串流转封装/转码（静态构建：BtbN / gyan.dev） | https://ffmpeg.org |

所有在线服务的 API Key 均仅存储在本地（`userData/` 下 JSON 文件），不会上传。

---

*最后更新: 2026-11-22（仓库重整：Layress 治理骨架 + `apps/desktop`）*
