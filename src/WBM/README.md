# WBM v3 骨架

该目录是 v3 迁移目标，采用与 Tavern Helper 模板风格一致的模块化结构。

## 目录结构

- `core/`：共享类型与配置。
- `infra/`：日志与事件订阅生命周期管理。
- `services/`：parser/patch/router/scheduler/review/worldbook 服务层。
- `ui/`：面板控制抽象。
- `index.ts`：组合入口（`bootstrapWbmV3`）。

## 迁移规则

1. 新功能和新实现优先放到本目录。
2. 在 v3 功能等价完成前，`index.js` 仍保留旧逻辑。
3. 等价验证通过后，再用 v3 构建产物替换旧入口。
