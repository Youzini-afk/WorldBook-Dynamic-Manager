import { describe, expect, it } from 'vitest';
import { memoryStorage } from './helpers';
import { GlobalPresetManager } from '../src/WBM/services/worldbook/globalPresetManager';

describe('GlobalPresetManager', () => {
  it('应支持保存、读取与删除全局预设', () => {
    const storage = memoryStorage();
    const manager = new GlobalPresetManager(storage);

    const created = manager.upsert('默认常驻', ['book-A', 'book-B', 'book-A']);
    expect(created.worldbooks).toEqual(['book-A', 'book-B']);

    const loaded = manager.get(created.id);
    expect(loaded?.name).toBe('默认常驻');
    expect(loaded?.worldbooks).toEqual(['book-A', 'book-B']);

    const removed = manager.remove(created.id);
    expect(removed).toBe(true);
    expect(manager.get(created.id)).toBeNull();
  });

  it('应在同一 id 下覆盖更新', () => {
    const storage = memoryStorage();
    const manager = new GlobalPresetManager(storage);

    const created = manager.upsert('方案A', ['book-A']);
    const updated = manager.upsert('方案A-更新', ['book-C'], created.id);

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('方案A-更新');
    expect(updated.worldbooks).toEqual(['book-C']);
    expect(manager.list()).toHaveLength(1);
  });
});

