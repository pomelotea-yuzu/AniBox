# 运行时硬事实（libmpv / 渲染 / 播放）

> 格式见 [`README.md`](README.md)：`- [日期][级别] 现象 ⇒ 根因 ⇒ 规避 ⇒ 证据`
> 本文件只收**实机验证过**的结论；未验证的写进 `debt.md`，不要写成事实。

## koffi 与 SW 渲染

- [2026-09-04][P0] 拿到 libmpv 帧指针后进程直接崩 ⇒ `koffi.view(Buffer)` 在 SW（software）渲染下构造的视图生命周期与 mpv 帧缓冲不同步 ⇒ 用 `koffi.address(Buffer)` 传 `SW_POINTER`（整型地址），指针必须 **4 字节对齐** ⇒ `src/main/libmpv-bridge.ts`。
- [2026-09-04][P0] 调 `mpv_command(['cycle','pause'])` / `['stop']` 必崩 ⇒ SW 渲染路径下 command 里的属性解析与事件线程竞争（原生崩溃，非 JS 异常）⇒ **SW 下禁止用 mpv_command 控制播放**，一律走 `mpv_set_property` 适配层 ⇒ `src/main/libmpv-bridge.ts` 的 setProperty 封装。
- [2026-09-04][P1] 文件播完收不到结束事件，UI 卡在"正在播放" ⇒ SW + `keep-open=yes` 时 `END_FILE` 事件不触发 ⇒ EOF 改为轮询 `eof-reached` 属性；`keep-open=yes` 必须显式设置 ⇒ 同文件 EOF 轮询逻辑。
- [2026-09-04][P1] 画面全黑，只有音频 ⇒ 2D canvas `putImageData` 画不出 libmpv 的像素格式 ⇒ 必须走 **WebGL 纹理**上屏，且 shader 里强制 `alpha = 1`（否则被预乘 alpha 弄成全透明）⇒ `src/renderer/src/components/MpvCanvas.tsx`。
- [2026-09-04][P1] 视频输出不生效、仍然黑屏 ⇒ `vo=libmpv` 必须在 `mpv_initialize` **之前**设置，初始化后再设无效 ⇒ `src/main/libmpv-bridge.ts` 初始化顺序。
- [2026-09-04][P2] 长时间播放后事件回调堆积、内存缓慢上涨 ⇒ 一次 drain 处理过多事件会阻塞渲染线程 ⇒ 事件 drain 每次上限 **50** 条 ⇒ 同文件的事件循环。

## 帧率与画质

- [2026-09-04][P1] 23.976 fps 的番剧播放时轻微抖动/丢帧 ⇒ 固定 60 Hz 轮询与片源帧率不匹配 ⇒ `FILE_LOADED` 后读 `container-fps` 动态设定轮询间隔（23.976 → 41.7 ms）⇒ `src/main/libmpv-bridge.ts`。
- [2026-09-04][P2] 高码率 4K 时 CPU 占用飙升 ⇒ 渲染分辨率过高、轮询过快 ⇒ 上限由环境变量控制：`ANIBOX_MPV_MAX_FPS`（默认 30）、`ANIBOX_MPV_RENDER_MAX`（默认 1920）⇒ 同文件常量。

## 轨道与交互

- [2026-09-04][P1] 音轨/字幕列表拿不到或字段全空 ⇒ `mpv_get_property` 返回的 `mpv_node` 需要手工按 x64 内存布局解析（`u` @0 + `format` @8；list 为 `num` @0 / `values` @8 / `keys` @16）⇒ `track-list` 用 NODE 读取 + 手写解析，别指望 koffi 自动映射 ⇒ `src/main/libmpv-bridge.ts`。
- [2026-09-04][P2] OP/ED 跳秒误触发、用户只是想快进 ⇒ 单次右键就跳太激进 ⇒ **连按 3 次右键**（600 ms 窗口内）才跳 `anchor + skipSeconds`，`skipSeconds` 取值 0–90、默认 90、`0` 表示关闭 ⇒ `src/renderer` 的右键处理。
- [2026-09-04][P1] 改设置（音量/倍速/主题）后播放器不跟随，或把默认值重复应用 ⇒ 缺失"只应用一次默认值"的栅栏 ⇒ `App` 的 `settingsVersion` 自增关闭弹窗 → `Player`/`MpvCanvas` 重拉 `getPlaybackSettings`；`settingsAppliedRef` 保证默认音量/倍速只首次应用 ⇒ `src/renderer/src/App.tsx`。
