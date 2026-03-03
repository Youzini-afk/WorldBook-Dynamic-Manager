import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPT_ENTRIES, PromptEntryManager } from '../src/WBM/services/review/promptEntryManager';
import { memoryStorage } from './helpers';

describe('PromptEntryManager', () => {
  it('空存储时应写入默认提示词', () => {
    const manager = new PromptEntryManager(memoryStorage());
    expect(manager.list().length).toBe(DEFAULT_PROMPT_ENTRIES.length);
  });

  it('应支持 upsert/remove/reset', () => {
    const manager = new PromptEntryManager(memoryStorage());
    const created = manager.upsert({
      name: '自定义',
      role: 'user',
      content: 'x',
      order: 999,
      enabled: true,
    });

    expect(manager.list().some(item => item.id === created.id)).toBe(true);

    manager.upsert({
      id: created.id,
      name: '自定义2',
      role: 'assistant',
      content: 'y',
      order: 1000,
      enabled: false,
    });
    expect(manager.list().find(item => item.id === created.id)?.name).toBe('自定义2');

    expect(manager.remove(created.id)).toBe(true);
    expect(manager.list().find(item => item.id === created.id)).toBeUndefined();

    manager.resetToDefault();
    expect(manager.list().length).toBe(DEFAULT_PROMPT_ENTRIES.length);
  });
});
