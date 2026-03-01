import type { WbmConfig } from './types';

export const STORAGE_PREFIX = 'WBM3_';

export const DEFAULT_CONFIG: WbmConfig = {
  mode: 'external',
  apiSource: 'custom',
  targetType: 'charPrimary',
  targetBookName: '',
  startAfter: 3,
  interval: 5,
  triggerTiming: 'after',
  approvalMode: 'auto',
  reviewDepth: 10,
  autoEnabled: true,
};

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

export function loadConfig(): WbmConfig {
  try {
    const raw = localStorage.getItem(storageKey('config'));
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<WbmConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: WbmConfig): void {
  localStorage.setItem(storageKey('config'), JSON.stringify(config));
}
