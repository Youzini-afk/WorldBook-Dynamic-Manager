import { loadConfig, parseConfig, saveConfig } from '../core/config';
import type { StorageLike } from '../core/config';
import type { WbmLegacyApi, WbmPublicApi, WbmStatus } from '../core/types';
import { EventSubscriptions } from '../infra/events';
import { type LogRecord, Logger } from '../infra/logger';
import { detectRuntimeHealth, getRuntimeEventName, type RuntimeCapabilities } from '../infra/runtime';
import { WorldUpdateParser } from '../services/parser/worldUpdateParser';
import { PatchProcessor } from '../services/patch/patchProcessor';
import { ExternalAiClient, TavernAiClient } from '../services/review/aiClient';
import { collectRecentChatMessages } from '../services/review/messageCollector';
import { PendingQueue } from '../services/review/pendingQueue';
import { type ChatMessage, ReviewService } from '../services/review/reviewService';
import { CommandRouter } from '../services/router/router';
import { FloorScheduler } from '../services/scheduler/scheduler';
import { TavernWorldbookRepository } from '../services/worldbook/repository';
import { SnapshotStore } from '../services/worldbook/snapshotStore';
import { TargetBookResolver } from '../services/worldbook/targetResolver';
import { MagicWandLauncher } from '../ui/launcher';
import { VuePanelController } from '../ui/panel';
import type { PanelBridge } from '../ui/panel';
import { buildLegacyShell } from './legacyShell';

interface RuntimeSessionOptions {
  runtime: RuntimeCapabilities;
  storage: StorageLike | null;
  version: string;
}

function toMessageId(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function createScheduler(config: {
  startAfter: number;
  interval: number;
  triggerTiming: 'before' | 'after' | 'both';
}): FloorScheduler {
  return new FloorScheduler({
    startAfter: config.startAfter,
    interval: config.interval,
    triggerTiming: config.triggerTiming,
  });
}

export interface RuntimeSessionHandle {
  api: WbmPublicApi;
  legacyShell: WbmLegacyApi;
  dispose(): void;
}

export function createRuntimeSession(options: RuntimeSessionOptions): RuntimeSessionHandle {
  const { runtime, storage, version } = options;
  const config = loadConfig(storage ?? undefined);
  const logs: LogRecord[] = [];
  const logger = new Logger('WBM3', config.logLevel, record => {
    logs.push(record);
    if (logs.length > 600) logs.splice(0, logs.length - 600);
  });

  logger.setLevel(config.logLevel);

  const runtimeHealth = detectRuntimeHealth(runtime);
  const parser = new WorldUpdateParser(logger);
  const patchProcessor = new PatchProcessor();
  const repository = new TavernWorldbookRepository(logger, runtime.worldbook);
  const repositoryCaps = repository.getCapabilities();
  const queue = new PendingQueue(storage);
  const snapshots = new SnapshotStore(storage);
  const router = new CommandRouter(repository, patchProcessor, logger, queue, snapshots);
  const targetResolver = new TargetBookResolver(logger, runtime.worldbook);
  const events = new EventSubscriptions(runtime.events.source, logger, runtime.events.eventOn);
  let scheduler = createScheduler(config);
  let aiClient =
    config.mode === 'external' && config.externalEndpoint
      ? new ExternalAiClient(logger, {
          endpoint: config.externalEndpoint,
          apiKey: config.externalApiKey,
          model: config.externalModel,
          fetchFn: runtime.review.fetchFn,
        })
      : new TavernAiClient(logger, runtime.review);
  let reviewService = new ReviewService(aiClient, parser, logger);

  let targetBookName = config.targetBookName;
  let processing = false;
  let lastObservedFloor = 0;
  let activeChatId = '';
  let launcher: MagicWandLauncher | null = null;
  let panel: VuePanelController;
  let api: WbmPublicApi;

  const getStatus = (): WbmStatus => ({
    autoEnabled: config.autoEnabled,
    processing,
    approvalMode: config.approvalMode,
    queueSize: queue.size(),
    nextDueFloor: scheduler.getState().nextDueFloor,
    targetBookName,
    backendAvailable: repositoryCaps.highLevel || repositoryCaps.legacy,
    eventSourceAvailable: runtimeHealth.eventSourceAvailable,
    mountAvailable: runtimeHealth.mountAvailable,
  });

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
            fetchFn: runtime.review.fetchFn,
          })
        : new TavernAiClient(logger, runtime.review);
    reviewService = new ReviewService(aiClient, parser, logger);
  };

  const resolveBookName = async (preferred?: string): Promise<string> => {
    if (preferred && preferred.trim()) return preferred.trim();
    const resolved = await targetResolver.resolve(config.targetType, config.targetBookName);
    targetBookName = resolved;
    return resolved;
  };

  const collectMessages = (): ChatMessage[] => collectRecentChatMessages(config.reviewDepth, runtime.chat);

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

  panel = new VuePanelController(logger, panelBridge, open => {
    launcher?.setActive(open);
  });

  launcher = new MagicWandLauncher(logger, {
    label: '动态世界书',
    onToggle: open => {
      if (open) {
        panel.open();
        return;
      }
      panel.close();
    },
  });
  launcher.init();

  repository.logBackend();
  logger.info(`调度器已初始化: nextDue@0=${scheduler.nextDue(0)} version=${version || 'dev'}`);

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

  const eventMessageReceived = getRuntimeEventName(runtime, 'MESSAGE_RECEIVED', 'message_received');
  const eventMessageSent = getRuntimeEventName(runtime, 'MESSAGE_SENT', 'message_sent');
  const eventMessageDeleted = getRuntimeEventName(runtime, 'MESSAGE_DELETED', 'message_deleted');
  const eventChatChanged = getRuntimeEventName(runtime, 'CHAT_CHANGED', 'chat_id_changed');

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

  const legacyShell = buildLegacyShell(api, logger);
  const hostWindow = runtime.ui.windowRef;
  if (hostWindow) {
    hostWindow.WBM3 = api;
    hostWindow.WBM = legacyShell;
    hostWindow.WorldBookManager = legacyShell;
    logger.info('动态世界书 v3 已就绪，兼容壳 WBM/WorldBookManager 已挂载');
  } else {
    logger.warn('window 不可用，已跳过全局 API 挂载');
    logger.info('动态世界书 v3 已就绪（未挂载全局 API）');
  }

  return {
    api,
    legacyShell,
    dispose: () => {
      events.clear();
      panel.destroy();
      launcher?.destroy();
      launcher = null;
      const w = runtime.ui.windowRef;
      if (w) {
        delete w.WBM3;
        delete w.WBM;
        delete w.WorldBookManager;
      }
    },
  };
}
