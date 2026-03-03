import type { LoggerLike, WorldbookEntryLike } from '../../core/types';
import type { RuntimeWorldbookApi } from '../../infra/runtime/types';

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

  constructor(
    private readonly logger: LoggerLike,
    private readonly api: RuntimeWorldbookApi,
  ) {
    this.caps = {
      highLevel:
        typeof this.api.getWorldbook === 'function' &&
        typeof this.api.createWorldbookEntries === 'function' &&
        typeof this.api.updateWorldbookWith === 'function' &&
        typeof this.api.deleteWorldbookEntries === 'function',
      legacy:
        typeof this.api.getLorebookEntries === 'function' &&
        typeof this.api.createLorebookEntries === 'function' &&
        typeof this.api.setLorebookEntries === 'function' &&
        typeof this.api.deleteLorebookEntries === 'function',
    };
  }

  async getEntries(bookName: string): Promise<WorldbookEntryLike[]> {
    if (this.caps.highLevel && typeof this.api.getWorldbook === 'function') {
      return await this.api.getWorldbook(bookName);
    }
    if (this.caps.legacy && typeof this.api.getLorebookEntries === 'function') {
      return await this.api.getLorebookEntries(bookName);
    }
    throw new Error('世界书读取 API 不可用');
  }

  async addEntry(bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void> {
    if (this.caps.highLevel && typeof this.api.createWorldbookEntries === 'function') {
      await this.api.createWorldbookEntries(bookName, [fields]);
      return;
    }
    if (this.caps.legacy && typeof this.api.createLorebookEntries === 'function') {
      await this.api.createLorebookEntries(bookName, [fields]);
      return;
    }
    throw new Error('世界书创建 API 不可用');
  }

  async updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void> {
    const uid = entry.uid ?? entry.id;
    if (uid == null) throw new Error('缺少 uid');

    if (this.caps.highLevel && typeof this.api.updateWorldbookWith === 'function') {
      // 高层 API 场景下用 updater 按 uid 精准更新条目
      await this.api.updateWorldbookWith(bookName, entries =>
        entries.map(item => {
          const itemUid = item.uid ?? item.id;
          return String(itemUid) === String(uid) ? { ...item, ...entry } : item;
        }),
      );
      return;
    }

    if (this.caps.legacy && typeof this.api.setLorebookEntries === 'function') {
      await this.api.setLorebookEntries(bookName, [{ uid: normalizeUid(uid), ...entry }]);
      return;
    }
    throw new Error('世界书更新 API 不可用');
  }

  async deleteEntry(bookName: string, uid: number | string): Promise<void> {
    if (this.caps.highLevel && typeof this.api.deleteWorldbookEntries === 'function') {
      await this.api.deleteWorldbookEntries(bookName, entry => {
        const entryUid = entry.uid ?? entry.id;
        return String(entryUid) === String(uid);
      });
      return;
    }
    if (this.caps.legacy && typeof this.api.deleteLorebookEntries === 'function') {
      await this.api.deleteLorebookEntries(bookName, [normalizeUid(uid)]);
      return;
    }
    throw new Error('世界书删除 API 不可用');
  }

  async replaceEntries(bookName: string, entries: WorldbookEntryLike[]): Promise<void> {
    if (this.caps.highLevel && typeof this.api.updateWorldbookWith === 'function') {
      await this.api.updateWorldbookWith(bookName, () => entries);
      return;
    }
    if (
      this.caps.legacy &&
      typeof this.api.getLorebookEntries === 'function' &&
      typeof this.api.deleteLorebookEntries === 'function' &&
      typeof this.api.createLorebookEntries === 'function'
    ) {
      const current = await this.api.getLorebookEntries(bookName);
      const uids = current
        .map(item => item.uid ?? item.id)
        .filter(uid => uid != null)
        .map(uid => normalizeUid(uid as number | string));
      if (uids.length > 0) await this.api.deleteLorebookEntries(bookName, uids);
      if (entries.length > 0) await this.api.createLorebookEntries(bookName, entries);
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
