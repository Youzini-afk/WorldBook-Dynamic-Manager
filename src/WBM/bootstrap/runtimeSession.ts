import {
  loadApiConfig,
  loadConfig,
  parseConfig,
  saveApiConfig,
  saveConfig,
  type StorageLike,
} from '../core/config';
import type {
  BackendChatRecord,
  BookSyncResult,
  IsolationInfo,
  KeywordScanResult,
  PatchOp,
  RouterResult,
  WbmApiConfig,
  WbmLegacyApi,
  WbmPublicApi,
  WbmStatus,
  WorldUpdateCommand,
  WorldbookEntryLike,
} from '../core/types';
import { EventSubscriptions } from '../infra/events';
import { type LogRecord, Logger } from '../infra/logger';
import { detectRuntimeHealth, getRuntimeEventName, type RuntimeCapabilities } from '../infra/runtime';
import { migrateLegacyWbm } from '../services/migration/legacyWbmMigration';
import { WorldUpdateParser } from '../services/parser/worldUpdateParser';
import { PatchProcessor } from '../services/patch/patchProcessor';
import { ExternalAiClient, TavernAiClient } from '../services/review/aiClient';
import { ApiPresetManager } from '../services/review/apiPresetManager';
import { ContextScanner } from '../services/review/contextScanner';
import { collectRecentChatMessages } from '../services/review/messageCollector';
import { PendingQueue } from '../services/review/pendingQueue';
import { PromptEntryManager } from '../services/review/promptEntryManager';
import { PromptPresetManager } from '../services/review/promptPresetManager';
import { type ChatMessage, ReviewService } from '../services/review/reviewService';
import { CommandRouter } from '../services/router/router';
import { FloorScheduler } from '../services/scheduler/scheduler';
import { AiRegistry } from '../services/worldbook/aiRegistry';
import { BackupManager } from '../services/worldbook/backupManager';
import { BookSyncService } from '../services/worldbook/bookSync';
import { ChatIsolation } from '../services/worldbook/chatIsolation';
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

function compactText(text: string, maxLength = 280): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function findEntryByName(entries: WorldbookEntryLike[], entryName: string): WorldbookEntryLike | null {
  const needle = entryName.trim().toLowerCase();
  for (const entry of entries) {
    const name = String(entry.name ?? entry.comment ?? '').trim().toLowerCase();
    if (name === needle) return entry;
  }
  return null;
}

const FULL_ENTRY_TEMPLATE: WorldbookEntryLike = {
  name: '',
  comment: '',
  content: '',
  keys: '',
  secondary_keys: '',
  enabled: true,
  constant: false,
  selective: true,
  selectiveLogic: 0,
  depth: 4,
  order: 200,
  position: 4,
  role: 0,
  scanDepth: null,
  caseSensitive: null,
  matchWholeWords: null,
  useGroupScoring: null,
  automationId: '',
  probability: 100,
  useProbability: true,
  group: '',
  groupOverride: false,
  groupWeight: 100,
  sticky: null,
  cooldown: null,
  delay: null,
  prevent_recursion: false,
  delay_until_recursion: false,
  displayIndex: null,
  excludeRecursion: false,
  vectorized: false,
};

export interface RuntimeSessionHandle {
  api: WbmPublicApi;
  legacyShell: WbmLegacyApi;
  dispose(): void;
}

