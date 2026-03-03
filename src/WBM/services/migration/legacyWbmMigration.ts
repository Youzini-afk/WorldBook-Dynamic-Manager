import {
  legacyStorageKey,
  parseApiConfig,
  parseConfig,
  parseEntryDefaults,
  storageKey,
  type StorageLike,
} from '../../core/config';
import type { LoggerLike } from '../../core/types';

const MIGRATION_MARK_KEY = storageKey('migration_from_wbm_v1_done');

interface KeyPair {
  legacy: string;
  current: string;
}

const DIRECT_KEY_MAP: KeyPair[] = [
  { legacy: legacyStorageKey('config'), current: storageKey('config') },
  { legacy: legacyStorageKey('api'), current: storageKey('api_config') },
  { legacy: legacyStorageKey('entryDefaults'), current: storageKey('entry_defaults') },
  { legacy: legacyStorageKey('promptEntries'), current: storageKey('prompt_entries') },
  { legacy: legacyStorageKey('log'), current: storageKey('log_records') },
  { legacy: legacyStorageKey('apiPresets'), current: storageKey('api_presets') },
  { legacy: legacyStorageKey('promptPresets'), current: storageKey('prompt_presets') },
  { legacy: legacyStorageKey('pendingQueue'), current: storageKey('pending_queue') },
  { legacy: legacyStorageKey('snapshots'), current: storageKey('snapshots') },
  { legacy: legacyStorageKey('isolationMap'), current: storageKey('isolation_map') },
  { legacy: legacyStorageKey('backupIndex'), current: storageKey('backup_index') },
];

export interface LegacyMigrationReport {
  migrated: boolean;
  migratedKeys: string[];
  skipped: boolean;
  reason?: string;
}

function listStorageKeys(storage: StorageLike): string[] {
  if (typeof storage.length !== 'number' || typeof storage.key !== 'function') return [];
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    keys.push(key);
  }
  return keys;
}

function readJson(storage: StorageLike, key: string): unknown {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

function migrateMappedKey(storage: StorageLike, pair: KeyPair, logger?: LoggerLike): boolean {
  const existing = storage.getItem(pair.current);
  if (existing != null) return false;

  const sourceValue = readJson(storage, pair.legacy);
  if (sourceValue == null) return false;

  try {
    if (pair.current === storageKey('config')) {
      writeJson(storage, pair.current, parseConfig(sourceValue));
      return true;
    }
    if (pair.current === storageKey('api_config')) {
      writeJson(storage, pair.current, parseApiConfig(sourceValue));
      return true;
    }
    if (pair.current === storageKey('entry_defaults')) {
      writeJson(storage, pair.current, parseEntryDefaults(sourceValue));
      return true;
    }
    writeJson(storage, pair.current, sourceValue);
    return true;
  } catch (error) {
    logger?.warn(`迁移键失败: ${pair.legacy} -> ${pair.current}`, error);
    return false;
  }
}

function migratePrefixKeys(storage: StorageLike, logger?: LoggerLike): string[] {
  const migrated: string[] = [];
  const keys = listStorageKeys(storage);
  for (const key of keys) {
    if (key.startsWith(legacyStorageKey('aiRegistry_'))) {
      const suffix = key.slice(legacyStorageKey('aiRegistry_').length);
      const target = storageKey(`ai_registry_${suffix}`);
      if (storage.getItem(target) != null) continue;
      const value = storage.getItem(key);
      if (value == null) continue;
      storage.setItem(target, value);
      migrated.push(target);
      continue;
    }

    if (key.startsWith(legacyStorageKey('locked_'))) {
      const suffix = key.slice(legacyStorageKey('locked_').length);
      const target = storageKey(`locked_${suffix}`);
      if (storage.getItem(target) != null) continue;
      const value = storage.getItem(key);
      if (value == null) continue;
      storage.setItem(target, value);
      migrated.push(target);
    }
  }

  if (migrated.length > 0) {
    logger?.info(`迁移前缀键完成: ${migrated.length}`);
  }
  return migrated;
}

export function migrateLegacyWbm(storage: StorageLike | null, logger?: LoggerLike): LegacyMigrationReport {
  if (!storage) {
    return { migrated: false, migratedKeys: [], skipped: true, reason: 'storage unavailable' };
  }

  if (storage.getItem(MIGRATION_MARK_KEY) === 'true') {
    return { migrated: false, migratedKeys: [], skipped: true, reason: 'already migrated' };
  }

  const migratedKeys: string[] = [];
  for (const pair of DIRECT_KEY_MAP) {
    if (migrateMappedKey(storage, pair, logger)) {
      migratedKeys.push(pair.current);
    }
  }

  migratedKeys.push(...migratePrefixKeys(storage, logger));

  storage.setItem(MIGRATION_MARK_KEY, 'true');

  if (migratedKeys.length > 0) {
    logger?.info(`已完成旧版配置迁移，共 ${migratedKeys.length} 项`);
    return { migrated: true, migratedKeys, skipped: false };
  }

  return { migrated: false, migratedKeys: [], skipped: true, reason: 'no legacy keys' };
}
