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

  it('应支持按名称查找（忽略大小写与首尾空格）', () => {
    const storage = memoryStorage();
    const manager = new GlobalPresetManager(storage);
    manager.upsert('常驻方案A', ['book-A']);

    const found = manager.findByName('  常驻方案a  ');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('常驻方案A');
  });

  it('应支持导出与导入，并按名称覆盖同名预设', () => {
    const storage = memoryStorage();
    const manager = new GlobalPresetManager(storage);

    const first = manager.upsert('方案A', ['book-A']);
    const exported = manager.exportAll();
    const imported = manager.importAll(
      JSON.stringify({
        presets: [{ name: '方案A', worldbooks: ['book-B'] }],
      }),
    );

    expect(imported).toBe(1);
    const reloaded = manager.findByName('方案A');
    expect(reloaded?.id).toBe(first.id);
    expect(reloaded?.worldbooks).toEqual(['book-B']);

    const importedFromArray = manager.importAll(exported);
    expect(importedFromArray).toBe(1);
  });

  it('导入异常输入应返回 0', () => {
    const storage = memoryStorage();
    const manager = new GlobalPresetManager(storage);

    expect(manager.importAll('not-json')).toBe(0);
    expect(manager.importAll(JSON.stringify({ invalid: true }))).toBe(0);
  });
});
