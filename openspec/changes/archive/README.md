# openspec/changes/archive/ · 已归档变更

> 归属说明。收口的 change 整体移入这里，目录名加日期前缀：`<YYYY-MM-DD>-<change-name>/`。
> 归档件是**判断历史进度最可靠的依据**（仅次于源码），不许回改内容；要修正就走新 change。

## 当前归档

| 归档 | 交付了什么 | 备注 |
|---|---|---|
| [`2026-11-22-add-portable-data-root/`](2026-11-22-add-portable-data-root/tasks.md) | 数据根四档解析 + 一次性迁移 + 启动日志；delta 已合入 [`../../specs/data-root/spec.md`](../../specs/data-root/spec.md) | ⚠ **实机验证未执行**（`npm run dev` 与"迁移后库/进度完整"两项留空），归档不代表已验证 |

> 诚实口径：`tasks.md` 里未勾的项原样保留，不为了"看起来收口"而补勾。
> 下个接手人看到未勾项，应先补验再基于它继续改代码。

## 归档时做什么

1. 确认 `tasks.md` 的完成状态与 `evidence-index.md` 的证据一一对应，未执行项如实保留。
2. 该 change 的 delta 合入 `../../specs/<capability>/spec.md`，并删掉活动目录里的重复叙述。
3. 目录加日期前缀移入本目录，在 `docs/README.md` 的「路径变更记录」留一行。
4. 更新 `AGENTS.md` §二 状态卡：清空"活动 change"。
