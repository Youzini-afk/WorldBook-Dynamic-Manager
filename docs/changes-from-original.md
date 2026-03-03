# 与原项目改动总览（v2.1 + v3）

本文用于说明“当前仓库”相对“原始单文件项目”的完整改动方向、兼容策略与行为差异。

## 1. 架构层改动

### 1.1 单文件到模块化

原项目：

1. 核心逻辑集中在根 `index.js`。
2. UI、调度、解析、写入、事件、存储高度耦合。

当前：

1. 新增 `src/WBM` 模块化目录，按 `core/services/infra/ui` 分层。
2. 新增 `src/WBM/bootstrap`，拆分为装配根、运行时会话、兼容壳三层。
3. 新增 `src/WBM/infra/runtime`，统一 runtime 能力探测与健康诊断。
4. 入口 `src/WBM/index.ts` 仅负责启动/卸载，不承载大段业务细节。
3. 根 `index.js` 变为构建产物同步文件，不再手工维护业务实现。

### 1.2 工程化链路

新增统一工程链路：

1. TypeScript 严格模式 + 路径别名。
2. Webpack 构建（支持 `.vue`）。
3. ESLint + Prettier。
4. Vitest + 覆盖率门槛。
5. CI 拆分为 `lint/typecheck/test/build` 独立作业，Node 20/22 双版本矩阵。

## 2. 功能层改动

### 2.1 已完成的稳定性修复（v2.1）

1. `uid=0` 条目更新/删除判空错误修复。
2. `managed` 模式绑定逻辑修复。
3. 重复事件触发路径收敛（避免双触发）。
4. 卸载保护与清理链路补全。

### 2.2 v3 服务化迁移

主要服务：

1. Parser：`<world_update>` 提取 + JSON 修复 + schema 校验。
2. PatchProcessor：支持内容/字段/关键词增量操作，带幂等保护。
3. Router：统一 `ok/skipped/queued/error` 结果结构。
4. Scheduler：触发算法、重入锁与状态机分离。
5. Repository：官方高层 API 优先，官方旧接口降级。
6. Queue/Snapshot：审核队列与快照持久化，支持回滚链路。

### 2.3 UI 全量迁移

1. 从旧 DOM 拼接 UI 迁移到 Vue 面板。
2. 保留 7 标签能力。
3. 新增 UI 失败提示条，避免异常静默。

## 3. API 改动与兼容策略

### 3.1 主 API：`window.WBM3`

稳定集合：

1. `openUI` / `closeUI`
2. `manualReview`
3. `approveQueue` / `rejectQueue`
4. `rollback`
5. `rollbackFloor`
6. `listQueue`
7. `listSnapshots`
8. `getStatus`
9. 诊断字段：`backendAvailable`、`eventSourceAvailable`、`mountAvailable`

### 3.2 兼容壳：`window.WBM` / `window.WorldBookManager`

1. 旧接口仍可调用，但内部转发到 `WBM3`。
2. 首次调用输出弃用告警。
3. 兼容壳不再接受新增功能，只做过渡映射。

## 4. 数据与配置改动

1. 配置命名空间切换为 `WBM3_*`。
2. 不自动迁移旧配置，允许行为重置。
3. `PendingReviewItem`、`SnapshotRecord` 扩展 `floor/chatId` 元数据。
4. `rollbackFloor` 支持按 `floor + chatId` 精确回滚。

## 5. 构建与发布改动

1. 双轨产物并发：
   1. `dist/wbm3.js`（模块化）。
   2. `dist/index.js`（单文件）。
2. `npm run build:release` 会自动同步 `dist/index.js -> index.js`。
3. 新增 `npm run smoke:dist`，用于产物可读、语法与导入包脚本 dry-run 冒烟。
4. 回滚策略：保留 `v2.1` 与 `v3.0` 独立发布线。

## 6. 测试与质量改动

1. 自动化覆盖：Parser/Patch/Router/Scheduler/Repository/Queue/Snapshot。
2. 新增入口桥接与兼容 API 集成测试。
3. 新增 Vue 面板 UI 交互测试（成功路径 + 失败路径）。
4. 覆盖率门槛提升为：
   1. lines >= 90
   2. statements >= 90
   3. branches >= 80
   4. functions >= 90

## 7. 行为差异（迁移注意）

1. 默认执行链路已切换到 v3。
2. 旧配置不会自动迁移。
3. 兼容壳仍可用，但建议尽快迁移到 `WBM3`。
4. 若遇阻断问题，可回切 `v2.1` 标签与产物。

## 8. 未完成与后续重点

1. 扩展更多真实场景回放（聊天切换、删除回滚、高频触发）。
2. 完善发布说明中的“行为差异表”与“迁移示例”。
3. 逐步缩减兼容壳依赖，按版本计划评估移除。
