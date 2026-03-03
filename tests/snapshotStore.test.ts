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

  it('支持按 floor/chatId 查找最新快照', () => {
    const store = new SnapshotStore(memoryStorage());
    store.save({
      id: 's1',
      bookName: 'bookA',
      createdAt: new Date().toISOString(),
      reason: 'update:A',
      entries: [{ uid: 1, name: 'A' }],
      floor: 12,
      chatId: 'chat-a',
    });
    store.save({
      id: 's2',
      bookName: 'bookA',
      createdAt: new Date().toISOString(),
      reason: 'patch:A',
      entries: [{ uid: 1, name: 'A2' }],
      floor: 12,
      chatId: 'chat-b',
    });
    store.save({
      id: 's3',
      bookName: 'bookA',
      createdAt: new Date().toISOString(),
      reason: 'patch:A3',
      entries: [{ uid: 1, name: 'A3' }],
      floor: 12,
    });

    expect(store.findLatestByFloor(12)?.id).toBe('s3');
    expect(store.findLatestByFloor(12, 'chat-a')?.id).toBe('s1');
    expect(store.findLatestByFloor(12, 'missing')).toBeNull();
    expect(store.findLatestByFloor(12, 'chat-b')?.id).toBe('s2');
  });

  it('setRetention 与 clear 应生效', () => {
    const store = new SnapshotStore(memoryStorage(), 3);
    store.save({ id: 's1', bookName: 'bookA', createdAt: new Date().toISOString(), reason: 'r1', entries: [] });
    store.save({ id: 's2', bookName: 'bookA', createdAt: new Date().toISOString(), reason: 'r2', entries: [] });
    store.save({ id: 's3', bookName: 'bookA', createdAt: new Date().toISOString(), reason: 'r3', entries: [] });

    store.setRetention(2);
    expect(store.list()).toHaveLength(2);
    expect(store.list().map(item => item.id)).toEqual(['s2', 's3']);

    store.save({ id: 'b1', bookName: 'bookB', createdAt: new Date().toISOString(), reason: 'r4', entries: [] });
    expect(store.clear('bookA')).toBeGreaterThan(0);
    expect(store.list('bookA')).toHaveLength(0);
    expect(store.clear()).toBe(1);
  });
});
