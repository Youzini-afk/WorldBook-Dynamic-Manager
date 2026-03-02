# 后续开发指南（v3 基线）

本文给后续维护者一套可直接执行的开发流程，目标是：稳定迭代、低回归、可发布。

## 1. 开发前准备

1. 安装依赖：`npm install`
2. 基础校验：
   1. `npm run typecheck`
   2. `npm run lint`
   3. `npm run test`
3. 本地调试构建：`npm run build:dev` 或 `npm run watch`

## 2. 目录职责（必须遵守）

1. `src/WBM/core`：类型、配置 schema 与存储键。
2. `src/WBM/services`：业务服务层（parser/patch/router/scheduler/review/worldbook）。
3. `src/WBM/infra`：事件、日志、生命周期基础设施。
4. `src/WBM/ui`：面板与 UI 桥接，不写核心业务算法。
5. `src/WBM/index.ts`：装配根（依赖注入、生命周期接入、API 暴露）。

约束：

1. 新业务能力优先进入 `src/WBM`，不要再扩展旧单文件实现。
2. 根 `index.js` 为发布产物，不要手工编辑。
3. 对外 API 变更必须同步类型、兼容壳、文档与测试。

## 3. 新功能开发流程

### 步骤 1：先改类型和契约

1. 在 `core/types.ts` 定义输入/输出结构。
2. 如涉及配置，先更新 `core/config.ts` 的 zod schema 和默认值。

### 步骤 2：实现服务逻辑

1. 解析逻辑放 `services/parser`。
2. 数据写入流程放 `services/router` + `services/worldbook`。
3. 调度与并发控制放 `services/scheduler`。
4. 禁止在 UI 中实现业务规则。

### 步骤 3：接入入口与 UI

1. 在 `src/WBM/index.ts` 装配服务依赖。
2. 如需前端操作入口，扩展 `ui/panel/types.ts` 的 `PanelBridge`。
3. 在 `WbmPanel.vue` 接入，并补失败路径提示。

### 步骤 4：补测试

最少要求：

1. 单元测试：覆盖新增逻辑分支。
2. 集成测试：覆盖入口装配和兼容 API 映射。
3. UI 测试：至少 1 条成功路径 + 1 条失败路径。

## 4. 测试策略

推荐命令顺序：

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

发布前强制：

1. `npm run build:release`
2. 确认 `dist/wbm3.js`、`dist/index.js`、根 `index.js` 同步一致。
3. 依据 `docs/regression-checklist.md` 执行关键手工回归。

## 5. 版本与兼容策略

1. 主 API：`window.WBM3`。
2. 兼容壳：`window.WBM`、`window.WorldBookManager`（只转发，不扩展）。
3. 不自动迁移旧配置，统一使用 `WBM3_*` 命名空间。
4. 任何行为变更必须在发布说明中记录。

## 6. 常见改造任务模板

### 6.1 新增一个 API 方法

1. 更新 `core/types.ts` 的 `WbmPublicApi`。
2. 在 `src/WBM/index.ts` 实现并挂载。
3. 兼容壳按需映射（若涉及旧接口）。
4. 新增测试：主 API + 兼容壳转发 + 失败路径。
5. 更新文档：`README`、`src/WBM/README.md`、`docs/changes-from-original.md`。

### 6.2 新增一种 patch 操作

1. 更新 `PatchProcessor` 分支处理。
2. 增加幂等校验与白名单限制（如有字段写入）。
3. 补齐正向/逆向/重复执行测试。
4. 更新指令协议说明（如影响模型输出约束）。

### 6.3 修改事件生命周期

1. 优先走 `infra/events.ts` 的统一订阅与解绑。
2. 禁止并行新增第二套监听体系。
3. 测试聊天切换与卸载清理，确保无重复触发。

## 7. 发布前检查清单（开发者版）

1. 文档是否同步（README + docs）。
2. 类型定义与实现是否一致。
3. 兼容壳是否仍可运行且有告警。
4. 覆盖率阈值是否满足。
5. 单文件产物是否已由 `build:release` 同步。

