import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_CONFIG,
  DEFAULT_CONFIG,
  clearApiConfig,
  clearConfig,
  loadApiConfig,
  loadConfig,
  loadEntryDefaults,
  loadJson,
  parseApiConfig,
  parseEntryDefaults,
  parseConfig,
  saveApiConfig,
  saveConfig,
  saveEntryDefaults,
  saveJson,
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

  it('schema 非法值会回退到默认值', () => {
    const parsed = parseConfig({
      ...DEFAULT_CONFIG,
      approvalMode: 'bad-value',
    });
    expect(parsed.approvalMode).toBe(DEFAULT_CONFIG.approvalMode);
  });

  it('clearConfig 会清空配置', () => {
    const storage = memoryStorage();
    saveConfig(DEFAULT_CONFIG, storage);
    clearConfig(storage);
    expect(loadConfig(storage)).toEqual(DEFAULT_CONFIG);
  });

  it('API 配置读写与清理可用', () => {
    const storage = memoryStorage();
    saveApiConfig(
      {
        ...DEFAULT_API_CONFIG,
        endpoint: 'https://api.example.com',
        retries: 3,
      },
      storage,
    );
    expect(loadApiConfig(storage).retries).toBe(3);
    clearApiConfig(storage);
    expect(loadApiConfig(storage)).toEqual(DEFAULT_API_CONFIG);
  });

  it('entry defaults 与 loadJson/saveJson 可用', () => {
    const storage = memoryStorage();
    saveEntryDefaults(
      {
        enabled: false,
        constant: true,
        selective: false,
        depth: 7,
        order: 888,
      },
      storage,
    );
    expect(loadEntryDefaults(storage).depth).toBe(7);

    saveJson('x', { a: 1 }, storage);
    expect(loadJson('x', { a: 0 }, storage)).toEqual({ a: 1 });
  });

  it('parseApiConfig/parseEntryDefaults 非法值回退默认', () => {
    const api = parseApiConfig({ retries: 999, type: 'invalid' });
    expect(api.type).toBe(DEFAULT_API_CONFIG.type);
    expect(api.retries).toBe(DEFAULT_API_CONFIG.retries);

    const defaults = parseEntryDefaults({ depth: -9, order: '100' });
    expect(defaults.depth).toBeGreaterThanOrEqual(0);
    expect(defaults.order).toBe(100);
  });
});
