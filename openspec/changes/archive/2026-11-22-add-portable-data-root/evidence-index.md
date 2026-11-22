# 证据索引：add-portable-data-root

对应 `specs/data-root/spec.md` 的 R1–R4。**未执行的项如实留空，不许写成已通过。**

| 判据 | 证据 |
|---|---|
| R1 解析优先级 | `apps/desktop/src/main/bootstrap.ts` 的 `detectPortableDataDir` / `detectDevDataDir` / `resolveResourcesDir` 与底部初始化块 |
| R1 场景"非本仓目录" | 同上，`existsSync(join(repoRoot, 'AGENTS.md'))` 作为握手断言 |
| R2 迁移与跳过清单 | 同文件 `migrateLegacyUserData` 与 `MIGRATION_SKIP`（含 `stream-cache`） |
| R3 可验证性 | 同文件 `console.log('[AniBox] 数据目录（…）=', dataDir)` |
| R4 开发态内置索引 | 同文件 `ensureBundledIndex(app.getPath('userData'), resolveResourcesDir())` |
| 启动顺序 | `apps/desktop/src/main/index.ts` 首个 import |
| 单测未受影响 | `apps/desktop/src/main/bootstrap.test.ts`（直接调用导出函数，签名未变） |

## 实机证据（待补）

- 未执行：`npm run dev` 的控制台首行输出（应含 `数据目录（开发模式）= D:\AniBox\.anibox`）
- 未执行：`.anibox/` 目录清单（应含 `anibox-store.json`，不含 `Cache`/`stream-cache`）
- 未执行：迁移后首次打开，海报墙与续播进度是否完整
