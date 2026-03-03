import { loadJson, saveJson, type StorageLike } from '../../core/config';
import type { SnapshotRecord, WorldbookEntryLike } from '../../core/types';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(): string {
  return `backup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export class BackupManager {
  private backups: SnapshotRecord[];

  constructor(
    private readonly storage: StorageLike | null,
    private retention = 50,
  ) {
    const loaded = loadJson<SnapshotRecord[]>('backup_index', [], storage ?? undefined);
    this.backups = Array.isArray(loaded) ? clone(loaded) : [];
    this.prune();
  }

  setRetention(retention: number): void {
    this.retention = Number.isFinite(retention) ? Math.max(1, Math.floor(retention)) : this.retention;
    this.prune();
  }

  private persist(): void {
    saveJson('backup_index', this.backups, this.storage ?? undefined);
  }

  private prune(): void {
    if (this.backups.length <= this.retention) {
      this.persist();
      return;
    }
    this.backups.splice(0, this.backups.length - this.retention);
    this.persist();
  }

  create(
    bookName: string,
    entries: WorldbookEntryLike[],
    reason: string,
    floor?: number,
    chatId?: string,
  ): SnapshotRecord {
    const record: SnapshotRecord = {
      id: newId(),
      bookName,
      createdAt: new Date().toISOString(),
      reason,
      entries: clone(entries),
      floor,
      chatId,
    };
    this.backups.push(record);
    this.prune();
    return clone(record);
  }

  list(bookName?: string): SnapshotRecord[] {
    const filtered = !bookName ? this.backups : this.backups.filter(item => item.bookName === bookName);
    return clone(filtered);
  }

  find(id: string): SnapshotRecord | null {
    const found = this.backups.find(item => item.id === id);
    return found ? clone(found) : null;
  }

  remove(id: string): boolean {
    const before = this.backups.length;
    this.backups = this.backups.filter(item => item.id !== id);
    const changed = this.backups.length !== before;
    if (changed) this.persist();
    return changed;
  }
}
