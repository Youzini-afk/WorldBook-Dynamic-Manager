import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../src/WBM/services/worldbook/snapshotStore';
import { memoryStorage } from './helpers';

describe('SnapshotStore', () => {
  it('支持保存、按书名过滤、按 id 查找', () => {
    const store = new SnapshotStore(memoryStorage());
    store.save({
      id: 's1',
      bookName: 'bookA',
      createdAt: new Date().toISOString(),
      reason: 'delete:A',
      entries: [{ uid: 1, name: 'A' }],
    });
    store.save({
      id: 's2',
      bookName: 'bookB',
      createdAt: new Date().toISOString(),
      reason: 'patch:B',
      entries: [{ uid: 2, name: 'B' }],
    });

    expect(store.list('bookA')).toHaveLength(1);
    expect(store.findById('s2')?.bookName).toBe('bookB');
  });
});
