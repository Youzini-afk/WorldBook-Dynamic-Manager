import { clearJson, loadJson, saveJson, type StorageLike } from '../../core/config';

function normalizeEntryName(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function dedupeNames(values: unknown[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeEntryName(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

export class EntryLockStore {
  private readonly keyPrefix = 'locked_';

  constructor(private readonly storage: StorageLike | null) {}

  private storageKey(bookName: string): string {
    return `${this.keyPrefix}${bookName}`;
  }

  list(bookName: string): string[] {
    const raw = loadJson<unknown[]>(this.storageKey(bookName), [], this.storage ?? undefined);
    if (!Array.isArray(raw)) return [];
    return dedupeNames(raw);
  }

  has(bookName: string, entryName: string): boolean {
    const needle = normalizeEntryName(entryName).toLowerCase();
    if (!needle) return false;
    return this.list(bookName).some(item => item.toLowerCase() === needle);
  }

  lock(bookName: string, entryName: string): boolean {
    const normalized = normalizeEntryName(entryName);
    if (!normalized) return false;
    if (this.has(bookName, normalized)) return false;
    const next = [...this.list(bookName), normalized];
    saveJson(this.storageKey(bookName), next, this.storage ?? undefined);
    return true;
  }

  unlock(bookName: string, entryName: string): boolean {
    const needle = normalizeEntryName(entryName).toLowerCase();
    if (!needle) return false;
    const current = this.list(bookName);
    const next = current.filter(item => item.toLowerCase() !== needle);
    if (next.length === current.length) return false;
    if (next.length === 0) {
      clearJson(this.storageKey(bookName), this.storage ?? undefined);
      return true;
    }
    saveJson(this.storageKey(bookName), next, this.storage ?? undefined);
    return true;
  }

  replace(bookName: string, entryNames: string[]): void {
    const next = dedupeNames(entryNames);
    if (next.length === 0) {
      clearJson(this.storageKey(bookName), this.storage ?? undefined);
      return;
    }
    saveJson(this.storageKey(bookName), next, this.storage ?? undefined);
  }

  clear(bookName: string): void {
    clearJson(this.storageKey(bookName), this.storage ?? undefined);
  }
}
