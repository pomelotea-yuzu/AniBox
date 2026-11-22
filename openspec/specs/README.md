# openspec/specs/ · 现行规格

> 归属说明。这里放**已交付能力**的现行口径，一个能力一个目录：`<capability>/spec.md`。
> 归档 change 的 delta 收口时合入这里，合入后以本目录为准（源码更靠前）。

## 结构

```
specs/
└─ <capability>/
   └─ spec.md     该能力的现行需求、场景与验收口径
```

## 现有能力（随交付逐步补齐）

| capability | 覆盖内容 | 状态 |
|---|---|---|
| （待建）`library-scan` | 目录扫描、系列/单集识别、续播进度 | 已实现，规格未成文 |
| （待建）`local-metadata` | 本地 dump 索引查表、季号对齐、别名匹配 | 已实现，规格未成文 |
| （待建）`cover-cache` | yuc 季度页抓取、`anibox://cover` 协议、TTL 与淘汰 | 已实现，规格未成文 |
| （待建）`playback-engines` | 三引擎回退链、音轨/字幕、OP·ED 跳秒 | 已实现，规格未成文 |
| （待建）`portable-package` | stage 组装、asar、便携 zip 与 data/ 排除 | 已实现，规格未成文 |

**状态说明**：上表五项都是"代码先跑起来了、规格还没写成文"的存量能力。
按 OpenSpec 口径，它们**不算已归档**——写规格时以源码为唯一事实源，不要照着本表反推行为。
