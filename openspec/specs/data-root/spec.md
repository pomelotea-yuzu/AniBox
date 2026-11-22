# 规格：data-root（数据根解析与迁移）

- 状态：现行（2026-11-22 起生效）
- 来源：`openspec/changes/archive/2026-11-22-add-portable-data-root/`
- 实现：`apps/desktop/src/main/bootstrap.ts`（在 `ready` 之前由 `index.ts` 首个 import 执行）

## R1 解析优先级

数据根必须在任何 `userData` 访问之前解析，优先级固定：

1. 环境变量 `ANIBOX_DATA_DIR`（非空即用，解析为绝对路径）；
2. 便携包：`<软件目录>/.portable` 存在 → `<软件目录>/data`；
3. 开发态：未打包且仓库根存在 `AGENTS.md` → `<仓库根>/.anibox`；
4. 其余（安装版）：Electron 默认 `userData`。

### 场景：开发态启动
- 给定 `app.isPackaged === false` 且 `<repo>/AGENTS.md` 存在
- 当应用启动
- 则 `app.getPath('userData')` 指向 `<repo>/.anibox`，日志打印该绝对路径

### 场景：显式覆盖
- 给定 `ANIBOX_DATA_DIR=D:\tmp\anibox-test`
- 当应用启动
- 则数据根为该路径，日志来源标注 `ANIBOX_DATA_DIR`

### 场景：非本仓目录
- 给定未打包、推断出的仓库根没有 `AGENTS.md`
- 当应用启动
- 则**不**创建 `.anibox/`，回落安装版默认行为

## R2 一次性迁移

新数据根为空且系统默认 `userData` 存在时，把旧目录顶层条目复制过去（不删源）。

### 场景：首次开发态启动
- 给定系统 `userData` 含 `anibox-store.json`、`anibox-index/`、`models/`
- 且 `<repo>/.anibox` 不存在或为空
- 当应用启动
- 则上述条目出现在 `.anibox/` 下，日志打印迁移项数

### 场景：不重复迁移
- 给定 `.anibox/` 已有任意条目
- 当应用启动
- 则不做任何复制

### 场景：跳过易变缓存
- 给定旧目录含 `Cache/`、`GPUCache/`、`stream-cache/`
- 当执行迁移
- 则三者都不被复制

## R3 可验证性

启动日志必须打印实际数据根与来源：

```
[AniBox] 数据目录（开发模式）= D:\AniBox\.anibox
```

来源枚举：`ANIBOX_DATA_DIR` / `便携模式` / `开发模式` / `安装版默认`。

### 场景：用户自查
- 给定任意启动方式
- 当应用启动
- 则日志中必有且仅有一行数据根声明

## R4 内置索引在开发态也生效

未打包时索引来源为 `apps/desktop/resources/anibox-index/`，打包后为 `process.resourcesPath`；
目标目录缺 `core.json.gz` 时才安装，已有不覆盖。

## 不在本规格范围

安装版数据位置（保持系统 `userData`，有意为之）、设置页 UI 展示数据目录（见
`docs/knowledge/debt.md`）、`models/` 与 `yuc-covers/` 的历史副本搬迁。
