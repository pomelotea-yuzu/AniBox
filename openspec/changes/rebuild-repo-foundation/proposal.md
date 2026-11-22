# 提案：把仓库地基立住并验收

- 状态：实施中（2026-11-22 起）
- 依据：[`docs/engineering/plans/2026-11-22-anibox-rebuild-proposal.md`](../../../docs/engineering/plans/2026-11-22-anibox-rebuild-proposal.md) §1–§2

## 为什么改

重整之前，这个仓的"规矩"只存在于维护者的记忆和对话里：

1. **结构混着产物**：仓库根同时放着 `src/`、三个便携包目录（约 3.4 GB）、`data/`、`mpv-dev/`、
   两份 git 修复报告——`anibox/` 才是仓库，其余全是历史残留；
2. **没有机器门禁**：没有任何脚本阻止把 exe/dll/模型/截图提交进去，靠人记；
3. **坑靠记忆传递**：libmpv 的 SW 渲染禁忌、asar 打包的 28 字节空包、`data/` 混进发布包……
   这些都写在各工具的本机记忆里，clone 的人拿不到；
4. **没有变更流程**：改动没有 proposal/design/验收，事后无法判断"当时为什么这么做"。

## 范围

- 仓库根上移、应用迁入 `apps/desktop/`（已完成）
- Layress 式治理骨架：`AGENTS.md`、`openspec/`、`docs/`、`i18n/`、`packages/`、`artifacts/`（已完成）
- 洁净度三层 + 门禁公共入口 + pre-commit + 两侧 CI（已完成）
- 经验库五专题回填（已完成）
- **本 change 的验收部分**：把上面这些都跑一遍实机检查，并补 `repo-foundation` 规格

## 明确不做

- **不建 `packages/*`**：不预拆空包，等真有第二个消费者再拆（见 `packages/README.md`）。
- **不建真正的 pnpm monorepo**：根只有委托脚本；`pnpm-workspace.yaml` 跟着 package 走。
- **不动 Git 历史**：沿用原仓历史，不新建仓库、不强推。
- **不把 lint/test 塞进 CI**：存量 lint 错误与未跑通的测试先记在 `docs/knowledge/debt.md`，
  绿灯之后再进流水线（先加必红或永不执行的步骤只是自欺）。
- **不做 `datasets/`**：本仓没有适合入库的小样本数据集，建了就是第二个垃圾场。
