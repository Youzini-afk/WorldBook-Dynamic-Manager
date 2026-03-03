import type { StorageLike } from './core/config';
import type { WbmLegacyApi, WbmPublicApi } from './core/types';
import { createRuntimeCapabilities } from './infra/runtime';
import { createRuntimeSession, type RuntimeSessionHandle } from './bootstrap/runtimeSession';

declare const __WBM_VERSION__: string;

declare global {
  interface Window {
    WBM3?: WbmPublicApi;
    WBM?: WbmLegacyApi;
    WorldBookManager?: WbmLegacyApi;
  }
}

interface RuntimeGlobal {
  localStorage?: StorageLike;
  window?: Window;
}

let activeSession: RuntimeSessionHandle | null = null;

function getStorage(source: unknown): StorageLike | null {
  const runtime = source as RuntimeGlobal;
  if (runtime.localStorage) return runtime.localStorage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function bootstrapWbmV3(source: unknown = globalThis): void {
  if (activeSession) {
    activeSession.dispose();
    activeSession = null;
  }

  const runtime = createRuntimeCapabilities(source);
  const storage = getStorage(source);
  const version = typeof __WBM_VERSION__ === 'string' ? __WBM_VERSION__ : 'dev';

  activeSession = createRuntimeSession({
    runtime,
    storage,
    version,
  });
}

export function unloadWbmV3(): void {
  if (activeSession) {
    activeSession.dispose();
    activeSession = null;
    return;
  }

  const runtime = globalThis as RuntimeGlobal;
  const w = runtime.window;
  if (!w) return;
  delete w.WBM3;
  delete w.WBM;
  delete w.WorldBookManager;
}

