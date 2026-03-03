import type { EntryDefaults, WbmApiConfig, WbmConfig } from './types';
import { z } from 'zod';

export const STORAGE_PREFIX = 'WBM3_';
export const LEGACY_STORAGE_PREFIX = 'WBM_';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
  key?(index: number): string | null;
  length?: number;
}

export const DEFAULT_CONFIG: WbmConfig = {
  mode: 'external',
  apiSource: 'custom',
  targetType: 'charPrimary',
  targetBookName: '',
  managedFallbackPolicy: 'strict',

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

  confirmUpdate: false,
  maxCreatePerRound: 10,
  contentFilterMode: 'none',
  contentFilterTags: '',
  contextMode: 'full',
  maxContentChars: 0,
  patchDuplicateGuard: true,
  fabEnabled: true,
  syncOnDelete: false,
  snapshotRetention: 50,
  excludeConstantFromPrompt: false,
  directTriggerOnly: false,
  sendUserMessages: true,
  sendAiMessages: true,
  autoVerifyAfterUpdate: true,
  refreshMode: 'full',
  aiRegistryEnabled: true,
  chatIsolationEnabled: false,
  autoBackupBeforeAI: false,
  entryLockEnabled: false,
  tokenEstimateEnabled: false,
  activeApiPreset: '',
  activePromptPreset: '',
};

export const DEFAULT_API_CONFIG: WbmApiConfig = {
  type: 'openai',
  endpoint: '',
  key: '',
  model: 'gpt-4o-mini',
  maxTokens: 4096,
  temperature: 0.7,
  topP: 0.95,
  timeoutMs: 120000,
  retries: 2,
};

export const DEFAULT_ENTRY_DEFAULTS: EntryDefaults = {
  enabled: true,
  constant: false,
  selective: true,
  depth: 4,
  order: 200,
};

const configSchema = z.object({
  mode: z.enum(['inline', 'external']).catch(DEFAULT_CONFIG.mode),
  apiSource: z.enum(['tavern', 'custom']).catch(DEFAULT_CONFIG.apiSource),
  targetType: z.enum(['charPrimary', 'charAdditional', 'global', 'managed']).catch(DEFAULT_CONFIG.targetType),
  targetBookName: z.string().catch(DEFAULT_CONFIG.targetBookName),
  managedFallbackPolicy: z.enum(['strict', 'fallback']).catch(DEFAULT_CONFIG.managedFallbackPolicy),

  externalEndpoint: z.string().catch(DEFAULT_CONFIG.externalEndpoint),
  externalApiKey: z.string().catch(DEFAULT_CONFIG.externalApiKey),
  externalModel: z.string().catch(DEFAULT_CONFIG.externalModel),

  startAfter: z.coerce.number().int().min(0).catch(DEFAULT_CONFIG.startAfter),
  interval: z.coerce.number().int().min(-1).catch(DEFAULT_CONFIG.interval),
  triggerTiming: z.enum(['before', 'after', 'both']).catch(DEFAULT_CONFIG.triggerTiming),

  approvalMode: z.enum(['auto', 'manual', 'selective']).catch(DEFAULT_CONFIG.approvalMode),
  reviewDepth: z.coerce.number().int().min(1).max(200).catch(DEFAULT_CONFIG.reviewDepth),
  autoEnabled: z.coerce.boolean().catch(DEFAULT_CONFIG.autoEnabled),
  confirmDelete: z.coerce.boolean().catch(DEFAULT_CONFIG.confirmDelete),
  logLevel: z.enum(['info', 'warn', 'error']).catch(DEFAULT_CONFIG.logLevel),

  confirmUpdate: z.coerce.boolean().catch(DEFAULT_CONFIG.confirmUpdate),
  maxCreatePerRound: z.coerce.number().int().min(1).max(500).catch(DEFAULT_CONFIG.maxCreatePerRound),
  contentFilterMode: z.enum(['none', 'tags']).catch(DEFAULT_CONFIG.contentFilterMode),
  contentFilterTags: z.string().catch(DEFAULT_CONFIG.contentFilterTags),
  contextMode: z.enum(['full', 'triggered', 'summary']).catch(DEFAULT_CONFIG.contextMode),
  maxContentChars: z.coerce.number().int().min(0).max(200000).catch(DEFAULT_CONFIG.maxContentChars),
  patchDuplicateGuard: z.coerce.boolean().catch(DEFAULT_CONFIG.patchDuplicateGuard),
  fabEnabled: z.coerce.boolean().catch(DEFAULT_CONFIG.fabEnabled),
  syncOnDelete: z.coerce.boolean().catch(DEFAULT_CONFIG.syncOnDelete),
  snapshotRetention: z.coerce.number().int().min(1).max(5000).catch(DEFAULT_CONFIG.snapshotRetention),
  excludeConstantFromPrompt: z.coerce.boolean().catch(DEFAULT_CONFIG.excludeConstantFromPrompt),
  directTriggerOnly: z.coerce.boolean().catch(DEFAULT_CONFIG.directTriggerOnly),
  sendUserMessages: z.coerce.boolean().catch(DEFAULT_CONFIG.sendUserMessages),
  sendAiMessages: z.coerce.boolean().catch(DEFAULT_CONFIG.sendAiMessages),
  autoVerifyAfterUpdate: z.coerce.boolean().catch(DEFAULT_CONFIG.autoVerifyAfterUpdate),
  refreshMode: z.enum(['full', 'minimal']).catch(DEFAULT_CONFIG.refreshMode),
  aiRegistryEnabled: z.coerce.boolean().catch(DEFAULT_CONFIG.aiRegistryEnabled),
  chatIsolationEnabled: z.coerce.boolean().catch(DEFAULT_CONFIG.chatIsolationEnabled),
  autoBackupBeforeAI: z.coerce.boolean().catch(DEFAULT_CONFIG.autoBackupBeforeAI),
  entryLockEnabled: z.coerce.boolean().catch(DEFAULT_CONFIG.entryLockEnabled),
  tokenEstimateEnabled: z.coerce.boolean().catch(DEFAULT_CONFIG.tokenEstimateEnabled),
  activeApiPreset: z.string().catch(DEFAULT_CONFIG.activeApiPreset),
  activePromptPreset: z.string().catch(DEFAULT_CONFIG.activePromptPreset),
});

