# 测试矩阵

## 自动化入口

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

当前覆盖率门槛：

1. lines >= 90
2. statements >= 90
3. branches >= 80
4. functions >= 90

## 单元测试（v3）

### Parser

1. 能接受合法 `<world_update>` + 数组载荷。
2. 缺失必填字段（`action`、`entry_name`）时拒绝。
3. 不支持的 `action` 会被拒绝。
4. 畸形 JSON 能被安全处理，不导致崩溃。

### PatchProcessor

1. 内容操作：append/prepend/insert_before/insert_after/replace/remove。
2. 字段操作：仅允许白名单字段被设置。
3. 关键词操作：主关键词与副关键词的 add/remove。
4. 重复追加防护行为验证。

### Scheduler

1. `isDue` 在 start/interval 边界下结果正确。
2. `nextDue` 覆盖 interval 为 `0`、正数、禁用值的情况。
3. 持锁状态下不会重复执行。
4. `reset` 后能正确清理锁并重算下一触发楼层。

### Infra Events

1. `eventOn` 可用时优先走 `eventOn(...).stop()` 解绑。
2. `eventOn` 不可用时可降级到 `source.on/off`。

### Router

1. 四类 action 的成功路径。
2. 目标不存在时的跳过路径。
3. 手动/选择性审核模式下的入队路径。
4. 错误向上传递且不造成全局崩溃。

### UI（Vue 面板）

1. 7 标签渲染与切换。
2. 世界书标签新增/手动审核关键路径。
3. 提示词/API/调度标签配置保存关键路径。
4. 调试与日志标签关键操作（审批、回滚、清空）路径。
5. 失败场景显示错误提示条且可手动清除。

## 集成测试（v3）

1. 四种目标世界书模式的定位行为。
2. 审核队列与指令回放行为。
3. 消息删除后的快照回滚一致性。
4. 聊天切换后的状态重置与事件重绑。
5. 外部 API 与主 API 审核链路。
6. 高楼层并发触发时只执行一次（回放测试）。
7. 聊天切换与消息删除后，调度状态会重置。

## 手工探索测试

1. 7 个标签页的交互和功能完整性。
2. 高楼层长会话下无重复更新、无明显卡顿。
3. `managed` 模式在无绑定聊天时自动建书并绑定。
