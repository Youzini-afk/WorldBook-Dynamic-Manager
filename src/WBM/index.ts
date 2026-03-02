import { loadConfig, parseConfig, saveConfig } from './core/config';
import type { StorageLike } from './core/config';
import type { WbmConfig, WbmPublicApi, WbmStatus } from './core/types';
import { EventSubscriptions } from './infra/events';
import { type LogRecord, Logger } from './infra/logger';
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
import { VuePanelController } from './ui/panel';
import type { PanelBridge } from './ui/panel';

declare const __WBM_VERSION__: string;

interface WbmLegacyApi extends WbmPublicApi {
  approveAll(ids?: string[]): Promise<void>;
  approveOne(id: string): Promise<void>;
  rejectAll(ids?: string[]): Promise<number>;
  rejectOne(id: string): Promise<number>;
  getPendingQueue(): ReturnType<WbmPublicApi['listQueue']>;
  getSnapshots(bookName?: string): ReturnType<WbmPublicApi['listSnapshots']>;
}

declare global {
  interface Window {
    WBM3?: WbmPublicApi;
    WBM?: WbmLegacyApi;
    WorldBookManager?: WbmLegacyApi;
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

function createScheduler(config: WbmConfig): FloorScheduler {
  return new FloorScheduler({
    startAfter: config.startAfter,
    interval: config.interval,
    triggerTiming: config.triggerTiming,
  });
}

function buildLegacyShell(api: WbmPublicApi, logger: Logger): WbmLegacyApi {
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

export function bootstrapWbmV3(): void {
  if (activeDisposer) {
    activeDisposer();
    activeDisposer = null;
  }

  const storage = getStorage();
  const config = loadConfig(storage ?? undefined);
  const logs: LogRecord[] = [];
  const logger = new Logger('WBM3', config.logLevel, record => {
    logs.push(record);
    if (logs.length > 600) logs.splice(0, logs.length - 600);
  });

  logger.setLevel(config.logLevel);
  const parser = new WorldUpdateParser(logger);
  const patchProcessor = new PatchProcessor();
  const repository = new TavernWorldbookRepository(logger);
  const queue = new PendingQueue(storage);
  const snapshots = new SnapshotStore(storage);
  const router = new CommandRouter(repository, patchProcessor, logger, queue, snapshots);
  const targetResolver = new TargetBookResolver(logger);
  const events = new EventSubscriptions(null, logger);
  let scheduler = createScheduler(config);
  let aiClient =
    config.mode === 'external' && config.externalEndpoint
      ? new ExternalAiClient(logger, {
          endpoint: config.externalEndpoint,
          apiKey: config.externalApiKey,
          model: config.externalModel,
        })
      : new TavernAiClient(logger);
  let reviewService = new ReviewService(aiClient, parser, logger);

  let targetBookName = config.targetBookName;
  let processing = false;
  let lastObservedFloor = 0;
  let activeChatId = '';
  let panel: VuePanelController;
  let api: WbmPublicApi;

  const rebuildScheduler = (currentFloor: number): void => {
    scheduler = createScheduler(config);
    scheduler.reset(currentFloor);
  };

  const rebuildReviewService = (): void => {
    aiClient =
      config.mode === 'external' && config.externalEndpoint
        ? new ExternalAiClient(logger, {
            endpoint: config.externalEndpoint,
            apiKey: config.externalApiKey,
            model: config.externalModel,
          })
        : new TavernAiClient(logger);
    reviewService = new ReviewService(aiClient, parser, logger);
  };

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
    floor?: number,
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
      const worldbookEntries = await repository.getEntries(bookName).catch(error => {
        logger.warn(`读取世界书失败，使用空上下文: ${bookName}`, error);
        return [];
      });
      const commands = await reviewService.review(messages, {
        bookName,
        source,
        reviewDepth: config.reviewDepth,
        worldbookEntries,
      });
      const results = await router.execute(commands, bookName, {
        approvalMode: config.approvalMode,
        source,
        floor,
        chatId: activeChatId || undefined,
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
      await executeReview(target, messages, 'auto', floor);
      lastObservedFloor = floor;
      scheduler.markProcessed(floor);
      panel.refresh();
    } catch (error) {
      logger.error(`自动审核失败: timing=${timing} floor=${floor}`, error);
    }
  };

  const panelBridge: PanelBridge = {
    getStatus: () => getStatus(),
    getConfig: () => ({ ...config }),
    saveConfig: async next => {
      const normalized = parseConfig(next);
      Object.assign(config, normalized);
      saveConfig(config, storage ?? undefined);
      logger.setLevel(config.logLevel);
      rebuildScheduler(lastObservedFloor);
      rebuildReviewService();
      panel.refresh();
    },
    listEntries: async () => {
      const target = await resolveBookName();
      return await repository.getEntries(target);
    },
    createEntry: async fields => {
      const target = await resolveBookName();
      await repository.addEntry(target, fields);
      panel.refresh();
    },
    updateEntry: async entry => {
      const target = await resolveBookName();
      await repository.updateEntry(target, entry);
      panel.refresh();
    },
    deleteEntry: async uid => {
      const target = await resolveBookName();
      await repository.deleteEntry(target, uid);
      panel.refresh();
    },
    manualReview: async () => {
      await api.manualReview();
    },
    approveAll: async () => {
      await api.approveQueue();
    },
    rejectAll: async () => {
      await api.rejectQueue();
    },
    listQueue: () => queue.list(),
    listSnapshots: bookName => snapshots.list(bookName),
    rollback: async snapshotId => {
      await api.rollback(snapshotId);
    },
    rollbackFloor: async (floor, chatId) => {
      await api.rollbackFloor(floor, chatId);
    },
    getLogs: () => [...logs],
    clearLogs: () => {
      logs.splice(0, logs.length);
    },
  };

  panel = new VuePanelController(logger, panelBridge);

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
          floor: pending.floor,
          chatId: pending.chatId,
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
      panel.refresh();
    },
    rollbackFloor: async (floor, chatId) => {
      const snapshot = snapshots.findLatestByFloor(floor, chatId);
      if (!snapshot) throw new Error(`未找到楼层快照: floor=${floor}${chatId ? ` chatId=${chatId}` : ''}`);
      await repository.replaceEntries(snapshot.bookName, snapshot.entries);
      logger.info(`已按楼层回滚: floor=${floor} snapshot=${snapshot.id}`);
      panel.refresh();
    },
    listQueue: () => queue.list(),
    listSnapshots: bookName => snapshots.list(bookName),
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

  logger.info('WBM3 已就绪，兼容壳 WBM/WorldBookManager 已挂载');
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

