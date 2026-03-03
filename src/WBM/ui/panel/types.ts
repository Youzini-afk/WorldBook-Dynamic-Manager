import type {
  ActivationLogRecord,
  ApiPreset,
  BackendChatRecord,
  BookSyncResult,
  GlobalWorldbookPreset,
  ImportConflictPolicy,
  IsolationInfo,
  IsolationStats,
  PendingReviewItem,
  PromptEntry,
  PromptPreset,
  TargetType,
  WbmApiConfig,
  WorldbookImportResult,
  SnapshotRecord,
  WbmConfig,
  WbmStatus,
  WorldbookEntryLike,
} from '../../core/types';
import type { LogRecord } from '../../infra/logger';

export interface PanelBridge {
  getStatus(): WbmStatus;
  getConfig(): WbmConfig;
  saveConfig(next: WbmConfig): Promise<void> | void;
  listEntries(): Promise<WorldbookEntryLike[]>;
  listWorldbookNames(targetType?: TargetType): Promise<string[]>;
  getGlobalBindings(): string[];
  setGlobalBindings(names: string[]): Promise<string[]>;
  listGlobalPresets(): GlobalWorldbookPreset[];
  saveCurrentGlobalPreset(name: string): Promise<GlobalWorldbookPreset> | GlobalWorldbookPreset;
  applyGlobalPreset(id: string): Promise<string[]>;
  deleteGlobalPreset(id: string): Promise<boolean> | boolean;
  exportGlobalPresets(): string;
  importGlobalPresets(payload: string): Promise<number> | number;
  listAiManagedNames(): string[];
  listLockedNames(): string[];
  setEntryLocked(uid: number | string, locked: boolean): Promise<void>;
  batchSetEnabled(uids: Array<number | string>, enabled: boolean): Promise<{ updated: number; skipped: number }>;
  batchDeleteEntries(uids: Array<number | string>): Promise<{ deleted: number; skipped: number }>;
  createEntry(fields: Partial<WorldbookEntryLike>): Promise<void>;
  updateEntry(entry: WorldbookEntryLike): Promise<void>;
  deleteEntry(uid: number | string): Promise<void>;
  manualReview(): Promise<void>;
  approveAll(): Promise<void>;
  rejectAll(): Promise<void>;
  approveOne(id: string): Promise<void>;
  rejectOne(id: string): Promise<void>;
  listQueue(): PendingReviewItem[];
  listSnapshots(bookName?: string): SnapshotRecord[];
  rollback(snapshotId: string): Promise<void>;
  rollbackFloor(floor: number, chatId?: string): Promise<void>;
  getApiConfig(): WbmApiConfig;
  saveApiConfig(next: WbmApiConfig): Promise<void> | void;
  listPromptEntries(): PromptEntry[];
  savePromptEntries(entries: PromptEntry[]): Promise<void> | void;
  listApiPresets(): ApiPreset[];
  saveCurrentAsApiPreset(name: string): Promise<void> | void;
  applyApiPreset(id: string): Promise<void> | void;
  deleteApiPreset(id: string): Promise<void> | void;
  listPromptPresets(): PromptPreset[];
  saveCurrentAsPromptPreset(name: string): Promise<void> | void;
  applyPromptPreset(id: string): Promise<void> | void;
  deletePromptPreset(id: string): Promise<void> | void;
  listBackendChats(): BackendChatRecord[];
  exportBackendChats(ids?: string[]): string;
  exportWorldbook(bookName?: string): Promise<string>;
  importWorldbookRaw(
    bookName: string,
    payload: unknown,
    strategy?: ImportConflictPolicy,
  ): Promise<WorldbookImportResult>;
  listActivationLogs(): ActivationLogRecord[];
  clearActivationLogs(): void;
  exportActivationLogs(): string;
  verifyCurrentBook(): Promise<BookSyncResult>;
  getIsolationInfo(): IsolationInfo;
  getIsolationStats(): IsolationStats;
  clearMyIsolation(): Promise<void> | void;
  clearAllIsolation(): Promise<void> | void;
  promoteIsolationToGlobal(): Promise<void> | void;
  getLogs(): LogRecord[];
  clearLogs(): void;
}