export function createRuntimeSession(options: RuntimeSessionOptions): RuntimeSessionHandle {
  const { runtime, storage, version } = options;

  const preLogger = new Logger('WBM3', 'info');
  migrateLegacyWbm(storage, preLogger);

  const config = loadConfig(storage ?? undefined);
  const apiConfig = loadApiConfig(storage ?? undefined);

  if (config.externalEndpoint && !apiConfig.endpoint) apiConfig.endpoint = config.externalEndpoint;
  if (config.externalApiKey && !apiConfig.key) apiConfig.key = config.externalApiKey;
  if (config.externalModel && !apiConfig.model) apiConfig.model = config.externalModel;

  const logs: LogRecord[] = [];
  const logger = new Logger('WBM3', config.logLevel, record => {
    logs.push(record);
    if (logs.length > 800) logs.splice(0, logs.length - 800);
  });

  logger.setLevel(config.logLevel);

  const runtimeHealth = detectRuntimeHealth(runtime);
  const parser = new WorldUpdateParser(logger);
  const patchProcessor = new PatchProcessor();
  const repository = new TavernWorldbookRepository(logger, runtime.worldbook);
  const repositoryCaps = repository.getCapabilities();
  const queue = new PendingQueue(storage);
  const snapshots = new SnapshotStore(storage, config.snapshotRetention);
  const router = new CommandRouter(repository, patchProcessor, logger, queue, snapshots);
  const targetResolver = new TargetBookResolver(logger, runtime.worldbook);
  const events = new EventSubscriptions(runtime.events.source, logger, runtime.events.eventOn);
  const contextScanner = new ContextScanner();
  const promptEntryManager = new PromptEntryManager(storage);
  const apiPresetManager = new ApiPresetManager(storage);
  const promptPresetManager = new PromptPresetManager(storage);
  const aiRegistry = new AiRegistry(storage);
  const isolation = new ChatIsolation(storage);
  const backupManager = new BackupManager(storage, config.snapshotRetention);
  const bookSync = new BookSyncService(repository, logger);

  let scheduler = createScheduler(config);
  let aiClient =
    config.mode === 'external' && (config.externalEndpoint || apiConfig.endpoint)
      ? new ExternalAiClient(logger, {
          api: buildExternalApiConfig(config, apiConfig),
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

  const backendChats: BackendChatRecord[] = [];

  function pushBackendRecord(record: BackendChatRecord): void {
    backendChats.push(record);
    if (backendChats.length > 120) {
      backendChats.splice(0, backendChats.length - 120);
    }
  }

  function buildExternalApiConfig(currentConfig: typeof config, currentApiConfig: WbmApiConfig): WbmApiConfig {
    return {
      ...currentApiConfig,
      endpoint: currentConfig.externalEndpoint || currentApiConfig.endpoint,
      key: currentConfig.externalApiKey || currentApiConfig.key,
      model: currentConfig.externalModel || currentApiConfig.model,
    };
  }

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
    lastAiFloor: lastObservedFloor,
    nextUpdateAiFloor: scheduler.getState().nextDueFloor,
    pendingCount: queue.count(),
    depsState: {
      highLevelWorldbook: runtimeHealth.highLevelWorldbook,
      legacyWorldbook: runtimeHealth.legacyWorldbook,
    },
    contextSource: config.contextMode,
  });

  const rebuildScheduler = (currentFloor: number): void => {
    scheduler = createScheduler(config);
    scheduler.reset(currentFloor);
  };

  const rebuildReviewService = (): void => {
    aiClient =
      config.mode === 'external' && (config.externalEndpoint || apiConfig.endpoint)
        ? new ExternalAiClient(logger, {
            api: buildExternalApiConfig(config, apiConfig),
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

    let promptPreview = '';
    let replyPreview = '';
    let commandCount = 0;
    try {
      const worldbookEntries = await repository.getEntries(bookName).catch(error => {
        logger.warn(`读取世界书失败，使用空上下文: ${bookName}`, error);
        return [];
      });

      if (config.autoBackupBeforeAI) {
        backupManager.create(bookName, worldbookEntries, `pre-review:${source}`, floor, activeChatId || undefined);
      }

      const trace = await reviewService.reviewWithTrace(messages, {
        bookName,
        source,
        reviewDepth: config.reviewDepth,
        worldbookEntries,
        contextMode: config.contextMode,
        contentFilterMode: config.contentFilterMode,
        contentFilterTags: config.contentFilterTags,
        maxContentChars: config.maxContentChars,
        excludeConstantFromPrompt: config.excludeConstantFromPrompt,
        sendUserMessages: config.sendUserMessages,
        sendAiMessages: config.sendAiMessages,
        scanText: contextScanner.buildScanText(messages, config.reviewDepth),
      });

      promptPreview = compactText(trace.prompts.map(item => `${item.role}:${item.content}`).join('\n'));
      replyPreview = compactText(trace.reply);
      commandCount = trace.commands.length;

      const results = await router.execute(trace.commands, bookName, {
        approvalMode: config.approvalMode,
        source,
        floor,
        chatId: activeChatId || undefined,
        confirmUpdate: config.confirmUpdate,
        maxCreatePerRound: config.maxCreatePerRound,
      });

      if (config.aiRegistryEnabled) {
        for (const result of results) {
          if (result.status !== 'ok') continue;
          if (result.action !== 'create' && result.action !== 'update' && result.action !== 'patch') continue;
          aiRegistry.mark(bookName, result.entry_name, source);
        }
      }

      if (config.chatIsolationEnabled && activeChatId) {
        for (const result of results) {
          if (result.status !== 'ok') continue;
          isolation.record(bookName, result.entry_name);
        }
      }

      if (config.autoVerifyAfterUpdate) {
        const verify = await bookSync.verify(bookName, results);
        if (!verify.ok) {
          logger.warn(`自动验证发现问题: ${verify.issueCount}`);
        }
      }

      logger.info('审核执行完成', results);
      pushBackendRecord({
        id: `backend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        source,
        bookName,
        promptPreview,
        outputPreview: replyPreview,
        commandCount,
        success: !results.some(item => item.status === 'error'),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      pushBackendRecord({
        id: `backend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        source,
        bookName,
        promptPreview,
        outputPreview: replyPreview,
        commandCount,
        success: false,
        error: reason,
      });
      throw error;
    } finally {
      processing = false;
      scheduler.unlock();
      panel.refresh();
    }
  };

  const runAutoReview = async (timing: 'before' | 'after', floor: number): Promise<void> => {
    if (!config.autoEnabled) return;
    if (config.directTriggerOnly) return;
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

      // 保持 external 字段与 api 配置的兼容同步
      apiConfig.endpoint = config.externalEndpoint || apiConfig.endpoint;
      apiConfig.key = config.externalApiKey || apiConfig.key;
      apiConfig.model = config.externalModel || apiConfig.model;
      saveApiConfig(apiConfig, storage ?? undefined);

      logger.setLevel(config.logLevel);
      rebuildScheduler(lastObservedFloor);
      rebuildReviewService();
      snapshots.setRetention(config.snapshotRetention);
      backupManager.setRetention(config.snapshotRetention);
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

  const getEntries = async (bookName?: string): Promise<WorldbookEntryLike[]> => {
    const target = await resolveBookName(bookName);
    return await repository.getEntries(target);
  };

  const addEntry = async (bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void> => {
    await repository.addEntry(bookName, fields);
    panel.refresh();
  };

  const updateEntry = async (bookName: string, entry: WorldbookEntryLike): Promise<void> => {
    await repository.updateEntry(bookName, entry);
    panel.refresh();
  };

  const deleteEntry = async (bookName: string, uid: number | string): Promise<void> => {
    await repository.deleteEntry(bookName, uid);
    panel.refresh();
  };

  const patchEntry = async (
    bookName: string,
    entryName: string,
    ops: PatchOp[],
  ): Promise<{ applied: number; skipped: number; errors: string[] }> => {
    const entries = await repository.getEntries(bookName);
    const target = findEntryByName(entries, entryName);
    if (!target) throw new Error(`未找到条目: ${entryName}`);
    const next = { ...target };
    const result = patchProcessor.apply(next, ops);
    if (result.applied > 0) {
      await repository.updateEntry(bookName, next);
      panel.refresh();
    }
    return result;
  };

  const executeCommands = async (commands: WorldUpdateCommand[], bookName: string): Promise<RouterResult[]> => {
    const results = await router.execute(commands, bookName, {
      approvalMode: config.approvalMode,
      source: 'manual',
      floor: lastObservedFloor,
      chatId: activeChatId || undefined,
      confirmUpdate: config.confirmUpdate,
      maxCreatePerRound: config.maxCreatePerRound,
    });
    panel.refresh();
    return results;
  };

  const buildFullContext = async (bookName?: string): Promise<string> => {
    const target = await resolveBookName(bookName);
    const entries = await repository.getEntries(target);
    return await reviewService.promptBuilder.buildFullContext(target, entries);
  };

  const buildSummary = async (bookName?: string): Promise<string> => {
    const target = await resolveBookName(bookName);
    const entries = await repository.getEntries(target);
    return await reviewService.promptBuilder.buildSummary(target, entries);
  };

  const buildTriggeredContext = async (bookName?: string, depth?: number): Promise<string> => {
    const target = await resolveBookName(bookName);
    const entries = await repository.getEntries(target);
    const scanText = contextScanner.buildScanText(collectMessages(), depth ?? config.reviewDepth);
    return await reviewService.promptBuilder.buildTriggeredContext(target, entries, scanText);
  };

  const scanKeywords = async (bookName?: string, depth?: number): Promise<KeywordScanResult> => {
    const target = await resolveBookName(bookName);
    const entries = await repository.getEntries(target);
    const scanText = contextScanner.buildScanText(collectMessages(), depth ?? config.reviewDepth);
    return contextScanner.scan(entries, scanText);
  };

  const verifyBook = async (bookName?: string, results?: RouterResult[]): Promise<BookSyncResult> => {
    const target = await resolveBookName(bookName);
    return await bookSync.verify(target, results);
  };

  const repairBook = async (
    bookName?: string,
    verifyResult?: BookSyncResult,
    commands?: WorldUpdateCommand[],
  ): Promise<BookSyncResult> => {
    const target = await resolveBookName(bookName);
    return await bookSync.repair(target, verifyResult, commands, executeCommands);
  };

  const getIsolationInfo = (): IsolationInfo => isolation.getCurrentInfo(targetBookName || undefined);

  api = {
    version,
    FULL_ENTRY_TEMPLATE,
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
          confirmUpdate: config.confirmUpdate,
          maxCreatePerRound: config.maxCreatePerRound,
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

    getEntries,
    addEntry,
    updateEntry,
    deleteEntry,
    patchEntry,

    parseCommands: text => parser.parse(text),
    executeCommands,

    buildFullContext,
    buildSummary,
    buildTriggeredContext,
    scanKeywords,

    verifyBook,
    repairBook,

    getPendingQueue: () => queue.getPending(),
    getPendingCount: () => queue.count(),
    approveAll: async ids => await api.approveQueue(ids),
    approveOne: async id => await api.approveQueue([id]),
    rejectAll: async ids => await api.rejectQueue(ids),
    rejectOne: async id => await api.rejectQueue([id]),
    getSnapshots: bookName => snapshots.list(bookName),
    cleanupQueue: () => queue.cleanup(),
    clearQueue: () => queue.clearAll(),

    getIsolationInfo,
    getIsolationStats: (bookName?: string) => isolation.getStats(bookName),
    clearMyIsolation: (bookName?: string) => isolation.clearMine(bookName),
    clearAllIsolation: (bookName?: string) => isolation.clearAll(bookName),
    promoteIsolationToGlobal: async (_bookName?: string) => {
      // v3 中该操作只返回候选列表并清理隔离映射，不自动写入条目。
      const promoted = isolation.promoteToGlobal(_bookName);
      logger.info(`隔离条目已标记晋升: ${promoted.length}`);
    },
  };

  const eventMessageReceived = getRuntimeEventName(runtime, 'MESSAGE_RECEIVED', 'message_received');
  const eventMessageSent = getRuntimeEventName(runtime, 'MESSAGE_SENT', 'message_sent');
  const eventMessageDeleted = getRuntimeEventName(runtime, 'MESSAGE_DELETED', 'message_deleted');
  const eventChatChanged = getRuntimeEventName(runtime, 'CHAT_CHANGED', 'chat_id_changed');
  const eventCharacterPageLoaded = getRuntimeEventName(
    runtime,
    'CHARACTER_PAGE_LOADED',
    'character_page_loaded',
  );
  const eventCharacterEdited = getRuntimeEventName(runtime, 'CHARACTER_EDITED', 'character_edited');
  const eventCharacterFirstMessageSelected = getRuntimeEventName(
    runtime,
    'CHARACTER_FIRST_MESSAGE_SELECTED',
    'character_first_message_selected',
  );

  const resetRuntimeState = (reason: string): void => {
    targetBookName = config.targetBookName;
    scheduler.reset(0);
    lastObservedFloor = 0;
    logger.info(reason);
    panel.refresh();
  };

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

    if (config.syncOnDelete) {
      void api
        .rollbackFloor(floor, activeChatId || undefined)
        .then(() => {
          logger.info(`删除消息后已回滚到 floor=${floor}`);
        })
        .catch(error => {
          logger.warn(`删除消息回滚失败 floor=${floor}`, error);
        });
    }

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
    isolation.setCurrentChat(activeChatId);
    resetRuntimeState(`聊天切换，已重置运行时状态: ${activeChatId || '(unknown)'}`);
  });
  events.on(eventCharacterPageLoaded, () => {
    resetRuntimeState('角色页面已加载，已重置目标世界书与调度状态');
  });
  events.on(eventCharacterEdited, () => {
    resetRuntimeState('角色卡已更新，已重置目标世界书与调度状态');
  });
  events.on(eventCharacterFirstMessageSelected, () => {
    resetRuntimeState('角色首条消息已切换，已重置目标世界书与调度状态');
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

  // 防止 tree-shaking 误删：这些管理器通过 API 间接使用，启动时记录可见性。
  logger.info(
    `管理器已加载: prompts=${promptEntryManager.list().length} apiPresets=${apiPresetManager.list().length} promptPresets=${promptPresetManager.list().length}`,
  );

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
