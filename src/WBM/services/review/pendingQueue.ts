import type { PendingReviewItem } from '../../core/types';
import type { StorageLike } from '../../core/config';
import { storageKey } from '../../core/config';

const QUEUE_KEY = storageKey('pending_queue');

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class PendingQueue {
  private readonly items: PendingReviewItem[];

  constructor(private readonly storage: StorageLike | null) {
    this.items = this.load();
  }

  private load(): PendingReviewItem[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as PendingReviewItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  private persist(): void {
    if (!this.storage) return;
    this.storage.setItem(QUEUE_KEY, JSON.stringify(this.items));
  }

  enqueue(item: PendingReviewItem): void {
    this.items.push(clone(item));
    this.persist();
  }

  list(): PendingReviewItem[] {
    return clone(this.items);
  }

  getPending(): PendingReviewItem[] {
    return this.list();
  }

  take(ids?: string[]): PendingReviewItem[] {
    if (!ids || ids.length === 0) {
      const all = this.list();
      this.items.splice(0, this.items.length);
      this.persist();
      return all;
    }
    const keep: PendingReviewItem[] = [];
    const take: PendingReviewItem[] = [];
    const wanted = new Set(ids);
    for (const item of this.items) {
      if (wanted.has(item.id)) take.push(clone(item));
      else keep.push(item);
    }
    this.items.splice(0, this.items.length, ...keep);
    this.persist();
    return take;
  }

  reject(ids?: string[]): number {
    if (!ids || ids.length === 0) {
      const count = this.items.length;
      this.items.splice(0, this.items.length);
      this.persist();
      return count;
    }
    const wanted = new Set(ids);
    const keep = this.items.filter(item => !wanted.has(item.id));
    const count = this.items.length - keep.length;
    this.items.splice(0, this.items.length, ...keep);
    this.persist();
    return count;
  }

  rejectOne(id: string): number {
    return this.reject([id]);
  }

  clearAll(): number {
    return this.reject();
  }

  cleanup(): number {
    const before = this.items.length;
    const now = Date.now();
    const ttl = 14 * 24 * 60 * 60 * 1000;
    const keep = this.items.filter(item => {
      const timestamp = Date.parse(item.createdAt);
      if (!Number.isFinite(timestamp)) return true;
      return now - timestamp <= ttl;
    });
    const removed = before - keep.length;
    if (removed > 0) {
      this.items.splice(0, this.items.length, ...keep);
      this.persist();
    }
    return removed;
  }

  count(): number {
    return this.items.length;
  }

  size(): number {
    return this.items.length;
  }
}
