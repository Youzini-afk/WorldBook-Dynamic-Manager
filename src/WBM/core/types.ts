export type WorldAction = 'create' | 'update' | 'delete' | 'patch';
export type TriggerTiming = 'before' | 'after' | 'both';
export type ReviewMode = 'inline' | 'external';
export type ApiSource = 'tavern' | 'custom';
export type ApiType = 'openai' | 'custom' | 'gemini';
export type TargetType = 'charPrimary' | 'charAdditional' | 'global' | 'managed';
export type ManagedFallbackPolicy = 'strict' | 'fallback';
export type ApprovalMode = 'auto' | 'manual' | 'selective';
export type ContextMode = 'full' | 'triggered' | 'summary';
export type ContentFilterMode = 'none' | 'tags';
export type RefreshMode = 'full' | 'minimal';
export type RouterStatus = 'ok' | 'skipped' | 'queued' | 'error';
export type ImportConflictPolicy = 'overwrite' | 'skip_duplicate' | 'merge_rename';

export type WbmErrorCode =
  | 'PARSER_TAG_NOT_FOUND'
  | 'PARSER_JSON_INVALID'
  | 'PARSER_SCHEMA_INVALID'
  | 'REPOSITORY_API_UNAVAILABLE'
  | 'REPOSITORY_ENTRY_UID_MISSING'
  | 'ROUTER_ENTRY_NOT_FOUND'
  | 'ROUTER_ENTRY_LOCKED'
  | 'ROUTER_ACTION_INVALID'
  | 'ROUTER_CONFIRM_UPDATE_REQUIRED'
  | 'ROUTER_MAX_CREATE_REACHED'
  | 'ROUTER_PATCH_FAILED'
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

export interface WbmApiConfig {
  type: ApiType;
  endpoint: string;
  key: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  timeoutMs: number;
  retries: number;
}

export interface EntryDefaults {
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  depth: number;
  order: number;
}

export interface PromptEntry {
  id: string;
  name: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  order: number;
  enabled: boolean;
  builtin?: boolean;
}

export interface ApiPreset {
  id: string;
  name: string;
  config: WbmApiConfig;
  createdAt: string;
  updatedAt: string;
}

