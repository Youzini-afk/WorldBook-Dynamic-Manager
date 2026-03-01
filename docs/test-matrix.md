# 测试矩阵

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

### Router

1. 四类 action 的成功路径。
2. 目标不存在时的跳过路径。
3. 手动/选择性审核模式下的入队路径。
4. 错误向上传递且不造成全局崩溃。

## 集成测试（v3）

1. 四种目标世界书模式的定位行为。
2. 审核队列与指令回放行为。
3. 消息删除后的快照回滚一致性。
4. 聊天切换后的状态重置与事件重绑。
5. 外部 API 与主 API 审核链路。

## 手工探索测试

1. 7 个标签页的交互和功能完整性。
2. 高楼层长会话下无重复更新、无明显卡顿。
3. `managed` 模式在无绑定聊天时自动建书并绑定。
