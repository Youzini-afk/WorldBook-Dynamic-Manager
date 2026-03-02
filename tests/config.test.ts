import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  clearConfig,
  loadConfig,
  parseConfig,
  saveConfig,
  storageKey,
} from '../src/WBM/core/config';
import { memoryStorage } from './helpers';

describe('config', () => {
  it('在空存储时返回默认配置', () => {
    const config = loadConfig(memoryStorage());
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('保存后可正确读回', () => {
    const storage = memoryStorage();
    saveConfig(
      {
        ...DEFAULT_CONFIG,
        targetType: 'managed',
        targetBookName: 'chat_wb',
        externalEndpoint: 'https://api.example.com/v1/chat/completions',
      },
      storage,
    );
    const loaded = loadConfig(storage);
    expect(loaded.targetType).toBe('managed');
    expect(loaded.targetBookName).toBe('chat_wb');
    expect(loaded.externalEndpoint).toContain('example.com');
  });

  it('无效字段会回退默认值', () => {
    const storage = memoryStorage({
      [storageKey('config')]: JSON.stringify({
        ...DEFAULT_CONFIG,
        interval: -99,
      }),
    });
    const loaded = loadConfig(storage);
    expect(loaded.interval).toBe(DEFAULT_CONFIG.interval);
  });

  it('schema 非法值会抛错', () => {
    expect(() =>
      parseConfig({
        ...DEFAULT_CONFIG,
        approvalMode: 'bad-value',
      }),
    ).toThrow();
  });

  it('clearConfig 会清空配置', () => {
    const storage = memoryStorage();
    saveConfig(DEFAULT_CONFIG, storage);
    clearConfig(storage);
    expect(loadConfig(storage)).toEqual(DEFAULT_CONFIG);
  });
});
