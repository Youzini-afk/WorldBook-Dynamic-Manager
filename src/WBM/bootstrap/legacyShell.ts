import type { WbmLegacyApi, WbmPublicApi } from '../core/types';
import type { Logger } from '../infra/logger';

export function buildLegacyShell(api: WbmPublicApi, logger: Logger): WbmLegacyApi {
  let warned = false;
  const warn = (): void => {
    if (warned) return;
    warned = true;
    logger.warn('window.WBM 已弃用，请迁移到 window.WBM3（兼容壳计划在 v3.2 后移除）');
  };

  return {
    openUI: () => {
      warn();
      api.openUI();
    },
    closeUI: () => {
      warn();
      api.closeUI();
    },
    manualReview: async (bookName, messages) => {
      warn();
      return await api.manualReview(bookName, messages);
    },
    approveQueue: async ids => {
      warn();
      await api.approveQueue(ids);
    },
    rejectQueue: async ids => {
      warn();
      return await api.rejectQueue(ids);
    },
    rollback: async snapshotId => {
      warn();
      await api.rollback(snapshotId);
    },
    rollbackFloor: async (floor, chatId) => {
      warn();
      await api.rollbackFloor(floor, chatId);
    },
    listQueue: () => {
      warn();
      return api.listQueue();
    },
    listSnapshots: bookName => {
      warn();
      return api.listSnapshots(bookName);
    },
    getStatus: () => {
      warn();
      return api.getStatus();
    },
    approveAll: async ids => {
      warn();
      await api.approveQueue(ids);
    },
    approveOne: async id => {
      warn();
      await api.approveQueue([id]);
    },
    rejectAll: async ids => {
      warn();
      return await api.rejectQueue(ids);
    },
    rejectOne: async id => {
      warn();
      return await api.rejectQueue([id]);
    },
    getPendingQueue: () => {
      warn();
      return api.listQueue();
    },
    getSnapshots: bookName => {
      warn();
      return api.listSnapshots(bookName);
    },
  };
}
