import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalAiClient, TavernAiClient } from '../src/WBM/services/review/aiClient';
import { noopLogger } from './helpers';

type MutableGlobal = typeof globalThis & Record<string, unknown>;

afterEach(() => {
  const g = globalThis as MutableGlobal;
  Reflect.deleteProperty(g, 'generateRaw');
  Reflect.deleteProperty(g, 'fetch');
  vi.restoreAllMocks();
});

describe('AiClient', () => {
  it('TavernAiClient 在主 API 可用时返回文本', async () => {
    const g = globalThis as MutableGlobal;
    g.generateRaw = vi.fn().mockResolvedValue('  <world_update>[]</world_update>  ');
    const client = new TavernAiClient(noopLogger);
    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('<world_update>[]</world_update>');
  });

  it('TavernAiClient 在主 API 不可用时返回空', async () => {
    const client = new TavernAiClient(noopLogger);
    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('');
  });

  it('ExternalAiClient 可解析标准响应', async () => {
    const g = globalThis as MutableGlobal;
    g.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '<world_update>[]</world_update>' } }],
      }),
    });
    const client = new ExternalAiClient(noopLogger, {
      endpoint: 'https://api.example.com/chat',
      apiKey: 'key',
      model: 'model-a',
      timeoutMs: 1_000,
    });
    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('<world_update>[]</world_update>');
  });

  it('ExternalAiClient 在 endpoint 为空时返回空', async () => {
    const client = new ExternalAiClient(noopLogger, {
      endpoint: '',
    });
    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('');
  });
});
