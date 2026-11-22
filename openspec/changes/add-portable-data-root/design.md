# 设计：数据根解析与迁移

## 解析顺序（`src/main/bootstrap.ts`）

```
ANIBOX_DATA_DIR（环境变量，显式最高优先）
  ↓ 未设置
便携包（<软件目录>/.portable 存在） → <软件目录>/data
  ↓ 不存在
开发态（!app.isPackaged 且 <repo>/AGENTS.md 存在） → <repo>/.anibox
  ↓ 都不成立
安装版 → Electron 默认 userData（系统用户目录）
```

三个取舍：

1. **为什么用 `AGENTS.md` 当握手标志**：开发态要靠 `app.getAppPath()`（= `apps/desktop`）往上两级推
   仓库根。如果不校验，任何在非本仓目录里跑起来的开发实例都会在附近凭空造一个 `.anibox/`。
   用仓库必有且唯一的入口文件做断言，比判断目录名可靠。
2. **为什么 env 排第一**：排障要能"临时换个干净数据根起一次"，多实例并行调试也需要；
   也顺手给将来的 e2e 测试留了口子。
3. **为什么不重定向 `sessionData`**：Electron 的 `sessionData` 默认跟随 `userData`，
   在 `ready` 之前 `setPath('userData')` 就已经生效；单独再设一次容易把 Chromium 缓存塞进
   数据根深处，反而更难清理。留着默认行为，缓存跟着 `.anibox/Chromium*` 走。

## 迁移

复用既有 `migrateLegacyUserData(oldDir, newDir)`：

- 只在**新目录为空**时执行，一次性；
- 跳过 Chromium 缓存目录，本次新增跳过 `stream-cache`（转码产物，可能上 GB，随时可重生成）；
- 单项失败不阻塞其余项；整体失败只告警不阻塞启动。

## 风险与回退

| 风险 | 处理 |
|---|---|
| 首次启动迁移耗时（模型 ~114 MB + 索引 ~10 MB） | 一次性；日志打印迁移项数 |
| 用户在 `.anibox/` 里放了大文件导致仓库目录臃肿 | `.gitignore` 已排除 `.anibox/`；门禁也不看未跟踪文件 |
| 迁移把不该搬的东西搬过来 | 白名单式跳过清单 + 只搬一层顶层条目 |
| 解析错了导致数据"消失" | 启动日志打印解析结果；`ANIBOX_DATA_DIR` 可指回旧路径 |

**回退办法**：删掉 `detectDevDataDir()` 分支即可回到系统 `userData`，数据仍在原处、无迁移破坏。

## 未决

- 设置页展示数据目录（UI 侧），见 debt。
- 安装版是否也统一到一个显式数据根，需要单独立项。
