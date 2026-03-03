import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeReviewApi } from '../src/WBM/infra/runtime/types';
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
    const client = new TavernAiClient(noopLogger, g as RuntimeReviewApi);
    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('<world_update>[]</world_update>');
  });

  it('TavernAiClient 在主 API 不可用时返回空', async () => {
    const client = new TavernAiClient(noopLogger, {} satisfies RuntimeReviewApi);
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
      api: {
        type: 'openai',
        endpoint: 'https://api.example.com/chat',
        key: 'key',
        model: 'model-a',
        maxTokens: 512,
        temperature: 0.7,
        topP: 0.95,
        timeoutMs: 1_000,
        retries: 0,
      },
      fetchFn: g.fetch as typeof fetch,
    });
    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('<world_update>[]</world_update>');
  });

  it('ExternalAiClient 在 endpoint 为空时返回空', async () => {
    const client = new ExternalAiClient(noopLogger, {
      api: {
        type: 'openai',
        endpoint: '',
        key: '',
        model: '',
        maxTokens: 512,
        temperature: 0.7,
        topP: 0.95,
        timeoutMs: 1_000,
        retries: 0,
      },
    });
    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('');
  });

  it('ExternalAiClient 在重试后可成功', async () => {
    const g = globalThis as MutableGlobal;
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'ok' } }],
        }),
      });
    g.fetch = fetch;

    const client = new ExternalAiClient(noopLogger, {
      api: {
        type: 'openai',
        endpoint: 'https://api.example.com/chat',
        key: '',
        model: 'm',
        maxTokens: 128,
        temperature: 0.7,
        topP: 0.95,
        timeoutMs: 1000,
        retries: 1,
      },
      fetchFn: fetch as typeof globalThis.fetch,
    });

    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gemini 类型应解析 candidates 文本', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'gemini ok' }] } }],
      }),
    });

    const client = new ExternalAiClient(noopLogger, {
      api: {
        type: 'gemini',
        endpoint: 'https://gemini.example.com',
        key: '',
        model: 'gemini-1.5',
        maxTokens: 256,
        temperature: 0.5,
        topP: 0.9,
        timeoutMs: 1000,
        retries: 0,
      },
      fetchFn: fetch as typeof globalThis.fetch,
    });

    const output = await client.call([{ role: 'user', content: 'hi' }]);
    expect(output).toBe('gemini ok');
  });
});
