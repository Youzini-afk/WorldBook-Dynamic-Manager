export type WorldAction = 'create' | 'update' | 'delete' | 'patch';

export interface PatchOp {
  op: string;
  [key: string]: unknown;
}

export interface WorldUpdateCommand {
  action: WorldAction;
  entry_name: string;
  fields: Record<string, unknown>;
  ops: PatchOp[];
}

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

export interface RouterResult {
  action: WorldAction | 'queue' | 'error';
  entry_name: string;
  status: 'ok' | 'skipped' | 'queued' | 'error';
  reason?: string;
  detail?: string;
}

export interface SchedulerConfig {
  startAfter: number;
  interval: number;
  triggerTiming: 'before' | 'after' | 'both';
}

export interface WbmConfig extends SchedulerConfig {
  mode: 'inline' | 'external';
  apiSource: 'tavern' | 'custom';
  targetType: 'charPrimary' | 'charAdditional' | 'global' | 'managed';
  targetBookName: string;
  approvalMode: 'auto' | 'manual' | 'selective';
  reviewDepth: number;
  autoEnabled: boolean;
}

export interface LoggerLike {
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}
