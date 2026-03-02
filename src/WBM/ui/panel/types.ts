import type {
  PendingReviewItem,
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
  getLogs(): LogRecord[];
  clearLogs(): void;
}
