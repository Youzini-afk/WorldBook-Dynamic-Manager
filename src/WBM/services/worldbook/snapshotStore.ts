import type { SnapshotRecord } from '../../core/types';
import type { StorageLike } from '../../core/config';
import { storageKey } from '../../core/config';

const SNAPSHOT_KEY = storageKey('snapshots');
const MAX_SNAPSHOTS = 100;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class SnapshotStore {
  private readonly snapshots: SnapshotRecord[];

  constructor(private readonly storage: StorageLike | null) {
    this.snapshots = this.load();
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

  save(snapshot: SnapshotRecord): void {
    this.snapshots.push(clone(snapshot));
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.splice(0, this.snapshots.length - MAX_SNAPSHOTS);
    }
    this.persist();
  }

  list(bookName?: string): SnapshotRecord[] {
    const filtered = !bookName ? this.snapshots : this.snapshots.filter(item => item.bookName === bookName);
    return clone(filtered);
  }

  findById(id: string): SnapshotRecord | null {
    const found = this.snapshots.find(snapshot => snapshot.id === id);
    return found ? clone(found) : null;
  }
}
