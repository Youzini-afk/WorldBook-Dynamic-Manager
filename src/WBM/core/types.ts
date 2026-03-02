export type WorldAction = 'create' | 'update' | 'delete' | 'patch';
export type TriggerTiming = 'before' | 'after' | 'both';
export type ReviewMode = 'inline' | 'external';
export type ApiSource = 'tavern' | 'custom';
export type TargetType = 'charPrimary' | 'charAdditional' | 'global' | 'managed';
export type ApprovalMode = 'auto' | 'manual' | 'selective';
export type RouterStatus = 'ok' | 'skipped' | 'queued' | 'error';

export type WbmErrorCode =
  | 'PARSER_TAG_NOT_FOUND'
  | 'PARSER_JSON_INVALID'
  | 'PARSER_SCHEMA_INVALID'
  | 'REPOSITORY_API_UNAVAILABLE'
  | 'REPOSITORY_ENTRY_UID_MISSING'
  | 'ROUTER_ENTRY_NOT_FOUND'
  | 'ROUTER_ACTION_INVALID'
  | 'SCHEDULER_LOCKED'
  | 'SCHEDULER_DISABLED'
  | 'TARGET_BOOK_UNRESOLVED';

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
  enabled?: boolean;
  keys?: string | string[];
  secondary_keys?: string | string[];
  [key: string]: unknown;
}

export interface RouterResult {
  action: WorldAction | 'queue';
  entry_name: string;
  status: RouterStatus;
  code?: WbmErrorCode;
  reason?: string;
  detail?: string;
}

export interface SchedulerConfig {
  startAfter: number;
  interval: number;
  triggerTiming: TriggerTiming;
}

export interface SchedulerState {
  locked: boolean;
  lastFloor: number;
  nextDueFloor: number;
}

export interface WbmConfig extends SchedulerConfig {
  mode: ReviewMode;
  apiSource: ApiSource;
  targetType: TargetType;
  targetBookName: string;
  externalEndpoint: string;
  externalApiKey: string;
  externalModel: string;
  approvalMode: ApprovalMode;
  reviewDepth: number;
  autoEnabled: boolean;
  confirmDelete: boolean;
  logLevel: 'info' | 'warn' | 'error';
}

export interface PendingReviewItem {
  id: string;
  bookName: string;
  commands: WorldUpdateCommand[];
  createdAt: string;
  source: 'manual' | 'auto';
}

export interface SnapshotRecord {
  id: string;
  bookName: string;
  createdAt: string;
  reason: string;
  entries: WorldbookEntryLike[];
}

export interface WbmStatus {
  autoEnabled: boolean;
  processing: boolean;
  approvalMode: ApprovalMode;
  queueSize: number;
  nextDueFloor: number;
  targetBookName: string;
}

export interface LoggerLike {
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}
