import type { WbmConfig } from './types';
import { z } from 'zod';

// v3 使用独立命名空间，允许与 v2 配置并存
export const STORAGE_PREFIX = 'WBM3_';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const wbmConfigSchema = z.object({
  mode: z.enum(['inline', 'external']),
  apiSource: z.enum(['tavern', 'custom']),
  targetType: z.enum(['charPrimary', 'charAdditional', 'global', 'managed']),
  targetBookName: z.string(),
  externalEndpoint: z.string(),
  externalApiKey: z.string(),
  externalModel: z.string(),
  startAfter: z.number().int().min(0),
  interval: z.number().int().min(-1),
  triggerTiming: z.enum(['before', 'after', 'both']),
  approvalMode: z.enum(['auto', 'manual', 'selective']),
  reviewDepth: z.number().int().min(1).max(100),
  autoEnabled: z.boolean(),
  confirmDelete: z.boolean(),
  logLevel: z.enum(['info', 'warn', 'error']),
});

// v3 默认配置
export const DEFAULT_CONFIG: WbmConfig = {
  mode: 'external',
  apiSource: 'custom',
  targetType: 'charPrimary',
  targetBookName: '',
  externalEndpoint: '',
  externalApiKey: '',
  externalModel: '',
  startAfter: 3,
  interval: 5,
  triggerTiming: 'after',
  approvalMode: 'auto',
  reviewDepth: 10,
  autoEnabled: true,
  confirmDelete: true,
  logLevel: 'info',
};

// 构造 localStorage 键名
export function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function parseConfig(input: unknown): WbmConfig {
  const merged = { ...DEFAULT_CONFIG, ...(input as Partial<WbmConfig>) };
  return wbmConfigSchema.parse(merged);
}

// 读取配置，异常时回退默认值
export function loadConfig(storage?: StorageLike): WbmConfig {
  try {
    const storageTarget = getStorage(storage);
    if (!storageTarget) return { ...DEFAULT_CONFIG };
    const raw = storageTarget.getItem(storageKey('config'));
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as unknown;
    return parseConfig(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// 保存配置
export function saveConfig(config: WbmConfig, storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  if (!storageTarget) return;
  const normalized = parseConfig(config);
  storageTarget.setItem(storageKey('config'), JSON.stringify(normalized));
}

export function clearConfig(storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  storageTarget?.removeItem?.(storageKey('config'));
}
