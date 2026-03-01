// 世界书支持的操作类型
export type WorldAction = 'create' | 'update' | 'delete' | 'patch';

// patch 操作对象，op 为操作名，其余字段随具体 op 决定
export interface PatchOp {
  op: string;
  [key: string]: unknown;
}

// 解析后的标准化更新指令
export interface WorldUpdateCommand {
  action: WorldAction;
  entry_name: string;
  fields: Record<string, unknown>;
  ops: PatchOp[];
}

// 世界书条目最小兼容结构（兼容不同后端返回格式）
export interface WorldbookEntryLike {
  uid?: number | string;
  id?: number | string;
  name?: string;
  comment?: string;
  content?: string;
  keys?: string | string[];
  secondary_keys?: string | string[];
  [key: string]: unknown;
}

// 路由执行结果
export interface RouterResult {
  action: WorldAction | 'queue' | 'error';
  entry_name: string;
  status: 'ok' | 'skipped' | 'queued' | 'error';
  reason?: string;
  detail?: string;
}

// 调度器相关配置
export interface SchedulerConfig {
  startAfter: number;
  interval: number;
  triggerTiming: 'before' | 'after' | 'both';
}

// v3 主配置结构
export interface WbmConfig extends SchedulerConfig {
  mode: 'inline' | 'external';
  apiSource: 'tavern' | 'custom';
  targetType: 'charPrimary' | 'charAdditional' | 'global' | 'managed';
  targetBookName: string;
  approvalMode: 'auto' | 'manual' | 'selective';
  reviewDepth: number;
  autoEnabled: boolean;
}

// 统一日志接口，便于替换日志实现
export interface LoggerLike {
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}