export interface PromptPreset {
  id: string;
  name: string;
  entries: PromptEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface GlobalWorldbookPreset {
  id: string;
  name: string;
  worldbooks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WbmConfig extends SchedulerConfig {
  mode: ReviewMode;
  apiSource: ApiSource;
  targetType: TargetType;
  targetBookName: string;
  managedFallbackPolicy: ManagedFallbackPolicy;

  // 兼容 v2/v3 旧字段
  externalEndpoint: string;
  externalApiKey: string;
  externalModel: string;

  approvalMode: ApprovalMode;
  reviewDepth: number;
  autoEnabled: boolean;
  confirmDelete: boolean;
  logLevel: 'info' | 'warn' | 'error';

  // 原版全量对齐字段
  confirmUpdate: boolean;
  maxCreatePerRound: number;
  contentFilterMode: ContentFilterMode;
  contentFilterTags: string;
  contextMode: ContextMode;
  maxContentChars: number;
  patchDuplicateGuard: boolean;
  fabEnabled: boolean;
  syncOnDelete: boolean;
  snapshotRetention: number;
  excludeConstantFromPrompt: boolean;
  directTriggerOnly: boolean;
  sendUserMessages: boolean;
  sendAiMessages: boolean;
  autoVerifyAfterUpdate: boolean;
  refreshMode: RefreshMode;
  aiRegistryEnabled: boolean;
  chatIsolationEnabled: boolean;
  autoBackupBeforeAI: boolean;
  entryLockEnabled: boolean;
  tokenEstimateEnabled: boolean;
  activeApiPreset: string;
  activePromptPreset: string;
}

export interface PendingReviewItem {
  id: string;
  bookName: string;
  commands: WorldUpdateCommand[];
  createdAt: string;
  source: 'manual' | 'auto' | 'legacy';
  floor?: number;
  chatId?: string;
}

export interface SnapshotRecord {
  id: string;
  bookName: string;
  createdAt: string;
  reason: string;
  entries: WorldbookEntryLike[];
  floor?: number;
  chatId?: string;
}

export interface BookSyncIssue {
  type: 'missing' | 'inconsistent' | 'runtime_error';
  message: string;
  entryName?: string;
}

export interface BookSyncResult {
  ok: boolean;
  checkedAt: string;
  bookName: string;
  issueCount: number;
  issues: BookSyncIssue[];
}

export interface IsolationInfo {
  chatId: string;
  count: number;
  entries: string[];
}

export interface IsolationStats {
  totalChats: number;
  totalEntries: number;
  byChat: Array<{ chatId: string; count: number }>;
}

export interface BackendChatRecord {
  id: string;
  createdAt: string;
  source: 'manual' | 'auto';
  bookName: string;
  floor?: number;
  chatId?: string;
  promptPreview: string;
  outputPreview: string;
  commandCount: number;
  durationMs?: number;
  promptMessages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  rawReply?: string;
  commands?: WorldUpdateCommand[];
  results?: RouterResult[];
  success: boolean;
  error?: string;
}

export interface WorldbookImportResult {
  bookName: string;
  strategy: ImportConflictPolicy;
  imported: number;
  skipped: number;
  renamed: number;
}

export interface ActivationLogRecord {
  id: string;
  time: string;
  bookName: string;
  uid: string;
  name: string;
  preview: string;
  source: 'world_info_activated';
}

export interface WbmDepsState {
  highLevelWorldbook: boolean;
  legacyWorldbook: boolean;
}

export interface WbmStatus {
  autoEnabled: boolean;
  processing: boolean;
  approvalMode: ApprovalMode;
  queueSize: number;
  nextDueFloor: number;
  targetBookName: string;
  backendAvailable: boolean;
  eventSourceAvailable: boolean;
  mountAvailable: boolean;
  lastAiFloor?: number;
  nextUpdateAiFloor?: number;
  pendingCount?: number;
  depsState?: WbmDepsState;
  contextSource?: string;
  resolvedBy?: string;
  fallbackUsed?: boolean;
  lastResolveError?: string;
}

export interface LoggerLike {
  info(message: string, extra?: unknown): void;
  warn(message: string, extra?: unknown): void;
  error(message: string, extra?: unknown): void;
}

export interface KeywordScanItem {
  uid: number | string | null;
  name: string;
  matchedKeys: string[];
  matchedSecondaryKeys: string[];
}

export interface KeywordScanResult {
  triggered: KeywordScanItem[];
  total: number;
  scanText: string;
}

export interface WbmPublicApi {
  version: string;
  FULL_ENTRY_TEMPLATE: WorldbookEntryLike;

  openUI(): void;
  closeUI(): void;
  manualReview(
    bookName?: string,
    messages?: { role: 'system' | 'user' | 'assistant'; content: string }[],
  ): Promise<void>;

  approveQueue(ids?: string[]): Promise<void>;
  rejectQueue(ids?: string[]): Promise<number>;
  rollback(snapshotId: string): Promise<void>;
  rollbackFloor(floor: number, chatId?: string): Promise<void>;
  listQueue(): PendingReviewItem[];
  listSnapshots(bookName?: string): SnapshotRecord[];
  getStatus(): WbmStatus;

  getEntries(bookName?: string): Promise<WorldbookEntryLike[]>;
  listWorldbookNames(targetType?: TargetType): Promise<string[]>;
  getGlobalWorldbooks(): string[];
  setGlobalWorldbooks(names: string[]): Promise<string[]>;
  listGlobalPresets(): GlobalWorldbookPreset[];
  saveCurrentGlobalPreset(name: string): GlobalWorldbookPreset;
  applyGlobalPreset(id: string): Promise<string[]>;
  deleteGlobalPreset(id: string): boolean;
  exportWorldbook(bookName?: string): Promise<string>;
  importWorldbookRaw(
    bookName: string,
    payload: unknown,
    strategy?: ImportConflictPolicy,
  ): Promise<WorldbookImportResult>;
  listLockedEntries(bookName?: string): string[];
  setEntryLock(bookName: string, entryName: string, locked: boolean): boolean;
  addEntry(bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void>;
  updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void>;
  deleteEntry(bookName: string, uid: number | string): Promise<void>;
  batchSetEnabled(
    bookName: string,
    uids: Array<number | string>,
    enabled: boolean,
  ): Promise<{ updated: number; skipped: number }>;
  batchDeleteEntries(
    bookName: string,
    uids: Array<number | string>,
  ): Promise<{ deleted: number; skipped: number }>;
  patchEntry(bookName: string, entryName: string, ops: PatchOp[]): Promise<{ applied: number; skipped: number; errors: string[] }>;

  parseCommands(text: string): WorldUpdateCommand[];
  executeCommands(commands: WorldUpdateCommand[], bookName: string): Promise<RouterResult[]>;

  buildFullContext(bookName?: string): Promise<string>;
  buildSummary(bookName?: string): Promise<string>;
  buildTriggeredContext(bookName?: string, depth?: number): Promise<string>;
  scanKeywords(bookName?: string, depth?: number): Promise<KeywordScanResult>;

  verifyBook(bookName?: string, results?: RouterResult[]): Promise<BookSyncResult>;
  repairBook(bookName?: string, verifyResult?: BookSyncResult, commands?: WorldUpdateCommand[]): Promise<BookSyncResult>;

  getPendingQueue(): PendingReviewItem[];
  getPendingCount(): number;
  approveAll(ids?: string[]): Promise<void>;
  approveOne(id: string): Promise<void>;
  rejectAll(ids?: string[]): Promise<number>;
  rejectOne(id: string): Promise<number>;
  getSnapshots(bookName?: string): SnapshotRecord[];
  cleanupQueue(): number;
  clearQueue(): number;

  getIsolationInfo(): IsolationInfo;
  getIsolationStats(bookName?: string): IsolationStats;
  clearMyIsolation(bookName?: string): number;
  clearAllIsolation(bookName?: string): number;
  promoteIsolationToGlobal(bookName?: string): Promise<void>;

  listBackendChats(): BackendChatRecord[];
  exportBackendChats(ids?: string[]): string;
  listActivationLogs(): ActivationLogRecord[];
  clearActivationLogs(): void;
}

export interface WbmLegacyApi extends WbmPublicApi {}
