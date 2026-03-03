import type {
  ApiPreset,
  BackendChatRecord,
  BookSyncResult,
  IsolationInfo,
  IsolationStats,
  PendingReviewItem,
  PromptEntry,
  PromptPreset,
  WbmApiConfig,
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
  createEntry(fields: Partial<WorldbookEntryLike>): Promise<void>;
  updateEntry(entry: WorldbookEntryLike): Promise<void>;
  deleteEntry(uid: number | string): Promise<void>;
  manualReview(): Promise<void>;
  approveAll(): Promise<void>;
  rejectAll(): Promise<void>;
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
  verifyCurrentBook(): Promise<BookSyncResult>;
  getIsolationInfo(): IsolationInfo;
  getIsolationStats(): IsolationStats;
  clearMyIsolation(): Promise<void> | void;
  clearAllIsolation(): Promise<void> | void;
  promoteIsolationToGlobal(): Promise<void> | void;
  getLogs(): LogRecord[];
  clearLogs(): void;
}
