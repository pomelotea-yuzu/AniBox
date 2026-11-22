# openspec/changes/ · 活动变更

> 归属说明。这里放**正在进行**的 change，一个目录一个 change，动词开头的 kebab-case 命名。
> 当前为空：下一个应立 `rebuild-repo-foundation`（仓库骨架与门禁的验收），
> 产品向的电视模式 / RIFE / 采集串流按 [`docs/engineering/plans/2026-11-22-anibox-rebuild-proposal.md`](../../docs/engineering/plans/2026-11-22-anibox-rebuild-proposal.md) 的放行顺序逐条立。

## 结构

```
changes/
└─ <verb-led-kebab-name>/
   ├─ proposal.md         为什么改、范围、不做什么
   ├─ design.md           方案、取舍、被否掉的路线与原因
   ├─ specs/              该 change 的需求与场景（delta）
   ├─ tasks.md            拆步骤，每步带判据；完成状态只在这里维护
   └─ evidence-index.md   实机/数据证据索引（判据 → 证据位置）
```

## 纪律

- **一个 change 只做一件事**。改两条不相关的能力就拆两个 change，别裹成一笔。
- 判据要能反证：写清"已知坏样本必须判红"的对照，否则这份 change 不能证明改动有效
  （与 `check-i18n` 的 `--selftest` 同一思路——永不命中的规则表现为全绿，实际什么都没检查）。
- 未执行项在 `tasks.md` 里如实写"未执行 + 原因（环境阻塞/需要人工/未排期）"，**不许勾完成**（I9）。
- 实机截图默认留本地：`.gitignore` 已排除 `docs/reviews/**/*.png`；证据索引只留相对路径与判据描述。
- 触碰播放引擎、渲染或打包路径的 change，必须在 design.md 里复述相关不变量（I1–I4、I8）。

## 归档

收口后整体移入 [`archive/`](archive/README.md)，delta 合入 [`../specs/`](../specs/README.md)。
**权威性：源码 > `archive/` > `specs/` > `docs/` > `AGENTS.md`**——判断进度只认前两者。

纯文档修订、错别字、链接修复不必立项。
