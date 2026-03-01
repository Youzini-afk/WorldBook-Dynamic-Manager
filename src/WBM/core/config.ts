import type { WbmConfig } from './types';

// v3 使用独立命名空间，允许与 v2 配置并存
export const STORAGE_PREFIX = 'WBM3_';

// v3 默认配置
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

// 构造 localStorage 键名
function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

// 读取配置，异常时回退默认值
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

// 保存配置
export function saveConfig(config: WbmConfig): void {
  localStorage.setItem(storageKey('config'), JSON.stringify(config));
}
