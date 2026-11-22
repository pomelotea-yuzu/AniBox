# development/ · 开发工作流

> 本文默认以中文维护。

## 一、门禁链

唯一的机器判据入口是仓库脚本，本地提交与两侧 CI **跑同一条命令链**（不要在流水线里另写一套规则）：

```bash
node scripts/check-repo.mjs --all       # 洁净度 + 全库链接 + 双语配对 + 两类自测
node scripts/check-repo.mjs --staged    # pre-commit：按实际索引快照跑同一条链
node scripts/check-hygiene.mjs --all    # 单查洁净度（体积 / 后缀 / 垃圾场 / 凭据 / 忽略泄露）
node scripts/check-i18n.mjs --links     # 单查全库 Markdown 的本地链接
```

每个克隆做一次（不做就等于没有门禁）：

```bash
git config core.hooksPath .githooks
```

洁净度的正文、体积与豁免读索引；一次性自测产物写 `artifacts/` 并在结束时清理。
提交前排查用 `--all`，部分暂存的提交以 `--staged` 为准。

## 二、产品检查（还没进门禁）

```bash
cd apps/desktop
npm run typecheck    # 已通过
npm run lint         # 存量错误未清，暂不作为门禁
npm test             # vitest，本机沙箱未跑通
```

现状与欠账见 [`../knowledge/debt.md`](../knowledge/debt.md)。**在 lint/test 真实通过之前，
不要把它们写成 CI 的必过项**——那只会让人绕开 `npm run check`。

## 三、OpenSpec 流程

每个非平凡的改动一个 change：

1. `proposal.md` —— 为什么改、范围、明确不做什么。
2. `design.md` —— 方案与取舍、被否掉的路线及原因、回退办法。
3. `specs/` —— 需求与场景（delta），场景要能被反证。
4. `tasks.md` —— 拆步骤，每步带判据；完成状态只在这里维护。
5. 审阅放行 → 实施 → `evidence-index.md`（证据与未验项）。
6. 归档进 `openspec/changes/archive/<日期>-<name>/`，delta 合入 `openspec/specs/`。

命名用**动词开头**的 kebab-case（`rebuild-repo-foundation`、`add-windows-tv-mode`）。
纯文档修订、错别字、链接修复不必立项。

## 四、提交与推送

- 每完成一个**可独立验证的代码单元**就 commit，提交信息写清"改了什么 + 为什么"。
- 文档、探针、排查过程这类产出**先不提交**，等有结论或用户发话再一起提；
  提交前自问一句"用户会想在 `git log` 里单独看到它吗"。
- **push 归用户**。远程：`origin` = Gitee、`github` = GitHub；智能体只做本地 commit。
  判断领先/落后跑 `git ls-remote` 或 `git log --oneline origin/main..main`，别相信文档里的记载。
- 不要 `--amend` 已推送的提交，不要 `--no-verify` 跳过钩子。

## 五、打包与发布

```bash
cd apps/desktop
python scripts/mk-stage121.py <src_stage> <dst_stage>   # 两个参数必须不同
# node 直调 @electron/asar 打 asar（禁用 npx asar，会静默产出 28 字节空包）
# 覆盖 dist/win-unpacked/app.asar
python scripts/pack-zip-123.py                          # 出便携 zip（已排除 data/）
```

流水细节与四个坑写在 [`../knowledge/engineering.md`](../knowledge/engineering.md)。
发布文案与 tag 由用户操作；便携包与 `data/` 的归属见 [`../knowledge/debt.md`](../knowledge/debt.md)。

## 六、目录归属

新增目录必须同时在 `docs/README.md` 地图与对应 `README.md` 登记归属；**没登记 = 归属未定，先别建**。
一次性产物只去 `artifacts/`，手写结论一律进 `docs/`。
