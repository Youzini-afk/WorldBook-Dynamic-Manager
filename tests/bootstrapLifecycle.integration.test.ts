import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapWbmV3, unloadWbmV3 } from '../src/WBM/index';
import { memoryStorage } from './helpers';

interface RuntimeGlobal {
  window?: RuntimeGlobal;
  localStorage?: ReturnType<typeof memoryStorage>;
  WBM3?: unknown;
  WBM?: unknown;
  WorldBookManager?: unknown;
}

const runtime = globalThis as unknown as RuntimeGlobal;

describe('bootstrap lifecycle', () => {
  afterEach(() => {
    unloadWbmV3();
    delete runtime.WBM3;
    delete runtime.WBM;
    delete runtime.WorldBookManager;
    delete runtime.window;
    delete runtime.localStorage;
  });

  it('重复 bootstrap 不应抛错，且应维持 API 挂载', () => {
    runtime.window = runtime;
    runtime.localStorage = memoryStorage();

    expect(() => bootstrapWbmV3()).not.toThrow();
    const firstApi = runtime.WBM3;
    expect(firstApi).toBeDefined();

    expect(() => bootstrapWbmV3()).not.toThrow();
    const secondApi = runtime.WBM3;
    expect(secondApi).toBeDefined();
  });

  it('重复 unload 不应抛错', () => {
    runtime.window = runtime;
    runtime.localStorage = memoryStorage();
    bootstrapWbmV3();

    expect(() => unloadWbmV3()).not.toThrow();
    expect(() => unloadWbmV3()).not.toThrow();
  });
});
