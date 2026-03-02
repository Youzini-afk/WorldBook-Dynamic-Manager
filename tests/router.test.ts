import { describe, expect, it } from 'vitest';
import type { PendingReviewItem, SnapshotRecord, WorldbookEntryLike } from '../src/WBM/core/types';
import { PatchProcessor } from '../src/WBM/services/patch/patchProcessor';
import { CommandRouter } from '../src/WBM/services/router/router';
import type { WorldbookRepository } from '../src/WBM/services/worldbook/repository';
import { noopLogger } from './helpers';

class InMemoryRepository implements WorldbookRepository {
  constructor(private readonly books: Record<string, WorldbookEntryLike[]>) {}

  async getEntries(bookName: string): Promise<WorldbookEntryLike[]> {
    return [...(this.books[bookName] ?? [])];
  }

  async addEntry(bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void> {
    const book = this.books[bookName] ?? (this.books[bookName] = []);
    const uid = book.length === 0 ? 0 : Number(book[book.length - 1].uid ?? book.length) + 1;
    book.push({ uid, ...fields });
  }

  async updateEntry(bookName: string, entry: WorldbookEntryLike): Promise<void> {
    const book = this.books[bookName] ?? [];
    const uid = entry.uid ?? entry.id;
    const idx = book.findIndex(item => String(item.uid ?? item.id) === String(uid));
    if (idx < 0) throw new Error('not found');
    book[idx] = { ...entry };
  }

  async deleteEntry(bookName: string, uid: number | string): Promise<void> {
    const book = this.books[bookName] ?? [];
    const next = book.filter(item => String(item.uid ?? item.id) !== String(uid));
    this.books[bookName] = next;
  }

  async replaceEntries(bookName: string, entries: WorldbookEntryLike[]): Promise<void> {
    this.books[bookName] = [...entries];
  }

  getCapabilities() {
    return { highLevel: true, legacy: false };
  }
}

describe('CommandRouter', () => {
  it('create/update/delete/patch 基础流程可执行', async () => {
    const repository = new InMemoryRepository({
      bookA: [{ uid: 0, name: '条目A', content: 'old', keys: 'a,b' }],
    });
    const router = new CommandRouter(repository, new PatchProcessor(), noopLogger);
    const results = await router.execute(
      [
        { action: 'create', entry_name: '条目B', fields: { content: 'new' }, ops: [] },
        { action: 'update', entry_name: '条目A', fields: { content: 'updated' }, ops: [] },
        {
          action: 'patch',
          entry_name: '条目A',
          fields: {},
          ops: [{ op: 'append', value: '!' }],
        },
        { action: 'delete', entry_name: '条目A', fields: {}, ops: [] },
      ],
      'bookA',
      { approvalMode: 'auto' },
    );
    expect(results.map(item => item.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    const remaining = await repository.getEntries('bookA');
    expect(remaining.find(item => item.name === '条目A')).toBeUndefined();
  });

  it('manual 模式全部入队', async () => {
    const queue: PendingReviewItem[] = [];
    const repository = new InMemoryRepository({ bookA: [] });
    const router = new CommandRouter(
      repository,
      new PatchProcessor(),
      noopLogger,
      {
        enqueue(item) {
          queue.push(item);
        },
      },
      undefined,
    );
    const results = await router.execute(
      [{ action: 'create', entry_name: '条目A', fields: {}, ops: [] }],
      'bookA',
      { approvalMode: 'manual', floor: 22, chatId: 'chat-1' },
    );
    expect(results[0].status).toBe('queued');
    expect(queue).toHaveLength(1);
    expect(queue[0].floor).toBe(22);
    expect(queue[0].chatId).toBe('chat-1');
  });

  it('selective 模式仅 delete 入队', async () => {
    const queue: PendingReviewItem[] = [];
    const repository = new InMemoryRepository({
      bookA: [{ uid: 0, name: '条目A', content: 'old' }],
    });
    const router = new CommandRouter(
      repository,
      new PatchProcessor(),
      noopLogger,
      {
        enqueue(item) {
          queue.push(item);
        },
      },
      undefined,
    );
    const results = await router.execute(
      [
        { action: 'update', entry_name: '条目A', fields: { content: 'new' }, ops: [] },
        { action: 'delete', entry_name: '条目A', fields: {}, ops: [] },
      ],
      'bookA',
      { approvalMode: 'selective' },
    );
    expect(results.map(item => item.status)).toEqual(['ok', 'queued']);
    expect(queue).toHaveLength(1);
    expect(queue[0].commands[0].action).toBe('delete');
  });

  it('update/patch/delete 会写入快照', async () => {
    const snapshots: SnapshotRecord[] = [];
    const repository = new InMemoryRepository({
      bookA: [{ uid: 0, name: '条目A', content: 'old' }],
    });
    const router = new CommandRouter(
      repository,
      new PatchProcessor(),
      noopLogger,
      undefined,
      {
        save(snapshot) {
          snapshots.push(snapshot);
        },
      },
    );
    await router.execute(
      [
        { action: 'update', entry_name: '条目A', fields: { content: 'u' }, ops: [] },
        { action: 'patch', entry_name: '条目A', fields: {}, ops: [{ op: 'append', value: 'p' }] },
        { action: 'delete', entry_name: '条目A', fields: {}, ops: [] },
      ],
      'bookA',
      { approvalMode: 'auto', floor: 9, chatId: 'chat-a' },
    );
    expect(snapshots).toHaveLength(3);
    expect(snapshots.every(item => item.floor === 9)).toBe(true);
    expect(snapshots.every(item => item.chatId === 'chat-a')).toBe(true);
  });

  it('目标不存在时返回 skipped，缺少 uid 时返回 error', async () => {
    const repository = new InMemoryRepository({
      bookA: [{ name: '无UID条目', content: 'x' }],
    });
    const router = new CommandRouter(repository, new PatchProcessor(), noopLogger);
    const results = await router.execute(
      [
        { action: 'update', entry_name: '不存在', fields: { content: 'x' }, ops: [] },
        { action: 'delete', entry_name: '无UID条目', fields: {}, ops: [] },
      ],
      'bookA',
      { approvalMode: 'auto' },
    );
    expect(results[0].status).toBe('skipped');
    expect(results[1].status).toBe('error');
    expect(results[1].code).toBe('REPOSITORY_ENTRY_UID_MISSING');
  });
});
