# 规格：data-root（数据根解析与迁移）

## 需求

### R1 解析优先级

系统必须在应用初始化早期（任何 `userData` 访问之前）解析数据根，优先级固定为：

1. 环境变量 `ANIBOX_DATA_DIR`（非空即用，按路径解析为绝对路径）；
2. 便携包：`<软件目录>/.portable` 存在时用 `<软件目录>/data`；
3. 开发态：未打包且仓库根存在 `AGENTS.md` 时用 `<仓库根>/.anibox`；
4. 其余（安装版）：Electron 默认 `userData`。

#### 场景：开发态启动
- 给定 `app.isPackaged === false`，且 `<repo>/AGENTS.md` 存在
- 当应用启动
- 则 `app.getPath('userData')` 指向 `<repo>/.anibox`，且日志打印该绝对路径

#### 场景：显式覆盖
- 给定 `ANIBOX_DATA_DIR=D:\tmp\anibox-test`
- 当应用启动（无论便携还是开发态）
- 则数据根为该路径，日志标注来源为 `ANIBOX_DATA_DIR`

#### 场景：非本仓目录
- 给定未打包且推断出的仓库根没有 `AGENTS.md`
- 当应用启动
- 则**不**创建 `.anibox/`，回落到安装版默认行为

### R2 一次性迁移

新数据根为空且系统默认 `userData` 存在时，把旧目录的顶层条目搬过去（复制，不删源）。

#### 场景：首次开发态启动
- 给定系统 `userData` 里有 `anibox-store.json`、`anibox-index/`、`models/`
- 且 `<repo>/.anibox` 不存在或为空
- 当应用启动
- 则上述条目出现在 `.anibox/` 下，日志打印迁移项数

#### 场景：不重复迁移
- 给定 `.anibox/` 已有任意条目
- 当应用启动
- 则不做任何复制

#### 场景：跳过易变缓存
- 给定旧目录含 `Cache/`、`GPUCache/`、`stream-cache/`
- 当执行迁移
- 则三个目录都不被复制

### R3 可验证性

启动日志必须打印实际数据根与其来源，格式形如：

```
[AniBox] 数据目录（开发模式）= D:\AniBox\.anibox
```

#### 场景：用户自查
- 给定任意启动方式
- 当应用启动
- 则日志中必有一行可读的数据根声明（安装版标注"安装版默认"）

### R4 内置索引在开发态也生效

未打包时，索引来源为 `apps/desktop/resources/anibox-index/`；打包后为 `process.resourcesPath`。
目标目录缺 `core.json.gz` 时才安装，已有不覆盖。

## 不涉及

安装版数据位置、设置页 UI 展示、`models/` 与 `yuc-covers/` 的历史副本搬迁。
