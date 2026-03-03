import type { SnapshotRecord } from '../../core/types';
import type { StorageLike } from '../../core/config';
import { storageKey } from '../../core/config';

const SNAPSHOT_KEY = storageKey('snapshots');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class SnapshotStore {
  private readonly snapshots: SnapshotRecord[];
  private retention: number;

  constructor(
    private readonly storage: StorageLike | null,
    retention = 100,
  ) {
    this.retention = Number.isFinite(retention) ? Math.max(1, Math.floor(retention)) : 100;
    this.snapshots = this.load();
    this.enforceRetention();
  }

  setRetention(retention: number): void {
    if (!Number.isFinite(retention)) return;
    this.retention = Math.max(1, Math.floor(retention));
    this.enforceRetention();
  }

  private load(): SnapshotRecord[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(SNAPSHOT_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SnapshotRecord[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (!this.storage) return;
    this.storage.setItem(SNAPSHOT_KEY, JSON.stringify(this.snapshots));
  }

  private enforceRetention(): void {
    if (this.snapshots.length > this.retention) {
      this.snapshots.splice(0, this.snapshots.length - this.retention);
    }
    this.persist();
  }

  save(snapshot: SnapshotRecord): void {
    this.snapshots.push(clone(snapshot));
    this.enforceRetention();
  }

  list(bookName?: string): SnapshotRecord[] {
    const filtered = !bookName ? this.snapshots : this.snapshots.filter(item => item.bookName === bookName);
    return clone(filtered);
  }

  findById(id: string): SnapshotRecord | null {
    const found = this.snapshots.find(snapshot => snapshot.id === id);
    return found ? clone(found) : null;
  }

  findLatestByFloor(floor: number, chatId?: string): SnapshotRecord | null {
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const snapshot = this.snapshots[i];
      if (snapshot.floor !== floor) continue;
      if (chatId && snapshot.chatId !== chatId) continue;
      return clone(snapshot);
    }
    return null;
  }

  clear(bookName?: string): number {
    if (!bookName) {
      const count = this.snapshots.length;
      this.snapshots.splice(0, this.snapshots.length);
      this.persist();
      return count;
    }

    const keep = this.snapshots.filter(item => item.bookName !== bookName);
    const count = this.snapshots.length - keep.length;
    this.snapshots.splice(0, this.snapshots.length, ...keep);
    this.persist();
    return count;
  }
}
