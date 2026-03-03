# 故障排查手册（v3）

## 1. 导入脚本后没有反应

1. 先检查导入内容是否为单对象或数组对象，且 `type` 为 `script`。
2. 打开控制台确认是否有 `Failed to load resource`（CDN 失效）。
3. 若是 CDN 版失败，优先改用内嵌版 JSON 复测。
4. 确认脚本内容引用的是当前仓库发布分支/tag，不要指向旧路径。

## 2. 魔法棒里没有“动态世界书”

1. 检查日志是否出现：`document 不可用，无法挂载魔法棒菜单入口`。
2. 若出现该日志，说明当前上下文无法访问宿主文档（通常是页面或 iframe 环境异常）。
3. 检查日志是否出现：`replaceScriptButtons([]) 失败`，若出现说明宿主按钮区域被改写。
4. 通过 `window.WBM3?.openUI()` 手动打开面板，确认核心 API 是否已加载。

## 3. 面板提示“未找到当前打开的角色卡”

1. 该错误来自目标世界书解析阶段，表示角色上下文 API 返回为空。
2. 切换到托管模式（`managed`）可触发自动建书/重绑回退。
3. 检查当前聊天是否已绑定角色，必要时先进入角色卡再刷新面板。
4. 查看日志关键字：`读取当前角色世界书失败`、`已回退到聊天绑定世界书`。

## 4. 自动审核不触发或触发异常

1. 检查 `getStatus()`：
2. `autoEnabled` 是否为 `true`。
3. `eventSourceAvailable` 是否为 `true`（否则事件无法驱动调度）。
4. 检查调度参数：`startAfter`、`interval`、`triggerTiming`。
5. 观察日志是否出现：`调度器忙碌，跳过本次审核` 或 `自动审核失败`。

## 5. 回滚失败

1. 使用 `window.WBM3.listSnapshots()` 确认存在目标快照。
2. 按楼层回滚时，确认 `floor` 与 `chatId` 匹配当前会话。
3. 检查日志关键字：`未找到快照`、`未找到楼层快照`。

## 6. CI 失败排查顺序

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`
5. `npm run smoke:dist`

若前 4 项本地通过、CI 仍失败，优先检查 Node 版本差异（CI 同时跑 20/22）。
