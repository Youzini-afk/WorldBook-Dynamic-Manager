import { afterEach, describe, expect, it, vi } from 'vitest';
import { TavernWorldbookRepository } from '../src/WBM/services/worldbook/repository';
import type { RuntimeWorldbookApi } from '../src/WBM/infra/runtime/types';
import { noopLogger } from './helpers';

type MutableGlobal = typeof globalThis & Record<string, unknown>;

function clearWorldbookApis(): void {
  const g = globalThis as MutableGlobal;
  delete g.getWorldbook;
  delete g.createWorldbookEntries;
  delete g.updateWorldbookWith;
  delete g.deleteWorldbookEntries;
  delete g.getLorebookEntries;
  delete g.setLorebookEntries;
  delete g.createLorebookEntries;
  delete g.deleteLorebookEntries;
}

afterEach(() => {
  clearWorldbookApis();
  vi.restoreAllMocks();
});

describe('TavernWorldbookRepository', () => {
  it('优先使用官方高层 API', async () => {
    const g = globalThis as MutableGlobal;
    const entries = [{ uid: 1, name: 'A' }];
    const getWorldbook = vi.fn().mockResolvedValue(entries);
    const createWorldbookEntries = vi.fn().mockResolvedValue({ worldbook: entries });
    const updateWorldbookWith = vi.fn().mockResolvedValue(entries);
    const deleteWorldbookEntries = vi
      .fn()
      .mockResolvedValue({ worldbook: [], deleted_entries: entries });
    g.getWorldbook = getWorldbook;
    g.createWorldbookEntries = createWorldbookEntries;
    g.updateWorldbookWith = updateWorldbookWith;
    g.deleteWorldbookEntries = deleteWorldbookEntries;

    const repo = new TavernWorldbookRepository(noopLogger, g as RuntimeWorldbookApi);
    const caps = repo.getCapabilities();
    expect(caps.highLevel).toBe(true);
    repo.logBackend();
    await repo.getEntries('book');
    expect(getWorldbook).toHaveBeenCalledWith('book');
    await repo.addEntry('book', { name: 'B' });
    await repo.updateEntry('book', { uid: 1, name: 'A2' });
    await repo.deleteEntry('book', 1);
    await repo.replaceEntries('book', [{ uid: 2, name: 'R' }]);
    expect(createWorldbookEntries).toHaveBeenCalled();
    expect(updateWorldbookWith).toHaveBeenCalled();
    expect(deleteWorldbookEntries).toHaveBeenCalled();
  });

  it('高层不可用时降级到旧接口', async () => {
    const g = globalThis as MutableGlobal;
    const getLorebookEntries = vi.fn().mockResolvedValue([{ uid: 1, name: 'A' }]);
    const createLorebookEntries = vi.fn().mockResolvedValue({});
    const setLorebookEntries = vi.fn().mockResolvedValue({});
    const deleteLorebookEntries = vi.fn().mockResolvedValue({});
    g.getLorebookEntries = getLorebookEntries;
    g.createLorebookEntries = createLorebookEntries;
    g.setLorebookEntries = setLorebookEntries;
    g.deleteLorebookEntries = deleteLorebookEntries;

    const repo = new TavernWorldbookRepository(noopLogger, g as RuntimeWorldbookApi);
    const caps = repo.getCapabilities();
    expect(caps.highLevel).toBe(false);
    expect(caps.legacy).toBe(true);
    repo.logBackend();

    await repo.getEntries('book');
    await repo.addEntry('book', { name: 'x' });
    await repo.updateEntry('book', { uid: 1, name: 'updated' });
    await repo.deleteEntry('book', 1);
    await repo.replaceEntries('book', [{ uid: 2, name: 'replaced' }]);
    expect(getLorebookEntries).toHaveBeenCalled();
    expect(createLorebookEntries).toHaveBeenCalled();
    expect(setLorebookEntries).toHaveBeenCalled();
    expect(deleteLorebookEntries).toHaveBeenCalled();
  });

  it('接口不可用时抛错', async () => {
    const repo = new TavernWorldbookRepository(noopLogger, {} satisfies RuntimeWorldbookApi);
    repo.logBackend();
    await expect(repo.getEntries('book')).rejects.toThrow('API 不可用');
    await expect(repo.addEntry('book', {})).rejects.toThrow('API 不可用');
    await expect(repo.updateEntry('book', { uid: 1 })).rejects.toThrow('API 不可用');
    await expect(repo.deleteEntry('book', 1)).rejects.toThrow('API 不可用');
    await expect(repo.replaceEntries('book', [])).rejects.toThrow('API 不可用');
  });
});
