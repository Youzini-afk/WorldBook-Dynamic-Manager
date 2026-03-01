# Phase 0 基线（冻结）

本文件用于在 v3 迁移前冻结当前行为，作为后续回归对照基线。

## 功能矩阵

| 区域 | 当前能力 | 所属模块 |
|---|---|---|
| 触发调度 | before/after/both 触发时机 | `Sched`, `EventBridge` |
| 指令解析 | `<world_update>` 标签 + JSON 载荷 | `Parser` |
| 指令执行 | create/update/delete/patch | `Router` + `PatchProcessor` |
| 目标世界书定位 | char primary/additional/global/managed | `Book.getTargetBookName` |
| 持久化 | localStorage 配置/API/日志/预设/快照 | `Store` |
| 安全机制 | 删除确认、审核队列、快照回滚 | `Router`, `PendingQueue`, `SnapshotStore` |
| UI | 悬浮面板、扩展菜单、7 个标签页 | `UI` |
| 对外 API | `window.WBM`, `window.WorldBookManager` | `PublicAPI` |

## 已知风险清单（v3 前）

1. 单文件架构，UI/数据/调度/适配器混杂，职责边界不清晰。
2. 对全局运行时状态（`RT`）耦合较高，并依赖隐式浏览器全局变量。
3. Observer 与 EventBridge 之间存在重复触发风险。
4. 世界书后端存在较多历史兼容分支，维护成本高。

## 基线验收标准

1. v3 每个里程碑都必须能对照本矩阵进行验证。
2. 任何功能降级都必须在发布说明中明确记录。
3. 每个候选发布版本都必须执行手工回归清单。
