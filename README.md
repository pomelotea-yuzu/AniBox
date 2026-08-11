# AniBox

本地番剧库管理器 + 播放器。扫描番剧目录自动生成海报墙，新番时间表追更，还能**搜索想要的番剧并一键下载 BT 资源**，点击即播。

## 功能

### 番剧管理
- **多根扫描** — 支持多个番剧目录同时管理
- **海报墙** — 封面展示、搜索筛选、类型过滤、多种排序
- **元数据刮削** — AniList GraphQL + Bangumi v0 REST 双源，自动获取中文标题、简介、评分、Staff、类型标签
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
- **一键下载** — 详情页「🔗 获取资源」复用 AnimeGarden 资源面板，复制磁力 / qBittorrent 下载 / RSS 追番，体验与新番时间表完全一致

### 资源获取与自动追番
- **🔗 获取资源** — 时间表/搜索详情弹窗一键搜索 AnimeGarden（动漫花园聚合站）的 BT 资源
- **字幕组筛选** — 内置 800+ 字幕组列表（GET /teams，1h 缓存），按名称输入过滤，选中后搜索/RSS/追番自动限定该字幕组
- **资源列表** — 标题/大小/字幕组/类型/时间，支持复制磁力链接、一键发送到 qBittorrent 下载
- **RSS 订阅** — 由 AniBox 本地代理生成（`127.0.0.1:5860`），按「番剧 + 字幕组」精确过滤，可复制链接或直接添加到 qBittorrent
- **➕ 一键追番** — 自动创建 qBittorrent 下载规则：匹配即下载，支持：
  - **翻译版本过滤**（正则）：简体 / 繁体 / 简繁内嵌 / 简日 / 繁日
  - **每番独立保存目录** — 追番时指定或直接文件夹选择器挑选
  - **封面简介自动写入** — 追番成功后自动把该番封面与简介写入保存目录（`.anibox/cover.jpg` + `metadata.json`），番剧库刷新即显示
- **版本自适应** — qBittorrent WebUI 客户端兼容 4.x / 5.x 差异（path 语义、登录响应格式）

### 播放器
- **HTML5 video 为主** — 支持 30+ 视频格式（mp4/mkv/ts/rmvb 等），4K 走硬解
- **libmpv 内嵌播放** — 编码/字幕不兼容时自动切换：mpv-2.dll + koffi 软渲染取帧，单窗口内显示（画面/字幕/控制条不割裂），1080p 流畅
- **mpv.exe 回退** — libmpv 不可用时自动回退独立窗口（Named Pipe IPC）
- **anibox:// 协议** — 自定义协议实现本地文件 Range 请求
- **播放控制** — 播放/暂停、进度条拖拽、音量、倍速、全屏、静音（libmpv 模式同样支持：快捷键 Space/←→/↑↓/M/F/0-9/?）
- **进度记忆** — 精确记住每部番的集数 + 时间位置
- **自动连播** — 看完自动下一话，支持顺序/单集循环/列表循环/随机
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
- **OP/ED 智能跳过** — 双点区间标记，所有同系列剧集自动沿用
- **音轨管理** — 自动检测多音轨，按系列记忆偏好，音频延迟+音量均衡
- **莫兰迪配色主题** — 5 套主题（暖燕麦/冷亚麻/玫瑰灰/橄榄暮/薰衣雾），ThemeProvider + CSS 变量驱动
- **全局设置** — 主题/字幕/播放/快捷键/API/下载/关于 7 个 Tab 设置页
- **快捷键** — 30+ 键盘快捷键覆盖所有操作，`?` 键呼出帮助面板

### Staff 职位翻译（日式动画术语）
监督·副监督·演出·系列构成·脚本·原作·漫画家·角色设计·角色原案·美术监督·音响监督·作画监督·总作画监督·摄影监督·3D监督·色彩设计·机械设计·原画·中间帧·动画师·上色·剪辑·制作人 等 90+ 职位

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

> ⚠️ **注意**：AnimeGarden 镜像站的服务端 RSS 过滤不可用（feed.xml filter 不生效），AniBox 通过**本地 RSS 代理**（`127.0.0.1:5860`）实时生成按「番剧 + 字幕组」过滤的订阅，因此**追番期间需保持 AniBox 运行**（qBittorrent 抓取时由 AniBox 实时提供数据）。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 桌面框架 | Electron 33 + electron-vite |
| 前端 | React 19 + TypeScript + Tailwind CSS |
| 播放 | HTML5 video（主）+ libmpv 内嵌软渲染（koffi FFI 取帧 → WebGL 显示）+ mpv.exe 回退 |
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

## 开发

```bash
# 依赖：Node.js >= 18
# libmpv 内嵌播放依赖 koffi（FFI，已含在 dependencies）；libmpv-2.dll 需与 mpv.exe 一并分发

cd anibox
npm install

# 预下载翻译模型（可选，否则首次获取番剧信息时自动下载）
node scripts/download-model.mjs

# 开发
npm run dev

# 打包
npm run package
```

> 提示：`AniBox.bat`（开发模式）与 `AniBox-prod.bat`（生产模式）可直接双击启动。
> qBittorrent 联动需在「设置 → 下载」中配置 WebUI（默认端口 8080）；RSS 追番时 AniBox 需保持运行。

---

## 鸣谢

本项目在开发过程中使用了以下外部服务与开源项目，特此鸣谢：

| 服务 / 项目 | 用途 | 链接 |
|---|---|---|
| [AniList](https://anilist.co) | 新番时间表、元数据刮削、标题校验（GraphQL API） | https://anilist.co |
| [Bangumi 番组计划](https://bgm.tv) | 元数据刮削（REST API） | https://bgm.tv |
| [AnimeGarden](https://animes.garden) | BT 资源搜索与 RSS 订阅（开放 API），聚合自动漫花园/蜜柑计划/bangumi.moe | https://animes.garden |
| [动漫花园](https://share.dmhy.org) | BT 资源数据源（经 AnimeGarden 聚合） | https://share.dmhy.org |
| [蜜柑计划](https://mikanani.me) | BT 资源数据源（经 AnimeGarden 聚合） | https://mikanani.me |
| [DeepSeek](https://platform.deepseek.com) | 新番标题/简介 AI 翻译（日→中） | https://platform.deepseek.com |
| [OpenSubtitles](https://opensubtitles.com) | 在线字幕搜索下载 | https://opensubtitles.com |
| [Hugging Face](https://huggingface.co) | opus-mt 离线翻译模型（国内走 hf-mirror.com 镜像） | https://huggingface.co |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | Whisper 离线语音识别 | https://github.com/ggerganov/whisper.cpp |
| [mpv](https://mpv.io) | 播放器兜底引擎（libmpv 内嵌软渲染 + mpv.exe 回退） | https://mpv.io |

所有在线服务的 API Key 均仅存储在本地（`userData/` 下 JSON 文件），不会上传。

---

*最后更新: 2026-08-12*
