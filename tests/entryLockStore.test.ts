import { describe, expect, it } from 'vitest';
import { storageKey } from '../src/WBM/core/config';
import { EntryLockStore } from '../src/WBM/services/worldbook/entryLockStore';
import { memoryStorage } from './helpers';

describe('EntryLockStore', () => {
  it('应支持锁定/去重/解锁', () => {
    const storage = memoryStorage();
    const store = new EntryLockStore(storage);

    expect(store.list('bookA')).toEqual([]);
    expect(store.lock('bookA', '词条A')).toBe(true);
    expect(store.lock('bookA', '词条A')).toBe(false);
    expect(store.lock('bookA', '  词条A  ')).toBe(false);
    expect(store.lock('bookA', '词条B')).toBe(true);

    expect(store.list('bookA')).toEqual(['词条A', '词条B']);
    expect(store.has('bookA', '词条a')).toBe(true);

    expect(store.unlock('bookA', '词条A')).toBe(true);
    expect(store.list('bookA')).toEqual(['词条B']);
    expect(store.unlock('bookA', '词条A')).toBe(false);
  });

  it('空列表时应清除存储键', () => {
    const storage = memoryStorage();
    const store = new EntryLockStore(storage);
    store.lock('bookA', '词条A');
    expect(storage.getItem(storageKey('locked_bookA'))).not.toBeNull();

    store.unlock('bookA', '词条A');
    expect(storage.getItem(storageKey('locked_bookA'))).toBeNull();
  });
});
