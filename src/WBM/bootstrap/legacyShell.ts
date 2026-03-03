import type { WbmLegacyApi, WbmPublicApi } from '../core/types';
import type { Logger } from '../infra/logger';

export function buildLegacyShell(api: WbmPublicApi, logger: Logger): WbmLegacyApi {
  let warned = false;
  const warn = (): void => {
    if (warned) return;
    warned = true;
    logger.warn('window.WBM 已弃用，请迁移到 window.WBM3（兼容壳计划在 v3.3 后评估收缩）');
  };

  const handler: ProxyHandler<WbmPublicApi> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          warn();
          return Reflect.apply(value as (...fnArgs: unknown[]) => unknown, target, args);
        };
      }
      warn();
      return value;
    },
  };

  return new Proxy(api, handler) as WbmLegacyApi;
}
