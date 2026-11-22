# apps/ · 可交付应用

| 目录 | 应用 | 说明 |
|---|---|---|
| [`desktop/`](desktop/README.md) | AniBox 桌面端 | Electron 33 + React 19 + TS；含打包脚本与运行时二进制 |

约定：

- 一个 app 一个目录，自带 `package.json`、构建配置与打包脚本；**仓库根不放应用依赖**。
- 包内相对路径（`__dirname/../..` 指向 `resources/`、`mpv.exe`、`libmpv-2.dll`）必须保持成立，
  搬迁目录时整包一起动，不要拆散。
- 新增 app 必须同时在本表与 `docs/README.md` 登记。
