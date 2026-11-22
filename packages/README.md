# packages/ · 可复用模块

**当前为空。** 按"不预拆空包"的口径：只有当一个模块能独立构建、独立验收、且有第二个消费者时，
才在这里建包，并把 `apps/desktop` 的实现逐项迁过去。

候选（尚未立项，别提前建目录）：

| 候选包 | 为什么可能值得拆 | 门槛 |
|---|---|---|
| `@anibox/bangumi-index` | 索引加载 + 三级标题匹配，可脱离 Electron 单测 | 有独立 test 且被第二处引用 |
| `@anibox/cover-cache` | 季度页抓取 + 缓存 TTL/淘汰，纯 Node | 同上 |
| `@anibox/mpv-bridge` | koffi 绑定与帧回调，可被将来的采集/插帧复用 | 需要先定接口（帧输入/输出） |

拆包属于 OpenSpec change，不靠手工搬目录。