const apiConfigSchema = z.object({
  type: z.enum(['openai', 'custom', 'gemini']).catch(DEFAULT_API_CONFIG.type),
  endpoint: z.string().catch(DEFAULT_API_CONFIG.endpoint),
  key: z.string().catch(DEFAULT_API_CONFIG.key),
  model: z.string().catch(DEFAULT_API_CONFIG.model),
  maxTokens: z.coerce.number().int().min(16).max(65536).catch(DEFAULT_API_CONFIG.maxTokens),
  temperature: z.coerce.number().min(0).max(2).catch(DEFAULT_API_CONFIG.temperature),
  topP: z.coerce.number().min(0).max(1).catch(DEFAULT_API_CONFIG.topP),
  timeoutMs: z.coerce.number().int().min(1000).max(600000).catch(DEFAULT_API_CONFIG.timeoutMs),
  retries: z.coerce.number().int().min(0).max(10).catch(DEFAULT_API_CONFIG.retries),
});

const entryDefaultsSchema = z.object({
  enabled: z.coerce.boolean().catch(DEFAULT_ENTRY_DEFAULTS.enabled),
  constant: z.coerce.boolean().catch(DEFAULT_ENTRY_DEFAULTS.constant),
  selective: z.coerce.boolean().catch(DEFAULT_ENTRY_DEFAULTS.selective),
  depth: z.coerce.number().int().min(0).max(100).catch(DEFAULT_ENTRY_DEFAULTS.depth),
  order: z.coerce.number().int().min(0).max(10000).catch(DEFAULT_ENTRY_DEFAULTS.order),
});

export function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

export function legacyStorageKey(key: string): string {
  return `${LEGACY_STORAGE_PREFIX}${key}`;
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function safeParseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readRaw(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null;
  return safeParseJson(storage.getItem(key));
}

function writeRaw(storage: StorageLike | null, key: string, value: unknown): void {
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

export function parseConfig(input: unknown): WbmConfig {
  const merged = { ...DEFAULT_CONFIG, ...(input as Partial<WbmConfig>) };
  return configSchema.parse(merged);
}

export function parseApiConfig(input: unknown): WbmApiConfig {
  const merged = { ...DEFAULT_API_CONFIG, ...(input as Partial<WbmApiConfig>) };
  return apiConfigSchema.parse(merged);
}

export function parseEntryDefaults(input: unknown): EntryDefaults {
  const merged = { ...DEFAULT_ENTRY_DEFAULTS, ...(input as Partial<EntryDefaults>) };
  return entryDefaultsSchema.parse(merged);
}

export function loadConfig(storage?: StorageLike): WbmConfig {
  try {
    const storageTarget = getStorage(storage);
    const parsed = readRaw(storageTarget, storageKey('config'));
    return parseConfig(parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: WbmConfig, storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  const normalized = parseConfig(config);
  writeRaw(storageTarget, storageKey('config'), normalized);
}

export function clearConfig(storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  storageTarget?.removeItem?.(storageKey('config'));
}

export function loadApiConfig(storage?: StorageLike): WbmApiConfig {
  try {
    const storageTarget = getStorage(storage);
    const parsed = readRaw(storageTarget, storageKey('api_config'));
    return parseApiConfig(parsed);
  } catch {
    return { ...DEFAULT_API_CONFIG };
  }
}

export function saveApiConfig(config: WbmApiConfig, storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  const normalized = parseApiConfig(config);
  writeRaw(storageTarget, storageKey('api_config'), normalized);
}

export function clearApiConfig(storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  storageTarget?.removeItem?.(storageKey('api_config'));
}

export function loadEntryDefaults(storage?: StorageLike): EntryDefaults {
  try {
    const storageTarget = getStorage(storage);
    const parsed = readRaw(storageTarget, storageKey('entry_defaults'));
    return parseEntryDefaults(parsed);
  } catch {
    return { ...DEFAULT_ENTRY_DEFAULTS };
  }
}

export function saveEntryDefaults(value: EntryDefaults, storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  const normalized = parseEntryDefaults(value);
  writeRaw(storageTarget, storageKey('entry_defaults'), normalized);
}

export function loadJson<T>(key: string, fallback: T, storage?: StorageLike): T {
  const storageTarget = getStorage(storage);
  const parsed = readRaw(storageTarget, storageKey(key));
  if (parsed == null) return fallback;
  return parsed as T;
}

export function saveJson<T>(key: string, value: T, storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  writeRaw(storageTarget, storageKey(key), value);
}

export function clearJson(key: string, storage?: StorageLike): void {
  const storageTarget = getStorage(storage);
  storageTarget?.removeItem?.(storageKey(key));
}
