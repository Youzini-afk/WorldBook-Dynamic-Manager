import { describe, expect, it } from 'vitest';
import { ApiPresetManager } from '../src/WBM/services/review/apiPresetManager';
import { memoryStorage } from './helpers';

describe('ApiPresetManager', () => {
  it('应支持增删改查与导入导出', () => {
    const storage = memoryStorage();
    const manager = new ApiPresetManager(storage);

    const preset = manager.upsert('默认', {
      type: 'openai',
      endpoint: 'https://api.example.com',
      key: 'k',
      model: 'gpt-4o-mini',
      maxTokens: 1024,
      temperature: 0.7,
      topP: 0.95,
      timeoutMs: 1000,
      retries: 1,
    });

    expect(manager.list()).toHaveLength(1);
    expect(manager.get(preset.id)?.name).toBe('默认');

    manager.upsert('默认-更新', {
      ...preset.config,
      model: 'gpt-4.1-mini',
    }, preset.id);
    expect(manager.get(preset.id)?.config.model).toBe('gpt-4.1-mini');

    const exported = manager.exportAll();
    const imported = manager.importAll(exported);
    expect(imported).toBe(1);

    expect(manager.remove(preset.id)).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });

  it('无效导入应返回 0', () => {
    const manager = new ApiPresetManager(memoryStorage());
    expect(manager.importAll('{bad')).toBe(0);
    expect(manager.importAll('{}')).toBe(0);
  });
});
