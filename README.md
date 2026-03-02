# WorldBook Dynamic Manager (WBM)

WBM 是一个用于 SillyTavern/Tavern Helper 场景的世界书自动维护脚本。  
它会基于聊天上下文生成 `world_update` 指令，并将变更写回目标世界书。

当前仓库已从原始单文件脚本迁移到 v3 架构，包含模块化 TypeScript 服务层、Vue 面板、双轨构建产物与自动化测试体系。

## 当前状态

1. 主运行链路：`src/WBM/index.ts`（`window.WBM3`）。
2. 兼容壳：`window.WBM`、`window.WorldBookManager`（转发到 `WBM3`，首次调用告警）。
3. UI：Vue 7 标签控制面板。
4. 构建：双轨产物（`dist/wbm3.js` + `dist/index.js`）。
5. 发布：`npm run build:release` 会同步单文件到根目录 `index.js`。

## 快速开始

### 环境要求

1. Node.js 20+（建议 LTS）。
2. npm 10+。

### 安装与校验

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

### 生成发布产物

```bash
npm run build:release
```

执行后会生成：

1. `dist/wbm3.js`：模块化产物。
2. `dist/index.js`：单文件自启动产物。
3. 根目录 `index.js`：由 `dist/index.js` 同步，作为分发脚本。

## 对外 API（v3）

`bootstrapWbmV3()` 会挂载 `window.WBM3`：

1. `openUI()`
2. `closeUI()`
3. `manualReview(bookName?, messages?)`
4. `approveQueue(ids?)`
5. `rejectQueue(ids?)`
6. `rollback(snapshotId)`
7. `rollbackFloor(floor, chatId?)`
8. `listQueue()`
9. `listSnapshots(bookName?)`
10. `getStatus()`

兼容壳 `window.WBM` / `window.WorldBookManager` 额外保留映射：

1. `approveAll` / `approveOne`
2. `rejectAll` / `rejectOne`
3. `getPendingQueue`
4. `getSnapshots`
5. `rollbackFloor`

## 文档导航

1. 回归清单：`docs/regression-checklist.md`
2. 测试矩阵：`docs/test-matrix.md`
3. 发布流程：`docs/release-playbook.md`
4. 与原项目改动总览：`docs/changes-from-original.md`
5. 后续开发指南：`docs/development-guide.md`
6. `src/WBM` 模块说明：`src/WBM/README.md`

## 原作者信息与分发约定

以下信息来自原项目说明，保留用于署名与传播约定：

1. 作者：钰。
2. 二次传播：建议优先传播原帖链接；若需要二传/集成发布，请按原作者约定署名或联系原作者。
3. 商用：遵循原作者声明，不用于未授权商业分发。

本仓库的重构目标是提升稳定性、可维护性和可测试性，不改变原项目“动态维护世界书”的核心定位。
