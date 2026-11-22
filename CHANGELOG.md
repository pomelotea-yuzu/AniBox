# 更新日志

> **语言 / Language:** [English](CHANGELOG.en.md) | 简体中文

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。
各版本的完整发布文案与下载见 [Gitee Releases](https://gitee.com/yuzu-tea-duck/ani-box/releases)
与 [GitHub Releases](https://github.com/pomelotea-yuzu/AniBox/releases)。

> 本表自 1.2.1 起回填，**更早的版本不回填**（没有可靠记录就不补造）。日期是构建日期，
> 以 Release 页为准。

## [Unreleased]

- **仓库地基重整（2026-11-22）**：仓库根上移到 `D:\AniBox`，应用整体迁入 `apps/desktop/`；
  引入 Layress 式治理骨架（`AGENTS.md`、`openspec/`、`docs/`、`i18n/`、`packages/`、`artifacts/`）
  与洁净度三层门禁（`.gitignore` + `check-hygiene` + allowlist），pre-commit 与两侧 CI 共用
  `scripts/check-repo.mjs`。详见 `openspec/changes/rebuild-repo-foundation/`。
- **数据根迁到产品目录（2026-11-22）**：开发态改用仓库根 `.anibox/`，便携版继续用 `<软件目录>/data`，
  支持 `ANIBOX_DATA_DIR` 覆盖；首次启动把系统 `userData` 的旧数据一次性迁移（跳过 Chromium 缓存与
  `stream-cache`），启动日志打印实际数据目录。安装版行为不变。详见
  `openspec/specs/data-root/spec.md`。
- **对外门面补齐**：`README` / `CHANGELOG` / `CONTRIBUTING` / `SECURITY` / `CODE_OF_CONDUCT`
  中英成对；GitHub issue 表单与 PR 模板、Gitee 纯中文模板。
- **打包脚本去绝对路径**：`mk-stage121` / `pack-zip*` / `stage-index` / 图标脚本改为从脚本位置推导，
  stage 目录与便携 zip 改落 `artifacts/`；`AniBox.bat` / `AniBox-prod.bat` 不再写死本机 Node 路径。

## [1.2.3] — 2026-09-08

- **内置番剧索引随包分发**：`resources/anibox-index/` 预置 Bangumi 裁剪索引，启动时缺则自动装进数据根；
  没有它新番时间表与元数据刮削只能回退在线源（当时在线源已大面积不可用）。
- **封面缓存持久化**：`yuc-covers/` 下按季度缓存页面 JSON（当前季 12 h / 历史 30 d）与图片
  （200 MB 上限按 mtime 淘汰）；渲染统一走 `anibox://cover?path=` 本地协议，绕开图床防盗链。
- **打包流水补坑**：stage 目录改增量覆盖（批量删除会被本机钩子拦），`pack-zip` 排除便携版运行后生成的 `data/`。

## [1.2.2] — 2026-09-07

- **封面来源改为 yuc.wiki 季度页**：按季度页匹配中文标题/别名下载封面；本地抽帧方案否决（慢且不代表作品）。
- **本地索引查表接入元数据链路**：`fetchFullMetadata` 先查本地索引，标题三级匹配
  （精确 / 包含 / Levenshtein），未命中再回退在线。
- **新番时间表切本地索引**：按放送星期分组，封面用本地缓存；AniList 链路保留为回退。

## [1.2.1] — 2026-08-28

- **局域网串流大升级**：手机/iPad 浏览器直接看番；默认口令访问（口令不再明文出现在页面源码）；
  10bit HEVC 硬件转码（NVENC → QSV → AMF）与 8bit HEVC 免转码直放；
  整集缓存后播放 + 后台预转下一集；电脑与手机进度双向同步；外挂字幕 srt/ass 转 VTT。
- **播放器**：三引擎回退（HTML5 → libmpv 内嵌 → mpv.exe 窗口）稳定化；自定义控件与 30+ 快捷键；
  倍速 9 档 + 自定义；画中画；截图；AB 循环；OP/ED 三连右键跳 90 秒。
- **便携版**：数据随软件走（`data/`），首次启动从系统用户目录搬迁旧数据。
