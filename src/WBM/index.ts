import { loadConfig } from './core/config';
import type { StorageLike } from './core/config';
import type { WbmStatus } from './core/types';
import { EventSubscriptions } from './infra/events';
import { Logger } from './infra/logger';
import { PatchProcessor } from './services/patch/patchProcessor';
import { WorldUpdateParser } from './services/parser/worldUpdateParser';
import { CommandRouter } from './services/router/router';
import { FloorScheduler } from './services/scheduler/scheduler';
import { ExternalAiClient, TavernAiClient } from './services/review/aiClient';
import { collectRecentChatMessages } from './services/review/messageCollector';
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
        bookName?: string,
        messages?: { role: 'system' | 'user' | 'assistant'; content: string }[],
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

interface RuntimeEventApi {
  tavern_events?: {
    MESSAGE_RECEIVED?: string;
    MESSAGE_SENT?: string;
    MESSAGE_DELETED?: string;
    CHAT_CHANGED?: string;
  };
}

let activeDisposer: (() => void) | null = null;

function runtimeEventApi(): RuntimeEventApi {
  return globalThis as RuntimeEventApi;
}

function getStorage(): StorageLike | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function toMessageId(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function getEventName(key: keyof NonNullable<RuntimeEventApi['tavern_events']>, fallback: string): string {
  return runtimeEventApi().tavern_events?.[key] ?? fallback;
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
  if (activeDisposer) {
    activeDisposer();
    activeDisposer = null;
  }

  const logger = new Logger('WBM3');
  const config = loadConfig();
  const parser = new WorldUpdateParser(logger);
  const patchProcessor = new PatchProcessor();
  const repository = new TavernWorldbookRepository(logger);
  const queue = new PendingQueue(getStorage());
  const snapshots = new SnapshotStore(getStorage());
  const router = new CommandRouter(repository, patchProcessor, logger, queue, snapshots);
  const targetResolver = new TargetBookResolver(logger);
  const events = new EventSubscriptions(null, logger);
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
  let lastObservedFloor = 0;
  let activeChatId = '';
  let api: NonNullable<Window['WBM3']>;

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

  const collectMessages = (): ChatMessage[] => collectRecentChatMessages(config.reviewDepth);

  const executeReview = async (
    bookName: string,
    messages: ChatMessage[],
    source: 'manual' | 'auto' = 'manual',
  ): Promise<void> => {
    if (messages.length === 0) {
      logger.warn('无可用聊天消息，跳过审核');
      return;
    }
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

  const runAutoReview = async (timing: 'before' | 'after', floor: number): Promise<void> => {
    if (!config.autoEnabled) return;
    if (!scheduler.shouldTrigger(timing, floor)) return;

    try {
      const target = await resolveBookName();
      const messages = collectMessages();
      await executeReview(target, messages, 'auto');
      lastObservedFloor = floor;
      scheduler.markProcessed(floor);
      panel.refresh();
    } catch (error) {
      logger.error(`自动审核失败: timing=${timing} floor=${floor}`, error);
    }
  };

  const panel = new DomPanelController(logger, getStatus, {
    onManualReview: async () => {
      await api.manualReview();
    },
    onApproveAll: async () => {
      await api.approveQueue();
    },
    onRejectAll: async () => {
      await api.rejectQueue();
    },
  });

  repository.logBackend();
  logger.info(
    `调度器已初始化: nextDue@0=${scheduler.nextDue(0)} version=${typeof __WBM_VERSION__ === 'string' ? __WBM_VERSION__ : 'dev'}`,
  );

  api = {
    openUI: () => panel.open(),
    closeUI: () => panel.close(),
    manualReview: async (bookName, messages) => {
      const target = await resolveBookName(bookName);
      const reviewMessages = messages && messages.length > 0 ? messages : collectMessages();
      await executeReview(target, reviewMessages, 'manual');
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

  const eventMessageReceived = getEventName('MESSAGE_RECEIVED', 'message_received');
  const eventMessageSent = getEventName('MESSAGE_SENT', 'message_sent');
  const eventMessageDeleted = getEventName('MESSAGE_DELETED', 'message_deleted');
  const eventChatChanged = getEventName('CHAT_CHANGED', 'chat_id_changed');

  events.on(eventMessageReceived, (...args) => {
    const floor = toMessageId(args[0]);
    if (floor == null) return;
    void runAutoReview('after', floor);
  });
  events.on(eventMessageSent, (...args) => {
    const floor = toMessageId(args[0]);
    if (floor == null) return;
    void runAutoReview('before', floor);
  });
  events.on(eventMessageDeleted, (...args) => {
    const floor = toMessageId(args[0]);
    if (floor == null) return;
    if (lastObservedFloor >= floor) {
      const resetFloor = Math.max(0, floor - 1);
      scheduler.reset(resetFloor);
      lastObservedFloor = resetFloor;
      logger.info(`消息删除后重置调度状态: floor=${resetFloor}`);
      panel.refresh();
    }
  });
  events.on(eventChatChanged, (...args) => {
    activeChatId = String(args[0] ?? '');
    targetBookName = config.targetBookName;
    scheduler.reset(0);
    lastObservedFloor = 0;
    logger.info(`聊天切换，已重置运行时状态: ${activeChatId || '(unknown)'}`);
    panel.refresh();
  });

  window.WBM3 = api;
  const legacyShell = buildLegacyShell(api, logger);
  window.WBM = legacyShell;
  window.WorldBookManager = legacyShell;

  activeDisposer = () => {
    events.clear();
    panel.destroy();
    if (typeof window !== 'undefined') {
      delete window.WBM3;
      delete window.WBM;
      delete window.WorldBookManager;
    }
  };

  logger.info('WBM3 已就绪，兼容壳 WBM/WBManager 已挂载');
}

export function unloadWbmV3(): void {
  if (activeDisposer) {
    activeDisposer();
    activeDisposer = null;
    return;
  }
  if (typeof window === 'undefined') return;
  delete window.WBM3;
  delete window.WBM;
  delete window.WorldBookManager;
}
