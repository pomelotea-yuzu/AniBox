## 改了什么

<!-- 一句话说清动机与结果；关联 issue 用 #编号 -->

## 影响面

- [ ] 播放引擎（libmpv / HTML5 / mpv.exe 回退）
- [ ] 扫库或元数据
- [ ] 局域网串流
- [ ] 打包与分发
- [ ] 仅文档或仓库治理

涉及播放器、渲染或打包路径时，复述受影响的不变量（`docs/knowledge/invariants.md` 的 I1–I11）：

## 验证

- [ ] `npm run typecheck`（在 `apps/desktop` 下）
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `node scripts/check-repo.mjs --all`
- [ ] Windows 实机验证（播放 / 字幕 / 音轨 / seek 中至少一项）

未执行的项如实勾掉并写原因（环境阻塞 / 需要人工 / 未排期）。机器 PASS 不等于人工验收通过。

## 备注

<!-- 回退方式、遗留问题、下一步 -->
