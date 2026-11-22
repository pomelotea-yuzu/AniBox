# 任务：add-portable-data-root

> 完成状态只在这里维护。机器能判的写"已验证（命令）"，实机才能判的写"未执行"。

## 实现

- [x] `bootstrap.ts` 头部注释改写为四档解析优先级
- [x] 新增 `detectDevDataDir()`（未打包 + `<repo>/AGENTS.md` 握手 → `<repo>/.anibox`）
- [x] 新增 `resolveResourcesDir()`（打包用 `resourcesPath`，开发用 package 内 `resources/`）
- [x] 解析顺序：`ANIBOX_DATA_DIR` → 便携 → 开发态 → 安装版默认
- [x] 启动日志打印数据根与来源（`安装版默认` / `便携模式` / `开发模式` / `ANIBOX_DATA_DIR`）
- [x] `MIGRATION_SKIP` 增加 `stream-cache`
- [x] `ensureBundledIndex` 在开发态也生效（传 `resolveResourcesDir()`）
- [x] `.gitignore` 增加 `.anibox/` 与注释
- [x] 文档同步：`invariants.md` I7、`debt.md`、`AGENTS.md`、`README.md`、`architecture/README.md`、`docs/guide/README.md`

## 验证

- [x] 静态核对：`bootstrap.ts` 仍是 `index.ts` 的首个 import（`setPath` 先于其他模块）
- [x] 静态核对：`bootstrap.test.ts` 只直接调 `migrateLegacyUserData` / `ensureBundledIndex`，签名未变
- [ ] **未执行**：`npm run typecheck`（本会话的 node 被沙箱限制，见 `docs/knowledge/engineering.md`）
- [ ] **未执行**：`npm run dev` 实机确认日志打印 `.anibox` 且旧库/进度能打开
- [ ] **未执行**：确认 `.anibox/` 里没有出现 Chromium 缓存以外的意外大文件

## 收尾

- [ ] 上述未执行项由维护者在本机实测后勾选
- [ ] 实测通过后归档进 `changes/archive/2026-11-22-add-portable-data-root/`，delta 合入 `specs/data-root/spec.md`
