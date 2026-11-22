# openspec/changes/archive/ · 已归档变更

> 归属说明。收口的 change 整体移入这里，目录名加日期前缀：`<YYYY-MM-DD>-<change-name>/`。
> 归档件是**判断历史进度最可靠的依据**（仅次于源码），不许回改内容；要修正就走新 change。

## 当前状态

**暂无归档 change。** 本仓的 OpenSpec 是从 2026-11-22 的仓库重整才开始引入的；
此前 1.2.0–1.2.3 的工作只存在于 `git log` 与 Release 文案里，不回填、不补造。

## 归档时做什么

1. 确认 `tasks.md` 的完成状态与 `evidence-index.md` 的证据一一对应，未执行项如实保留。
2. 该 change 的 delta 合入 `../../specs/<capability>/spec.md`，并删掉活动目录里的重复叙述。
3. 目录加日期前缀移入本目录，在 `docs/README.md` 的「路径变更记录」留一行。
4. 更新 `AGENTS.md` §二 状态卡：清空"活动 change"。
