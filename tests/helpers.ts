import type { LoggerLike } from '../src/WBM/core/types';

export const noopLogger: LoggerLike = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function memoryStorage(seed: Record<string, string> = {}): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  dump(): Record<string, string>;
} {
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
    dump(): Record<string, string> {
      return { ...state };
    },
  };
}
