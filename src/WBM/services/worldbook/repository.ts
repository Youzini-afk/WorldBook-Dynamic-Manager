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

export interface WorldbookRepository {
  getEntries(bookName: string): Promise<WorldbookEntryLike[]>;
  addEntry(bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void>;
  updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void>;
  deleteEntry(bookName: string, uid: number | string): Promise<void>;
}

export class TavernWorldbookRepository implements WorldbookRepository {
  constructor(private readonly logger: LoggerLike) {}

  async getEntries(bookName: string): Promise<WorldbookEntryLike[]> {
    if (typeof getWorldbook === 'function') {
      return await getWorldbook(bookName);
    }
    if (TavernHelper?.getLorebookEntries) {
      return await TavernHelper.getLorebookEntries(bookName);
    }
    throw new Error('worldbook read API unavailable');
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
    throw new Error('worldbook create API unavailable');
  }

  async updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void> {
    const uid = entry.uid ?? entry.id;
    if (uid == null) throw new Error('missing uid');

    if (typeof updateWorldbookWith === 'function') {
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
    throw new Error('worldbook update API unavailable');
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
    throw new Error('worldbook delete API unavailable');
  }

  logBackend(): void {
    if (typeof getWorldbook === 'function') {
      this.logger.info('worldbook backend: official high-level API');
      return;
    }
    if (TavernHelper?.getLorebookEntries) {
      this.logger.info('worldbook backend: TavernHelper compatibility layer');
      return;
    }
    this.logger.warn('worldbook backend: unavailable');
  }
}
