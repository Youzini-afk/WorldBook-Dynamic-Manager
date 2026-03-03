import { loadJson, saveJson, type StorageLike } from '../../core/config';

export interface AiRegistryItem {
  entryName: string;
  touchedAt: string;
  source: 'auto' | 'manual';
}

export class AiRegistry {
  private readonly keyPrefix = 'ai_registry_';

  constructor(private readonly storage: StorageLike | null) {}

  private storageKey(bookName: string): string {
    return `${this.keyPrefix}${bookName}`;
  }

  list(bookName: string): AiRegistryItem[] {
    const entries = loadJson<AiRegistryItem[]>(this.storageKey(bookName), [], this.storage ?? undefined);
    return Array.isArray(entries) ? entries : [];
  }

  mark(bookName: string, entryName: string, source: 'auto' | 'manual'): void {
    const list = this.list(bookName).filter(item => item.entryName !== entryName);
    list.push({
      entryName,
      touchedAt: new Date().toISOString(),
      source,
    });
    saveJson(this.storageKey(bookName), list, this.storage ?? undefined);
  }

  unmark(bookName: string, entryName: string): void {
    const list = this.list(bookName).filter(item => item.entryName !== entryName);
    saveJson(this.storageKey(bookName), list, this.storage ?? undefined);
  }

  rename(bookName: string, oldName: string, nextName: string): void {
    const list = this.list(bookName);
    const target = list.find(item => item.entryName === oldName);
    if (!target) return;
    target.entryName = nextName;
    target.touchedAt = new Date().toISOString();
    saveJson(this.storageKey(bookName), list, this.storage ?? undefined);
  }

  stats(bookName: string): { count: number; latestAt: string | null } {
    const list = this.list(bookName);
    const sorted = list.map(item => item.touchedAt).sort();
    const latestAt = sorted.length === 0 ? null : sorted[sorted.length - 1] ?? null;
    return {
      count: list.length,
      latestAt,
    };
  }
}
