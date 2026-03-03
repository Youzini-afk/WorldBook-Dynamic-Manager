import { loadJson, saveJson, type StorageLike } from '../../core/config';
import type { IsolationInfo, IsolationStats } from '../../core/types';

type IsolationMap = Record<string, Record<string, string[]>>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ChatIsolation {
  private readonly storageKey = 'isolation_map';
  private map: IsolationMap;
  private currentChatId = '';

  constructor(private readonly storage: StorageLike | null) {
    const loaded = loadJson<IsolationMap>(this.storageKey, {}, storage ?? undefined);
    this.map = loaded && typeof loaded === 'object' ? clone(loaded) : {};
  }

  private persist(): void {
    saveJson(this.storageKey, this.map, this.storage ?? undefined);
  }

  setCurrentChat(chatId: string): void {
    this.currentChatId = String(chatId ?? '').trim();
  }

  record(bookName: string, entryName: string): void {
    if (!this.currentChatId || !bookName || !entryName) return;
    const byBook = this.map[this.currentChatId] ?? (this.map[this.currentChatId] = {});
    const entries = byBook[bookName] ?? (byBook[bookName] = []);
    if (!entries.includes(entryName)) entries.push(entryName);
    this.persist();
  }

  getCurrentInfo(bookName?: string): IsolationInfo {
    const current = this.map[this.currentChatId] ?? {};
    const names = bookName ? current[bookName] ?? [] : Object.values(current).flat();
    return {
      chatId: this.currentChatId,
      count: names.length,
      entries: [...names],
    };
  }

  getStats(bookName?: string): IsolationStats {
    const byChat: Array<{ chatId: string; count: number }> = [];
    let totalEntries = 0;
    for (const [chatId, books] of Object.entries(this.map)) {
      const count = bookName
        ? (books[bookName]?.length ?? 0)
        : Object.values(books).reduce((sum, names) => sum + names.length, 0);
      totalEntries += count;
      byChat.push({ chatId, count });
    }
    return {
      totalChats: byChat.length,
      totalEntries,
      byChat,
    };
  }

  clearMine(bookName?: string): number {
    if (!this.currentChatId || !this.map[this.currentChatId]) return 0;
    if (bookName) {
      const count = this.map[this.currentChatId][bookName]?.length ?? 0;
      delete this.map[this.currentChatId][bookName];
      if (Object.keys(this.map[this.currentChatId]).length === 0) {
        delete this.map[this.currentChatId];
      }
      this.persist();
      return count;
    }

    const count = Object.values(this.map[this.currentChatId]).reduce((sum, names) => sum + names.length, 0);
    delete this.map[this.currentChatId];
    this.persist();
    return count;
  }

  clearAll(bookName?: string): number {
    if (!bookName) {
      const count = Object.values(this.map)
        .flatMap(books => Object.values(books))
        .reduce((sum, names) => sum + names.length, 0);
      this.map = {};
      this.persist();
      return count;
    }

    let count = 0;
    for (const chatId of Object.keys(this.map)) {
      count += this.map[chatId][bookName]?.length ?? 0;
      delete this.map[chatId][bookName];
      if (Object.keys(this.map[chatId]).length === 0) {
        delete this.map[chatId];
      }
    }
    this.persist();
    return count;
  }

  promoteToGlobal(bookName?: string): string[] {
    const promoted = new Set<string>();
    for (const books of Object.values(this.map)) {
      if (bookName) {
        for (const name of books[bookName] ?? []) promoted.add(name);
        continue;
      }
      for (const names of Object.values(books)) {
        for (const name of names) promoted.add(name);
      }
    }
    return [...promoted];
  }
}
