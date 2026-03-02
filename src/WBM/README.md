# WBM v3 模块

该目录为 v3 主实现目录，已接入工程化构建、自动化测试与兼容壳 API。

## 目录结构

- `core/`：共享类型与配置。
- `infra/`：日志与事件订阅生命周期管理。
- `services/`：parser/patch/router/scheduler/review/worldbook 服务层。
- `ui/`：面板控制抽象。
- `index.ts`：组合入口（`bootstrapWbmV3`）。

## 构建与校验

在仓库根目录执行：

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

## 对外 API

`bootstrapWbmV3()` 会挂载：

- `window.WBM3.openUI()`
- `window.WBM3.closeUI()`
- `window.WBM3.manualReview(bookName?, messages?)`
- `window.WBM3.approveQueue(ids?)`
- `window.WBM3.rejectQueue(ids?)`
- `window.WBM3.rollback(snapshotId)`
- `window.WBM3.getStatus()`

说明：

1. `manualReview` 不传 `messages` 时，会自动按 `reviewDepth` 读取最近聊天消息。
2. 自动模式下会监听聊天事件（消息接收/发送、聊天切换、消息删除）驱动调度器，并在卸载时自动解绑。

兼容壳：

- `window.WBM`
- `window.WorldBookManager`

首次调用会输出弃用告警，提示迁移到 `window.WBM3`。

## 迁移约束

1. 新功能和新实现优先放到本目录。
2. 在 v3 功能等价完成前，`index.js` 仍保留旧逻辑。
3. 等价验证通过后，再用 v3 构建产物替换旧入口。
