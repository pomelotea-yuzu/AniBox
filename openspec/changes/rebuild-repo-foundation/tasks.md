# 任务：rebuild-repo-foundation

> 完成状态只在这里维护。机器能判的写"已验证（命令）"，实机才能判的写"未执行"。

## A 结构

- [x] 仓库根上移，旧根杂物移出仓外（`D:\AniBox-Archive`）
- [x] 应用整包迁入 `apps/desktop/`，包内相对路径不变（`git diff` 记录为 rename）
- [x] 建立 `docs/`（guide / architecture / development / knowledge / product / engineering / research / reviews / drafts）
- [x] 建立 `openspec/`（config.yaml + specs/ + changes/ + archive/）
- [x] 建立 `i18n/`（README + glossary + docs-manifest）
- [x] 建立 `packages/`（仅 README，不预拆空包）
- [x] stage 与 dev 日志移入 `artifacts/`
- [x] 6 个构建/资源脚本改为从 `__file__` 推导路径，不再写死盘符路径

## B 门禁

- [x] `.gitignore` 重写（每段写"这是什么 + 有价值的东西该去哪"）
- [x] `.git-hygiene-allowlist`（唯一放行入口，理由必填）
- [x] `scripts/check-hygiene.mjs`（体积/后缀/垃圾场/凭据/忽略泄露 + `--selftest`）
- [x] `scripts/check-i18n.mjs`（成对登记 + 全库链接 + `--selftest`）
- [x] `scripts/check-repo.mjs`（公共入口，`--all` / `--staged`）
- [x] `.githooks/pre-commit` → `check-repo.mjs --staged`
- [x] `.gitattributes`（文本 LF / Windows 脚本 CRLF / 二进制禁转换）
- [x] `.github/workflows/ci.yml` 与 `.workflow/ci.yml` 调同一入口
- [x] 已验证：`check-hygiene --all` 192 个已跟踪文件全部通过
- [x] 已验证：`check-i18n` 成对 1 篇、本地链接 86 篇 Markdown 全部可解析
- [ ] **未执行**：`check-repo.mjs --all` 完整链（含两个 `--selftest`）——会话内 node 无法写盘，见 `docs/knowledge/engineering.md`
- [ ] **未执行**：`pre-commit` 实际触发一次（`git commit` 时观察门禁输出）

## C 文档与经验库

- [x] `AGENTS.md`（状态卡 / 必读顺序 / 洁净度红线 / 经验写法 / 目录地图）
- [x] `openspec/config.yaml`（I1–I11 不变量与执行边界）
- [x] `docs/knowledge/` 五专题回填（engineering / runtime-probe / invariants / decisions / debt）
- [x] `docs/development/workflow.md`（门禁链、OpenSpec 流程、提交与打包口径）
- [x] `docs/architecture/README.md`（三进程边界、播放链路、数据流、数据根）
- [x] `docs/product/roadmap.md`、`docs/research/README.md`、`docs/reviews/README.md`
- [x] 对外门面四件套 + 英文版（CHANGELOG / CONTRIBUTING / SECURITY / CODE_OF_CONDUCT，README 已在 `124995c`）
- [x] issue / PR 模板（GitHub 表单内中英并列；Gitee 纯中文）

## D 实机验收（本 change 的通过条件）

- [ ] **未执行**：`cd apps/desktop && npm run typecheck`
- [ ] **未执行**：`npm run dev` 能起、扫库/海报墙/续播/切音轨切字幕可用
- [ ] **未执行**：`npm run build` 产出 `out/`，`AniBox-prod.bat` 能起
- [ ] **未执行**：便携打包全流程（`mk-stage121.py` → asar → `pack-zip-123.py`）产出可运行 zip
- [ ] **未执行**：数据根落 `.anibox/`（依赖 `add-portable-data-root` 的实机验证）

## E 收尾

- [x] `docs/README.md` 补路径变更记录
- [ ] 上述未执行项由维护者在本机跑完后勾选
- [ ] 全部通过后归档，delta 合入 `openspec/specs/repo-foundation/spec.md`
