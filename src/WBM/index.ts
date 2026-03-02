import { loadConfig } from './core/config';
import type { StorageLike } from './core/config';
import type { WbmStatus } from './core/types';
import { Logger } from './infra/logger';
import { PatchProcessor } from './services/patch/patchProcessor';
import { WorldUpdateParser } from './services/parser/worldUpdateParser';
import { CommandRouter } from './services/router/router';
import { FloorScheduler } from './services/scheduler/scheduler';
import { ExternalAiClient, TavernAiClient } from './services/review/aiClient';
import { PendingQueue } from './services/review/pendingQueue';
import { type ChatMessage, ReviewService } from './services/review/reviewService';
import { TavernWorldbookRepository } from './services/worldbook/repository';
import { SnapshotStore } from './services/worldbook/snapshotStore';
import { TargetBookResolver } from './services/worldbook/targetResolver';
import { DomPanelController } from './ui/panel';

declare const __WBM_VERSION__: string;

declare global {
  interface Window {
    WBM3?: {
      openUI(): void;
      closeUI(): void;
      manualReview(
        bookName: string,
        messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
      ): Promise<void>;
      approveQueue(ids?: string[]): Promise<void>;
      rejectQueue(ids?: string[]): Promise<number>;
      rollback(snapshotId: string): Promise<void>;
      getStatus(): WbmStatus;
    };
    WBM?: Window['WBM3'];
    WorldBookManager?: Window['WBM3'];
  }
}

function getStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function buildLegacyShell(api: NonNullable<Window['WBM3']>, logger: Logger): NonNullable<Window['WBM3']> {
  let warned = false;
  const warn = (): void => {
    if (warned) return;
    warned = true;
    logger.warn(
      'window.WBM 已弃用，请迁移到 window.WBM3（兼容壳将在 v3.1/v3.2 之后移除）',
    );
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
    getStatus: () => {
      warn();
      return api.getStatus();
    },
  };
}

export function bootstrapWbmV3(): void {
  const logger = new Logger('WBM3');
  const config = loadConfig();
  const parser = new WorldUpdateParser(logger);
  const patchProcessor = new PatchProcessor();
  const repository = new TavernWorldbookRepository(logger);
  const queue = new PendingQueue(getStorage());
  const snapshots = new SnapshotStore(getStorage());
  const router = new CommandRouter(repository, patchProcessor, logger, queue, snapshots);
  const targetResolver = new TargetBookResolver(logger);
  const scheduler = new FloorScheduler({
    startAfter: config.startAfter,
    interval: config.interval,
    triggerTiming: config.triggerTiming,
  });
  const aiClient =
    config.mode === 'external' && config.externalEndpoint
      ? new ExternalAiClient(logger, {
          endpoint: config.externalEndpoint,
          apiKey: config.externalApiKey,
          model: config.externalModel,
        })
      : new TavernAiClient(logger);
  const reviewService = new ReviewService(aiClient, parser, logger);
  let targetBookName = config.targetBookName;
  let processing = false;

  const resolveBookName = async (preferred?: string): Promise<string> => {
    if (preferred && preferred.trim()) return preferred.trim();
    const resolved = await targetResolver.resolve(config.targetType, config.targetBookName);
    targetBookName = resolved;
    return resolved;
  };

  const getStatus = (): WbmStatus => ({
    autoEnabled: config.autoEnabled,
    processing,
    approvalMode: config.approvalMode,
    queueSize: queue.size(),
    nextDueFloor: scheduler.getState().nextDueFloor,
    targetBookName,
  });

  const panel = new DomPanelController(logger, getStatus, {
    onManualReview: async () => {
      logger.warn('面板手动审核需要业务侧提供 messages，请使用 window.WBM3.manualReview 调用');
    },
    onApproveAll: async () => {
      await api.approveQueue();
    },
    onRejectAll: async () => {
      await api.rejectQueue();
    },
  });

  const executeReview = async (
    bookName: string,
    messages: ChatMessage[],
    source: 'manual' | 'auto' = 'manual',
  ): Promise<void> => {
    if (!scheduler.lock()) {
      logger.warn('调度器忙碌，跳过本次审核');
      return;
    }
    processing = true;
    panel.refresh();
    try {
      const commands = await reviewService.review(messages);
      const results = await router.execute(commands, bookName, {
        approvalMode: config.approvalMode,
        source,
      });
      logger.info('审核执行完成', results);
    } finally {
      processing = false;
      scheduler.unlock();
      panel.refresh();
    }
  };

  repository.logBackend();
  logger.info(
    `调度器已初始化: nextDue@0=${scheduler.nextDue(0)} version=${typeof __WBM_VERSION__ === 'string' ? __WBM_VERSION__ : 'dev'}`,
  );

  const api: NonNullable<Window['WBM3']> = {
    openUI: () => panel.open(),
    closeUI: () => panel.close(),
    manualReview: async (bookName, messages) => {
      const target = await resolveBookName(bookName);
      await executeReview(target, messages, 'manual');
    },
    approveQueue: async ids => {
      const pendingItems = queue.take(ids);
      for (const pending of pendingItems) {
        await router.execute(pending.commands, pending.bookName, {
          approvalMode: 'auto',
          source: pending.source,
        });
      }
      panel.refresh();
    },
    rejectQueue: async ids => {
      const rejected = queue.reject(ids);
      panel.refresh();
      return rejected;
    },
    rollback: async snapshotId => {
      const snapshot = snapshots.findById(snapshotId);
      if (!snapshot) throw new Error(`未找到快照: ${snapshotId}`);
      await repository.replaceEntries(snapshot.bookName, snapshot.entries);
      logger.info(`已回滚快照: ${snapshotId}`);
    },
    getStatus: () => getStatus(),
  };

  window.WBM3 = api;
  const legacyShell = buildLegacyShell(api, logger);
  window.WBM = legacyShell;
  window.WorldBookManager = legacyShell;

  logger.info('WBM3 已就绪，兼容壳 WBM/WBManager 已挂载');
}

export function unloadWbmV3(): void {
  if (typeof window === 'undefined') return;
  if (window.WBM3) {
    try {
      window.WBM3.closeUI();
    } catch {
      // ignore
    }
    delete window.WBM3;
  }
  delete window.WBM;
  delete window.WorldBookManager;
}
