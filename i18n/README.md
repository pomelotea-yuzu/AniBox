# i18n/ · 双语口径

> 本文默认以中文维护。

## 一句话口径

**内部文档默认中文；只有逐篇登记的对外文件维护中英双版本。**
国际化 = 中国用户优先 + 英文产品名 + 具备海外发布能力，**不等于**把产品改成英文。

## 当前登记范围

见 [`docs-manifest.json`](docs-manifest.json)。当前登记 **5 篇**，均需同轮维护 `*.en.md`：

| 中文 | 英文 |
|---|---|
| `README.md` | `README.en.md` |
| `CHANGELOG.md` | `CHANGELOG.en.md` |
| `CONTRIBUTING.md` | `CONTRIBUTING.en.md` |
| `SECURITY.md` | `SECURITY.en.md` |
| `CODE_OF_CONDUCT.md` | `CODE_OF_CONDUCT.en.md` |

`AGENTS.md`、`docs/`、`i18n/`、`openspec/` 全部默认中文，**不翻译**。

新增一篇对外文档时：

1. 在同目录写 `*.en.md`；
2. 把相对路径加进 `docs-manifest.json` 的 `docs`；
3. 两个版本**同一轮**修改，并跑 `node scripts/check-i18n.mjs`。

## 例外

- 表单类（Issue 表单、PR 模板）**不做两份**：同一表单内并列 `label: English / 中文`。
- 代码标识、协议字段、错误码、配置键**原值不翻译**。
- 术语中英对应查 [`glossary.md`](glossary.md)。

## 检查

```bash
node scripts/check-i18n.mjs            # 成对登记 + 链接（默认全查）
node scripts/check-i18n.mjs --links    # 只查已跟踪 Markdown 的本地目标路径
node scripts/check-i18n.mjs --selftest # 自测：构造一个必坏的样例，确认规则真的会报红
```

`--selftest` 是这套规则能不能信的前提：永不命中的检查表现为全绿，等于没检查。
