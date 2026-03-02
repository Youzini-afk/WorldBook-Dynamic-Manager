# 发布手册

配套文档：

1. `docs/changes-from-original.md`
2. `docs/development-guide.md`
3. `docs/test-matrix.md`
4. `docs/regression-checklist.md`

## v2.1（稳定性补丁）

范围：

1. 只修关键缺陷。
2. 不做架构迁移。
3. 保持运行时行为稳定。

准入条件：

1. `docs/regression-checklist.md` 全部通过。
2. `index.js` 无语法/运行时回归。

## v3.0（深度标准化对齐）

范围：

1. 在 `src/WBM` 下落地模块化 TypeScript 架构。
2. 世界书仓储层以官方高层 API 为优先。
3. 完成生命周期/事件清理与可测试服务化。

准入条件：

1. `docs/test-matrix.md` 中单元/集成测试全部通过。
2. 与当前 `README` 及 `docs/changes-from-original.md` 中声明的能力保持一致。
3. 发布说明明确记录所有有意行为变更。
4. CI（`lint + typecheck + test + build`）全绿。

建议发布步骤：

1. 本地执行 `npm run lint && npm run typecheck && npm run test && npm run build:release`。
2. 校验双轨产物：`dist/wbm3.js` 与根目录 `index.js`（由 `dist/index.js` 同步）。
3. 先打 `v3.0.0-rc.1`，完成手工回归后再发 `rc.2`。
4. `rc` 全部通过后再发正式版 `v3.0.0`。

## 回滚策略

1. `v2.1` 与 `v3.0` 保留独立发布标签。
2. 若 `v3.0` 出现阻断，可快速回切 `v2.1`。
3. 不允许两个发布线互相覆盖产物。
