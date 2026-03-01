import type { LoggerLike, WorldbookEntryLike } from '../../core/types';

declare const TavernHelper: any;
declare const getWorldbook: ((name: string) => Promise<WorldbookEntryLike[]>) | undefined;
declare const createWorldbookEntries:
  | ((name: string, entries: Partial<WorldbookEntryLike>[]) => Promise<{ worldbook: WorldbookEntryLike[] }>)
  | undefined;
declare const updateWorldbookWith:
  | ((
      name: string,
      updater: (entries: WorldbookEntryLike[]) => Partial<WorldbookEntryLike>[] | Promise<Partial<WorldbookEntryLike>[]>,
    ) => Promise<WorldbookEntryLike[]>)
  | undefined;
declare const deleteWorldbookEntries:
  | ((
      name: string,
      predicate: (entry: WorldbookEntryLike) => boolean,
    ) => Promise<{ worldbook: WorldbookEntryLike[]; deleted_entries: WorldbookEntryLike[] }>)
  | undefined;

// 世界书仓储抽象，屏蔽具体实现细节
export interface WorldbookRepository {
  getEntries(bookName: string): Promise<WorldbookEntryLike[]>;
  addEntry(bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void>;
  updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void>;
  deleteEntry(bookName: string, uid: number | string): Promise<void>;
}

// Tavern/SillyTavern 环境下的世界书仓储实现
export class TavernWorldbookRepository implements WorldbookRepository {
  constructor(private readonly logger: LoggerLike) {}

  async getEntries(bookName: string): Promise<WorldbookEntryLike[]> {
    // 优先走官方高层 API，失败时再回退 TavernHelper 兼容层
    if (typeof getWorldbook === 'function') {
      return await getWorldbook(bookName);
    }
    if (TavernHelper?.getLorebookEntries) {
      return await TavernHelper.getLorebookEntries(bookName);
    }
    throw new Error('世界书读取 API 不可用');
  }

  async addEntry(bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void> {
    if (typeof createWorldbookEntries === 'function') {
      await createWorldbookEntries(bookName, [fields]);
      return;
    }
    if (TavernHelper?.createLorebookEntries) {
      await TavernHelper.createLorebookEntries(bookName, [fields]);
      return;
    }
    throw new Error('世界书创建 API 不可用');
  }

  async updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void> {
    const uid = entry.uid ?? entry.id;
    if (uid == null) throw new Error('缺少 uid');

    if (typeof updateWorldbookWith === 'function') {
      // 高层 API 场景下用 updater 按 uid 精准更新条目
      await updateWorldbookWith(bookName, entries =>
        entries.map(item => {
          const itemUid = item.uid ?? item.id;
          return String(itemUid) === String(uid) ? { ...item, ...entry } : item;
        }),
      );
      return;
    }

    if (TavernHelper?.setLorebookEntries) {
      await TavernHelper.setLorebookEntries(bookName, [entry]);
      return;
    }
    throw new Error('世界书更新 API 不可用');
  }

  async deleteEntry(bookName: string, uid: number | string): Promise<void> {
    if (typeof deleteWorldbookEntries === 'function') {
      await deleteWorldbookEntries(bookName, entry => {
        const entryUid = entry.uid ?? entry.id;
        return String(entryUid) === String(uid);
      });
      return;
    }
    if (TavernHelper?.deleteLorebookEntry) {
      await TavernHelper.deleteLorebookEntry(bookName, uid);
      return;
    }
    throw new Error('世界书删除 API 不可用');
  }

  logBackend(): void {
    if (typeof getWorldbook === 'function') {
      this.logger.info('世界书后端：官方高层 API');
      return;
    }
    if (TavernHelper?.getLorebookEntries) {
      this.logger.info('世界书后端：TavernHelper 兼容层');
      return;
    }
    this.logger.warn('世界书后端：不可用');
  }
}
