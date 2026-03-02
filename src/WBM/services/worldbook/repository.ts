import type { LoggerLike, WorldbookEntryLike } from '../../core/types';

type RuntimeApi = {
  getWorldbook?: (name: string) => Promise<WorldbookEntryLike[]>;
  createWorldbookEntries?: (
    name: string,
    entries: Partial<WorldbookEntryLike>[],
  ) => Promise<{ worldbook: WorldbookEntryLike[] }>;
  updateWorldbookWith?: (
    name: string,
    updater: (
      entries: WorldbookEntryLike[],
    ) => Partial<WorldbookEntryLike>[] | Promise<Partial<WorldbookEntryLike>[]>,
  ) => Promise<WorldbookEntryLike[]>;
  deleteWorldbookEntries?: (
    name: string,
    predicate: (entry: WorldbookEntryLike) => boolean,
  ) => Promise<{ worldbook: WorldbookEntryLike[]; deleted_entries: WorldbookEntryLike[] }>;
  getLorebookEntries?: (name: string) => Promise<WorldbookEntryLike[]>;
  setLorebookEntries?: (
    name: string,
    entries: Array<Pick<WorldbookEntryLike, 'uid'> & Partial<WorldbookEntryLike>>,
  ) => Promise<unknown>;
  createLorebookEntries?: (name: string, entries: Partial<WorldbookEntryLike>[]) => Promise<unknown>;
  deleteLorebookEntries?: (name: string, uids: number[]) => Promise<unknown>;
};

function runtimeApi(): RuntimeApi {
  return globalThis as RuntimeApi;
}

export interface RepositoryCapabilities {
  highLevel: boolean;
  legacy: boolean;
}

function normalizeUid(uid: number | string): number {
  if (typeof uid === 'number') return uid;
  const parsed = Number(uid);
  if (!Number.isFinite(parsed)) throw new Error(`uid 不是数字: ${uid}`);
  return parsed;
}

// 世界书仓储抽象，屏蔽具体实现细节
export interface WorldbookRepository {
  getEntries(bookName: string): Promise<WorldbookEntryLike[]>;
  addEntry(bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void>;
  updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void>;
  deleteEntry(bookName: string, uid: number | string): Promise<void>;
  replaceEntries(bookName: string, entries: WorldbookEntryLike[]): Promise<void>;
  getCapabilities(): RepositoryCapabilities;
}

// Tavern/SillyTavern 环境下的世界书仓储实现（高层优先，旧接口降级）
export class TavernWorldbookRepository implements WorldbookRepository {
  private readonly caps: RepositoryCapabilities;

  constructor(private readonly logger: LoggerLike) {
    this.caps = {
      highLevel:
        typeof runtimeApi().getWorldbook === 'function' &&
        typeof runtimeApi().createWorldbookEntries === 'function' &&
        typeof runtimeApi().updateWorldbookWith === 'function' &&
        typeof runtimeApi().deleteWorldbookEntries === 'function',
      legacy:
        typeof runtimeApi().getLorebookEntries === 'function' &&
        typeof runtimeApi().createLorebookEntries === 'function' &&
        typeof runtimeApi().setLorebookEntries === 'function' &&
        typeof runtimeApi().deleteLorebookEntries === 'function',
    };
  }

  async getEntries(bookName: string): Promise<WorldbookEntryLike[]> {
    const api = runtimeApi();
    if (this.caps.highLevel && typeof api.getWorldbook === 'function') {
      return await api.getWorldbook(bookName);
    }
    if (this.caps.legacy && typeof api.getLorebookEntries === 'function') {
      return await api.getLorebookEntries(bookName);
    }
    throw new Error('世界书读取 API 不可用');
  }

  async addEntry(bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void> {
    const api = runtimeApi();
    if (this.caps.highLevel && typeof api.createWorldbookEntries === 'function') {
      await api.createWorldbookEntries(bookName, [fields]);
      return;
    }
    if (this.caps.legacy && typeof api.createLorebookEntries === 'function') {
      await api.createLorebookEntries(bookName, [fields]);
      return;
    }
    throw new Error('世界书创建 API 不可用');
  }

  async updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void> {
    const uid = entry.uid ?? entry.id;
    if (uid == null) throw new Error('缺少 uid');

    const api = runtimeApi();
    if (this.caps.highLevel && typeof api.updateWorldbookWith === 'function') {
      // 高层 API 场景下用 updater 按 uid 精准更新条目
      await api.updateWorldbookWith(bookName, entries =>
        entries.map(item => {
          const itemUid = item.uid ?? item.id;
          return String(itemUid) === String(uid) ? { ...item, ...entry } : item;
        }),
      );
      return;
    }

    if (this.caps.legacy && typeof api.setLorebookEntries === 'function') {
      await api.setLorebookEntries(bookName, [{ uid: normalizeUid(uid), ...entry }]);
      return;
    }
    throw new Error('世界书更新 API 不可用');
  }

  async deleteEntry(bookName: string, uid: number | string): Promise<void> {
    const api = runtimeApi();
    if (this.caps.highLevel && typeof api.deleteWorldbookEntries === 'function') {
      await api.deleteWorldbookEntries(bookName, entry => {
        const entryUid = entry.uid ?? entry.id;
        return String(entryUid) === String(uid);
      });
      return;
    }
    if (this.caps.legacy && typeof api.deleteLorebookEntries === 'function') {
      await api.deleteLorebookEntries(bookName, [normalizeUid(uid)]);
      return;
    }
    throw new Error('世界书删除 API 不可用');
  }

  async replaceEntries(bookName: string, entries: WorldbookEntryLike[]): Promise<void> {
    const api = runtimeApi();
    if (this.caps.highLevel && typeof api.updateWorldbookWith === 'function') {
      await api.updateWorldbookWith(bookName, () => entries);
      return;
    }
    if (
      this.caps.legacy &&
      typeof api.getLorebookEntries === 'function' &&
      typeof api.deleteLorebookEntries === 'function' &&
      typeof api.createLorebookEntries === 'function'
    ) {
      const current = await api.getLorebookEntries(bookName);
      const uids = current
        .map(item => item.uid ?? item.id)
        .filter(uid => uid != null)
        .map(uid => normalizeUid(uid as number | string));
      if (uids.length > 0) await api.deleteLorebookEntries(bookName, uids);
      if (entries.length > 0) await api.createLorebookEntries(bookName, entries);
      return;
    }
    throw new Error('世界书替换 API 不可用');
  }

  getCapabilities(): RepositoryCapabilities {
    return { ...this.caps };
  }

  logBackend(): void {
    if (this.caps.highLevel) {
      this.logger.info('世界书后端：官方高层 API');
      return;
    }
    if (this.caps.legacy) {
      this.logger.info('世界书后端：官方旧接口降级层');
      return;
    }
    this.logger.warn('世界书后端：不可用');
  }
}
