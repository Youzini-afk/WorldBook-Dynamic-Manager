import { describe, expect, it } from 'vitest';
import { PromptPresetManager } from '../src/WBM/services/review/promptPresetManager';
import { memoryStorage } from './helpers';

describe('PromptPresetManager', () => {
  it('应支持预设 CRUD 与导入导出', () => {
    const manager = new PromptPresetManager(memoryStorage());

    const preset = manager.upsert('简版', [
      {
        id: 'p1',
        name: 'system',
        role: 'system',
        content: 'hello',
        order: 1,
        enabled: true,
      },
    ]);

    expect(manager.list()).toHaveLength(1);
    expect(manager.get(preset.id)?.entries).toHaveLength(1);

    manager.upsert('简版-更新', [], preset.id);
    expect(manager.get(preset.id)?.name).toBe('简版-更新');

    const exported = manager.exportAll();
    const imported = manager.importAll(exported);
    expect(imported).toBe(1);

    expect(manager.remove(preset.id)).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });

  it('导入非法数据应返回 0', () => {
    const manager = new PromptPresetManager(memoryStorage());
    expect(manager.importAll('nope')).toBe(0);
    expect(manager.importAll('{}')).toBe(0);
  });
});
