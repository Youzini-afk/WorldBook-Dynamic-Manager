import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  legacyStorageKey,
  storageKey,
  type StorageLike,
} from '../src/WBM/core/config';
import { migrateLegacyWbm } from '../src/WBM/services/migration/legacyWbmMigration';
import { memoryStorage, noopLogger } from './helpers';

function enumerableStorage(seed: Record<string, string> = {}): StorageLike {
  const state = { ...seed };
  return {
    getItem(key: string): string | null {
      return key in state ? state[key] : null;
    },
    setItem(key: string, value: string): void {
      state[key] = value;
    },
    removeItem(key: string): void {
      delete state[key];
    },
    key(index: number): string | null {
      const keys = Object.keys(state);
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    get length(): number {
      return Object.keys(state).length;
    },
  };
}

describe('legacyWbmMigration', () => {
  it('storage 不可用时应跳过', () => {
    const report = migrateLegacyWbm(null, noopLogger);
    expect(report.skipped).toBe(true);
  });

  it('应迁移旧版关键配置到 WBM3 命名空间', () => {
    const storage = memoryStorage({
      [legacyStorageKey('config')]: JSON.stringify({ ...DEFAULT_CONFIG, reviewDepth: 99 }),
      [legacyStorageKey('api')]: JSON.stringify({ endpoint: 'https://api.example.com', type: 'openai' }),
      [legacyStorageKey('pendingQueue')]: JSON.stringify([{ id: 'q1', commands: [] }]),
    });

    const report = migrateLegacyWbm(storage, noopLogger);

    expect(report.migrated).toBe(true);
    expect(storage.getItem(storageKey('migration_from_wbm_v1_done'))).toBe('true');
    expect(storage.getItem(storageKey('config'))).toContain('"reviewDepth":99');
    expect(storage.getItem(storageKey('api_config'))).toContain('https://api.example.com');
    expect(storage.getItem(storageKey('pending_queue'))).toContain('q1');
  });

  it('标记存在时应跳过迁移', () => {
    const storage = memoryStorage({
      [storageKey('migration_from_wbm_v1_done')]: 'true',
      [legacyStorageKey('config')]: JSON.stringify({ ...DEFAULT_CONFIG, reviewDepth: 66 }),
    });

    const report = migrateLegacyWbm(storage, noopLogger);
    expect(report.skipped).toBe(true);
    expect(storage.getItem(storageKey('config'))).toBeNull();
  });

  it('应迁移前缀型键 aiRegistry/locked', () => {
    const storage = enumerableStorage({
      [legacyStorageKey('aiRegistry_bookA')]: JSON.stringify([{ entryName: 'A' }]),
      [legacyStorageKey('locked_bookA')]: JSON.stringify(['A']),
    });

    const report = migrateLegacyWbm(storage, noopLogger);

    expect(report.migrated).toBe(true);
    expect(storage.getItem(storageKey('ai_registry_bookA'))).toContain('entryName');
    expect(storage.getItem(storageKey('locked_bookA'))).toContain('A');
  });
});
