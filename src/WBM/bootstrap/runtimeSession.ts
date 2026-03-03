import {
  loadApiConfig,
  loadConfig,
  parseConfig,
  saveApiConfig,
  saveConfig,
  type StorageLike,
} from '../core/config';
import type {
  ActivationLogRecord,
  BackendChatRecord,
  BookSyncResult,
  ImportConflictPolicy,
  IsolationInfo,
  KeywordScanResult,
  PatchOp,
  RouterResult,
  TargetType,
  WbmApiConfig,
  WbmLegacyApi,
  WbmPublicApi,
  WbmStatus,
  WorldbookImportResult,
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
import { EntryLockStore } from '../services/worldbook/entryLockStore';
import { GlobalPresetManager } from '../services/worldbook/globalPresetManager';
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

function findEntryByUid(entries: WorldbookEntryLike[], uid: number | string): WorldbookEntryLike | null {
  const needle = String(uid);
  for (const entry of entries) {
    const currentUid = entry.uid ?? entry.id;
    if (currentUid == null) continue;
    if (String(currentUid) === needle) return entry;
  }
  return null;
}

function getEntryDisplayName(entry: WorldbookEntryLike): string {
  return String(entry.name ?? entry.comment ?? '').trim();
}

function normalizeEntryName(input: string): string {
  return input.trim().toLowerCase();
}

function normalizeWorldbookNames(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const dedup = new Set<string>();
  const normalized: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const name = item.trim();
    if (!name || dedup.has(name)) continue;
    dedup.add(name);
    normalized.push(name);
  }
  return normalized;
}

function cloneEntryList(entries: WorldbookEntryLike[]): WorldbookEntryLike[] {
  return entries.map(entry => ({ ...entry }));
}

function parseImportedEntries(payload: unknown): Partial<WorldbookEntryLike>[] {
  const source = (() => {
    if (typeof payload === 'string') {
      return JSON.parse(payload) as unknown;
    }
    return payload;
  })();

  if (Array.isArray(source)) {
    return source.filter(item => item && typeof item === 'object') as Partial<WorldbookEntryLike>[];
  }
  if (source && typeof source === 'object') {
    const record = source as Record<string, unknown>;
    if (Array.isArray(record.entries)) {
      return record.entries.filter(item => item && typeof item === 'object') as Partial<WorldbookEntryLike>[];
    }
    if (Array.isArray(record.worldbook)) {
      return record.worldbook.filter(item => item && typeof item === 'object') as Partial<WorldbookEntryLike>[];
    }
  }
  throw new Error('导入内容必须是世界书条目数组，或包含 entries/worldbook 的对象');
}

function ensureImportName(entry: Partial<WorldbookEntryLike>, index: number): string {
  const raw = String(entry.name ?? entry.comment ?? '').trim();
  return raw.length > 0 ? raw : `导入条目-${index + 1}`;
}

function makeUniqueName(baseName: string, existing: Set<string>): string {
  const normalized = normalizeEntryName(baseName);
  if (!existing.has(normalized)) {
    existing.add(normalized);
    return baseName;
  }
  for (let i = 2; i <= 9999; i++) {
    const next = `${baseName} (${i})`;
    const nextNormalized = normalizeEntryName(next);
    if (existing.has(nextNormalized)) continue;
    existing.add(nextNormalized);
    return next;
  }
  throw new Error(`无法为导入条目分配唯一名称: ${baseName}`);
}

function createActivationPreview(value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return compactText(text, 120);
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
  const globalPresetManager = new GlobalPresetManager(storage);
  const aiRegistry = new AiRegistry(storage);
  const entryLocks = new EntryLockStore(storage);
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
  let resolvedBy = 'startup';
  let fallbackUsed = false;
  let lastResolveError = '';
  let processing = false;
  let lastObservedFloor = 0;
  let activeChatId = '';
  let launcher: MagicWandLauncher | null = null;
  let panel: VuePanelController;
  let api: WbmPublicApi;

  const backendChats: BackendChatRecord[] = [];
  const activationLogs: ActivationLogRecord[] = [];

  function pushBackendRecord(record: BackendChatRecord): void {
    backendChats.push(record);
    if (backendChats.length > 120) {
      backendChats.splice(0, backendChats.length - 120);
    }
  }

  function pushActivationLog(record: ActivationLogRecord): void {
    activationLogs.push(record);
    if (activationLogs.length > 400) {
      activationLogs.splice(0, activationLogs.length - 400);
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

  const refreshPanel = (reason: 'interactive' | 'background' = 'interactive'): void => {
    if (config.refreshMode === 'minimal' && reason === 'background') return;
    panel.refresh();
  };

  const mountLauncher = (): void => {
    if (launcher || config.fabEnabled === false) return;
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
  };

  const unmountLauncher = (): void => {
    launcher?.destroy();
    launcher = null;
  };

  const syncLauncherState = (): void => {
    if (config.fabEnabled === false) {
      unmountLauncher();
      return;
    }
    mountLauncher();
  };

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
    resolvedBy,
    fallbackUsed,
    lastResolveError: lastResolveError || undefined,
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
    if (preferred && preferred.trim()) {
      const preferredName = preferred.trim();
      targetBookName = preferredName;
      resolvedBy = 'manual_preferred';
      fallbackUsed = false;
      lastResolveError = '';
      return preferredName;
    }
    try {
      const resolved = await targetResolver.resolveDetailed(
        config.targetType,
        config.targetBookName,
        config.managedFallbackPolicy,
      );
      targetBookName = resolved.bookName;
      resolvedBy = resolved.resolvedBy;
      fallbackUsed = resolved.fallbackUsed;
      lastResolveError = '';
      return resolved.bookName;
    } catch (error) {
      resolvedBy = 'resolve_error';
      fallbackUsed = false;
      lastResolveError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };

  const collectMessages = (): ChatMessage[] => collectRecentChatMessages(config.reviewDepth, runtime.chat);

  const listWorldbookNames = async (targetType?: TargetType): Promise<string[]> => {
    const type = targetType ?? config.targetType;
    const dedup = new Set<string>();
    const pushName = (value: unknown): void => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed) return;
      dedup.add(trimmed);
    };
    const pushList = (value: unknown): void => {
      if (!Array.isArray(value)) return;
      for (const item of value) pushName(item);
    };

    if (type === 'charPrimary' || type === 'charAdditional') {
      if (typeof runtime.worldbook.getCharWorldbookNames === 'function') {
        let bindings: { primary?: unknown; additional?: unknown } | null = null;
        try {
          bindings = runtime.worldbook.getCharWorldbookNames('current');
        } catch (error) {
          logger.warn('读取角色绑定世界书失败', error);
        }
        pushName(bindings?.primary);
        pushList(bindings?.additional);
      }
      if (type === 'charPrimary') {
        return Array.from(dedup).slice(0, 1);
      }
      return Array.from(dedup);
    }

    if (type === 'global') {
      if (typeof runtime.worldbook.getGlobalWorldbookNames === 'function') {
        pushList(runtime.worldbook.getGlobalWorldbookNames());
      } else if (typeof runtime.worldbook.getWorldbookNames === 'function') {
        pushList(runtime.worldbook.getWorldbookNames());
      }
      return Array.from(dedup);
    }

    if (type === 'managed') {
      if (typeof runtime.worldbook.getChatWorldbookName === 'function') {
        try {
          pushName(runtime.worldbook.getChatWorldbookName('current'));
        } catch (error) {
          logger.warn('读取聊天托管世界书失败', error);
        }
      }
      if (config.managedFallbackPolicy === 'fallback' && typeof runtime.worldbook.getCharWorldbookNames === 'function') {
        try {
          const bindings = runtime.worldbook.getCharWorldbookNames('current');
          pushName(bindings?.primary);
          pushList(bindings?.additional);
        } catch (error) {
          logger.warn('读取托管回退候选世界书失败', error);
        }
      }
      return Array.from(dedup);
    }

    if (typeof runtime.worldbook.getWorldbookNames === 'function') {
      pushList(runtime.worldbook.getWorldbookNames());
    }
    return Array.from(dedup);
  };

  const getGlobalWorldbooks = (): string[] => {
    if (typeof runtime.worldbook.getGlobalWorldbookNames !== 'function') return [];
    try {
      return normalizeWorldbookNames(runtime.worldbook.getGlobalWorldbookNames());
    } catch (error) {
      logger.warn('读取全局世界书失败', error);
      return [];
    }
  };

  const setGlobalWorldbooks = async (names: string[]): Promise<string[]> => {
    if (typeof runtime.worldbook.rebindGlobalWorldbooks !== 'function') {
      throw new Error('宿主不支持全局世界书绑定写入接口');
    }

    const normalized = normalizeWorldbookNames(names);
    let next = normalized;

    if (typeof runtime.worldbook.getWorldbookNames === 'function') {
      try {
        const available = new Set(normalizeWorldbookNames(runtime.worldbook.getWorldbookNames()));
        next = normalized.filter(name => available.has(name));
        const dropped = normalized.length - next.length;
        if (dropped > 0) {
          logger.warn(`全局世界书写入时已忽略不存在的书: ${dropped} 本`);
        }
      } catch (error) {
        logger.warn('读取可用世界书列表失败，已跳过存在性校验', error);
      }
    }

    await runtime.worldbook.rebindGlobalWorldbooks(next);
    logger.info(`已更新全局世界书绑定: ${next.length} 本`);
    refreshPanel();
    return getGlobalWorldbooks();
  };

  const listGlobalPresets = () => globalPresetManager.list();

  const saveCurrentGlobalPreset = (name: string) => {
    const current = getGlobalWorldbooks();
    const byName = globalPresetManager.findByName(name);
    return globalPresetManager.upsert(name, current, byName?.id);
  };

  const applyGlobalPreset = async (id: string): Promise<string[]> => {
    const preset = globalPresetManager.get(id);
    if (!preset) throw new Error(`未找到全局预设: ${id}`);
    const applied = await setGlobalWorldbooks(preset.worldbooks);
    return applied;
  };

  const deleteGlobalPreset = (id: string): boolean => globalPresetManager.remove(id);

  const exportGlobalPresets = (): string => globalPresetManager.exportAll();

  const importGlobalPresets = (payload: string): number => {
    const imported = globalPresetManager.importAll(payload);
    if (imported > 0) {
      logger.info(`全局预设导入完成: ${imported} 条`);
      refreshPanel();
    }
    return imported;
  };

  const exportApiPresets = (): string => apiPresetManager.exportAll();

  const importApiPresets = (payload: string): number => {
    const imported = apiPresetManager.importAll(payload);
    if (imported > 0) {
      logger.info(`API 预设导入完成: ${imported} 条`);
      refreshPanel();
    }
    return imported;
  };

  const exportPromptPresets = (): string => promptPresetManager.exportAll();

  const importPromptPresets = (payload: string): number => {
    const imported = promptPresetManager.importAll(payload);
    if (imported > 0) {
      logger.info(`提示词预设导入完成: ${imported} 条`);
      refreshPanel();
    }
    return imported;
  };

  const exportWorldbook = async (bookName?: string): Promise<string> => {
    const target = await resolveBookName(bookName);
    const entries = await repository.getEntries(target);
    return JSON.stringify(
      {
        name: target,
        exportedAt: new Date().toISOString(),
        total: entries.length,
        entries,
      },
      null,
      2,
    );
  };

  const importWorldbookRaw = async (
    bookName: string,
    payload: unknown,
    strategy: ImportConflictPolicy = 'overwrite',
  ): Promise<WorldbookImportResult> => {
    const target = String(bookName ?? '').trim();
    if (!target) throw new Error('导入目标世界书名不能为空');

    const incoming = parseImportedEntries(payload).map((entry, index) => ({
      ...entry,
      name: ensureImportName(entry, index),
    }));

    const existing = await repository.getEntries(target).catch(() => [] as WorldbookEntryLike[]);
    const existingByName = new Set(existing.map(item => normalizeEntryName(getEntryDisplayName(item))));

    let imported = 0;
    let skipped = 0;
    let renamed = 0;
    let nextEntries: WorldbookEntryLike[] = [];

    if (strategy === 'overwrite') {
      nextEntries = incoming.map(item => ({ ...item })) as WorldbookEntryLike[];
      imported = incoming.length;
    } else if (strategy === 'skip_duplicate') {
      nextEntries = cloneEntryList(existing);
      for (const item of incoming) {
        const entryName = ensureImportName(item, imported + skipped);
        const normalized = normalizeEntryName(entryName);
        if (existingByName.has(normalized)) {
          skipped++;
          continue;
        }
        existingByName.add(normalized);
        nextEntries.push({ ...item, name: entryName });
        imported++;
      }
    } else {
      nextEntries = cloneEntryList(existing);
      for (const item of incoming) {
        const baseName = ensureImportName(item, imported + skipped + renamed);
        const normalized = normalizeEntryName(baseName);
        if (!existingByName.has(normalized)) {
          existingByName.add(normalized);
          nextEntries.push({ ...item, name: baseName });
          imported++;
          continue;
        }
        const uniqueName = makeUniqueName(baseName, existingByName);
        nextEntries.push({ ...item, name: uniqueName });
        imported++;
        renamed++;
      }
    }

    await repository.replaceEntries(target, nextEntries);
    logger.info(`世界书导入完成: ${target} strategy=${strategy} imported=${imported} skipped=${skipped} renamed=${renamed}`);
    refreshPanel();
    return {
      bookName: target,
      strategy,
      imported,
      skipped,
      renamed,
    };
  };

  const listLockedEntries = (bookName: string): string[] => entryLocks.list(bookName);

  const isLockedEntry = (bookName: string, entryName: string): boolean => {
    if (!config.entryLockEnabled) return false;
    return entryLocks.has(bookName, entryName);
  };

  const splitLockedCommands = (
    commands: WorldUpdateCommand[],
    bookName: string,
  ): { executable: WorldUpdateCommand[]; lockedResults: RouterResult[] } => {
    const executable: WorldUpdateCommand[] = [];
    const lockedResults: RouterResult[] = [];
    for (const command of commands) {
      if (
        (command.action === 'update' || command.action === 'patch' || command.action === 'delete') &&
        isLockedEntry(bookName, command.entry_name)
      ) {
        lockedResults.push({
          action: command.action,
          entry_name: command.entry_name,
          status: 'skipped',
          code: 'ROUTER_ENTRY_LOCKED',
          reason: '条目已锁定，跳过写入',
        });
        continue;
      }
      executable.push(command);
    }
    return { executable, lockedResults };
  };

  const executeCommandsWithLockGuard = async (
    commands: WorldUpdateCommand[],
    bookName: string,
    options: {
      approvalMode: 'auto' | 'manual' | 'selective';
      source: 'manual' | 'auto' | 'legacy';
      floor?: number;
      chatId?: string;
      confirmUpdate: boolean;
      maxCreatePerRound: number;
      patchDuplicateGuard: boolean;
    },
  ): Promise<RouterResult[]> => {
    const { executable, lockedResults } = splitLockedCommands(commands, bookName);
    if (executable.length === 0) return lockedResults;
    const results = await router.execute(executable, bookName, options);
    return [...lockedResults, ...results];
  };

  const findEntriesByUids = (
    entries: WorldbookEntryLike[],
    uids: Array<number | string>,
  ): Map<string, WorldbookEntryLike> => {
    const uidSet = new Set(uids.map(item => String(item)));
    const matched = new Map<string, WorldbookEntryLike>();
    for (const entry of entries) {
      const uid = entry.uid ?? entry.id;
      if (uid == null) continue;
      const key = String(uid);
      if (!uidSet.has(key)) continue;
      matched.set(key, entry);
    }
    return matched;
  };

  const saveRuntimeSnapshot = async (bookName: string, reason: string): Promise<void> => {
    const entries = await repository.getEntries(bookName);
    snapshots.save({
      id: `snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      bookName,
      createdAt: new Date().toISOString(),
      reason,
      entries,
      floor: lastObservedFloor,
      chatId: activeChatId || undefined,
    });
  };

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
    refreshPanel(source === 'auto' ? 'background' : 'interactive');

    const startedAt = Date.now();
    let promptPreview = '';
    let replyPreview = '';
    let commandCount = 0;
    let promptMessages: ChatMessage[] = [];
    let parsedCommands: WorldUpdateCommand[] = [];
    let executionResults: RouterResult[] = [];
    let rawReply = '';
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
        directTriggerOnly: config.directTriggerOnly,
        sendUserMessages: config.sendUserMessages,
        sendAiMessages: config.sendAiMessages,
        scanText: contextScanner.buildScanText(messages, config.reviewDepth),
        promptEntries: promptEntryManager.list(),
      });

      promptMessages = trace.prompts;
      parsedCommands = trace.commands;
      rawReply = trace.reply;
      promptPreview = compactText(trace.prompts.map(item => `${item.role}:${item.content}`).join('\n'));
      replyPreview = compactText(trace.reply);
      commandCount = trace.commands.length;

      const results = await executeCommandsWithLockGuard(trace.commands, bookName, {
        approvalMode: config.approvalMode,
        source,
        floor,
        chatId: activeChatId || undefined,
        confirmUpdate: config.confirmUpdate,
        maxCreatePerRound: config.maxCreatePerRound,
        patchDuplicateGuard: config.patchDuplicateGuard,
      });
      executionResults = results;

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
        floor,
        chatId: activeChatId || undefined,
        promptPreview,
        outputPreview: replyPreview,
        commandCount,
        durationMs: Math.max(0, Date.now() - startedAt),
        promptMessages,
        rawReply,
        commands: parsedCommands.map(item => ({ ...item, fields: { ...item.fields }, ops: [...item.ops] })),
        results: executionResults.map(item => ({ ...item })),
        success: !results.some(item => item.status === 'error'),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      pushBackendRecord({
        id: `backend_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        source,
        bookName,
        floor,
        chatId: activeChatId || undefined,
        promptPreview,
        outputPreview: replyPreview,
        commandCount,
        durationMs: Math.max(0, Date.now() - startedAt),
        promptMessages,
        rawReply,
        commands: parsedCommands.map(item => ({ ...item, fields: { ...item.fields }, ops: [...item.ops] })),
        results: executionResults.map(item => ({ ...item })),
        success: false,
        error: reason,
      });
      throw error;
    } finally {
      processing = false;
      scheduler.unlock();
      refreshPanel(source === 'auto' ? 'background' : 'interactive');
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
      refreshPanel('background');
    } catch (error) {
      logger.error(`自动审核失败: timing=${timing} floor=${floor}`, error);
    }
  };

  const panelBridge: PanelBridge = {
    getStatus: () => getStatus(),
    getConfig: () => ({ ...config }),
    getApiConfig: () => ({ ...apiConfig }),
    saveConfig: async next => {
      const normalized = parseConfig(next);
      const prevFabEnabled = config.fabEnabled;
      Object.assign(config, normalized);
      targetBookName = config.targetBookName;
      resolvedBy = 'config';
      fallbackUsed = false;
      lastResolveError = '';
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
      if (prevFabEnabled !== config.fabEnabled) {
        syncLauncherState();
      }
      refreshPanel();
    },
    saveApiConfig: async next => {
      Object.assign(apiConfig, next);
      config.externalEndpoint = apiConfig.endpoint;
      config.externalApiKey = apiConfig.key;
      config.externalModel = apiConfig.model;
      saveApiConfig(apiConfig, storage ?? undefined);
      saveConfig(config, storage ?? undefined);
      rebuildReviewService();
      refreshPanel();
    },
    listEntries: async () => {
      const target = await resolveBookName();
      return await repository.getEntries(target);
    },
    listWorldbookNames: async targetType => await listWorldbookNames(targetType),
    getGlobalBindings: () => getGlobalWorldbooks(),
    setGlobalBindings: async names => await setGlobalWorldbooks(names),
    listGlobalPresets: () => listGlobalPresets(),
    saveCurrentGlobalPreset: async name => saveCurrentGlobalPreset(name),
    applyGlobalPreset: async id => await applyGlobalPreset(id),
    deleteGlobalPreset: async id => deleteGlobalPreset(id),
    exportGlobalPresets: () => exportGlobalPresets(),
    importGlobalPresets: async payload => importGlobalPresets(payload),
    exportApiPresets: () => exportApiPresets(),
    importApiPresets: async payload => importApiPresets(payload),
    exportPromptPresets: () => exportPromptPresets(),
    importPromptPresets: async payload => importPromptPresets(payload),
    listAiManagedNames: () => {
      if (!targetBookName) return [];
      return aiRegistry.list(targetBookName).map(item => item.entryName);
    },
    listLockedNames: () => {
      if (!targetBookName) return [];
      return listLockedEntries(targetBookName);
    },
    setEntryLocked: async (uid, locked) => {
      const target = await resolveBookName();
      const entries = await repository.getEntries(target);
      const found = findEntryByUid(entries, uid);
      const entryName = getEntryDisplayName(found ?? {});
      if (!entryName) throw new Error('未找到待锁定条目');
      if (locked) entryLocks.lock(target, entryName);
      else entryLocks.unlock(target, entryName);
      refreshPanel();
    },
    batchSetEnabled: async (uids, enabled) => await batchSetEnabled(await resolveBookName(), uids, enabled),
    batchDeleteEntries: async uids => await batchDeleteEntries(await resolveBookName(), uids),
    createEntry: async fields => {
      const target = await resolveBookName();
      const entryName = getEntryDisplayName(fields as WorldbookEntryLike);
      if (entryName && isLockedEntry(target, entryName)) {
        throw new Error(`条目已锁定，禁止写入: ${entryName}`);
      }
      await saveRuntimeSnapshot(target, `manual:create:${entryName || '(unnamed)'}`);
      await repository.addEntry(target, fields);
      refreshPanel();
    },
    updateEntry: async entry => {
      const target = await resolveBookName();
      const entries = await repository.getEntries(target);
      const uid = entry.uid ?? entry.id;
      const before = uid == null ? null : findEntryByUid(entries, uid);
      const beforeName = getEntryDisplayName(before ?? {});
      if (beforeName && isLockedEntry(target, beforeName)) {
        throw new Error(`条目已锁定，禁止更新: ${beforeName}`);
      }
      await saveRuntimeSnapshot(target, `manual:update:${beforeName || getEntryDisplayName(entry) || '(unnamed)'}`);
      await repository.updateEntry(target, entry);
      const afterName = getEntryDisplayName(entry);
      if (
        beforeName &&
        afterName &&
        normalizeEntryName(beforeName) !== normalizeEntryName(afterName) &&
        entryLocks.has(target, beforeName)
      ) {
        entryLocks.unlock(target, beforeName);
        entryLocks.lock(target, afterName);
      }
      if (
        config.aiRegistryEnabled &&
        beforeName &&
        afterName &&
        normalizeEntryName(beforeName) !== normalizeEntryName(afterName)
      ) {
        aiRegistry.rename(target, beforeName, afterName);
      }
      refreshPanel();
    },
    deleteEntry: async uid => {
      const target = await resolveBookName();
      const entries = await repository.getEntries(target);
      const found = findEntryByUid(entries, uid);
      const entryName = getEntryDisplayName(found ?? {});
      if (entryName && isLockedEntry(target, entryName)) {
        throw new Error(`条目已锁定，禁止删除: ${entryName}`);
      }
      await saveRuntimeSnapshot(target, `manual:delete:${entryName || String(uid)}`);
      await repository.deleteEntry(target, uid);
      if (entryName) {
        if (config.aiRegistryEnabled) aiRegistry.unmark(target, entryName);
        entryLocks.unlock(target, entryName);
      }
      refreshPanel();
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
    approveOne: async id => {
      await api.approveQueue([id]);
    },
    rejectOne: async id => {
      await api.rejectQueue([id]);
    },
    listQueue: () => queue.list(),
    listSnapshots: bookName => snapshots.list(bookName),
    listPromptEntries: () => promptEntryManager.list(),
    savePromptEntries: async entries => {
      promptEntryManager.replace(entries);
      refreshPanel();
    },
    listApiPresets: () => apiPresetManager.list(),
    saveCurrentAsApiPreset: async name => {
      const presetName = name.trim();
      if (!presetName) throw new Error('预设名称不能为空');
      const maybeActive = config.activeApiPreset ? apiPresetManager.get(config.activeApiPreset) : null;
      const preset = apiPresetManager.upsert(
        presetName,
        buildExternalApiConfig(config, apiConfig),
        maybeActive?.id,
      );
      config.activeApiPreset = preset.id;
      saveConfig(config, storage ?? undefined);
      refreshPanel();
    },
    applyApiPreset: async id => {
      const preset = apiPresetManager.get(id);
      if (!preset) throw new Error(`未找到 API 预设: ${id}`);
      Object.assign(apiConfig, preset.config);
      config.externalEndpoint = apiConfig.endpoint;
      config.externalApiKey = apiConfig.key;
      config.externalModel = apiConfig.model;
      config.activeApiPreset = id;
      saveApiConfig(apiConfig, storage ?? undefined);
      saveConfig(config, storage ?? undefined);
      rebuildReviewService();
      refreshPanel();
    },
    deleteApiPreset: async id => {
      apiPresetManager.remove(id);
      if (config.activeApiPreset === id) {
        config.activeApiPreset = '';
        saveConfig(config, storage ?? undefined);
      }
      refreshPanel();
    },
    listPromptPresets: () => promptPresetManager.list(),
    saveCurrentAsPromptPreset: async name => {
      const presetName = name.trim();
      if (!presetName) throw new Error('预设名称不能为空');
      const maybeActive = config.activePromptPreset ? promptPresetManager.get(config.activePromptPreset) : null;
      const preset = promptPresetManager.upsert(presetName, promptEntryManager.list(), maybeActive?.id);
      config.activePromptPreset = preset.id;
      saveConfig(config, storage ?? undefined);
      refreshPanel();
    },
    applyPromptPreset: async id => {
      const preset = promptPresetManager.get(id);
      if (!preset) throw new Error(`未找到提示词预设: ${id}`);
      promptEntryManager.replace(preset.entries);
      config.activePromptPreset = id;
      saveConfig(config, storage ?? undefined);
      refreshPanel();
    },
    deletePromptPreset: async id => {
      promptPresetManager.remove(id);
      if (config.activePromptPreset === id) {
        config.activePromptPreset = '';
        saveConfig(config, storage ?? undefined);
      }
      refreshPanel();
    },
    rollback: async snapshotId => {
      await api.rollback(snapshotId);
    },
    rollbackFloor: async (floor, chatId) => {
      await api.rollbackFloor(floor, chatId);
    },
    listBackendChats: () =>
      backendChats.map(item => ({
        ...item,
        promptMessages: item.promptMessages ? item.promptMessages.map(message => ({ ...message })) : undefined,
        commands: item.commands ? item.commands.map(command => ({ ...command, fields: { ...command.fields }, ops: [...command.ops] })) : undefined,
        results: item.results ? item.results.map(result => ({ ...result })) : undefined,
      })),
    exportBackendChats: ids => {
      const idSet = ids && ids.length > 0 ? new Set(ids) : null;
      const records = backendChats.filter(item => (idSet ? idSet.has(item.id) : true));
      return JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          version,
          total: records.length,
          records,
        },
        null,
        2,
      );
    },
    exportWorldbook: async bookName => await exportWorldbook(bookName),
    importWorldbookRaw: async (bookName, payload, strategy) =>
      await importWorldbookRaw(bookName, payload, strategy),
    listActivationLogs: () => activationLogs.map(item => ({ ...item })),
    clearActivationLogs: () => {
      activationLogs.splice(0, activationLogs.length);
      refreshPanel();
    },
    exportActivationLogs: () =>
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          version,
          total: activationLogs.length,
          records: activationLogs,
        },
        null,
        2,
      ),
    verifyCurrentBook: async () => {
      const bookName = await resolveBookName();
      return await bookSync.verify(bookName);
    },
    getIsolationInfo: () => isolation.getCurrentInfo(targetBookName || undefined),
    getIsolationStats: () => isolation.getStats(targetBookName || undefined),
    clearMyIsolation: async () => {
      isolation.clearMine(targetBookName || undefined);
      refreshPanel();
    },
    clearAllIsolation: async () => {
      isolation.clearAll(targetBookName || undefined);
      refreshPanel();
    },
    promoteIsolationToGlobal: async () => {
      await api.promoteIsolationToGlobal(targetBookName || undefined);
      refreshPanel();
    },
    getLogs: () => [...logs],
    clearLogs: () => {
      logs.splice(0, logs.length);
    },
  };

  panel = new VuePanelController(logger, panelBridge, open => {
    launcher?.setActive(open);
  });
  syncLauncherState();

  repository.logBackend();
  logger.info(`调度器已初始化: nextDue@0=${scheduler.nextDue(0)} version=${version || 'dev'}`);

  const getEntries = async (bookName?: string): Promise<WorldbookEntryLike[]> => {
    const target = await resolveBookName(bookName);
    return await repository.getEntries(target);
  };

  const addEntry = async (bookName: string, fields: Partial<WorldbookEntryLike>): Promise<void> => {
    const entryName = getEntryDisplayName(fields as WorldbookEntryLike);
    if (entryName && isLockedEntry(bookName, entryName)) {
      throw new Error(`条目已锁定，禁止写入: ${entryName}`);
    }
    await saveRuntimeSnapshot(bookName, `manual:create:${entryName || '(unnamed)'}`);
    await repository.addEntry(bookName, fields);
    refreshPanel();
  };

  const updateEntry = async (bookName: string, entry: WorldbookEntryLike): Promise<void> => {
    const entries = await repository.getEntries(bookName);
    const uid = entry.uid ?? entry.id;
    const before = uid == null ? null : findEntryByUid(entries, uid);
    const beforeName = getEntryDisplayName(before ?? {});
    if (beforeName && isLockedEntry(bookName, beforeName)) {
      throw new Error(`条目已锁定，禁止更新: ${beforeName}`);
    }
    await saveRuntimeSnapshot(bookName, `manual:update:${beforeName || getEntryDisplayName(entry) || '(unnamed)'}`);
    await repository.updateEntry(bookName, entry);
    const afterName = getEntryDisplayName(entry);
    if (
      beforeName &&
      afterName &&
      normalizeEntryName(beforeName) !== normalizeEntryName(afterName) &&
      entryLocks.has(bookName, beforeName)
    ) {
      entryLocks.unlock(bookName, beforeName);
      entryLocks.lock(bookName, afterName);
    }
    if (
      config.aiRegistryEnabled &&
      beforeName &&
      afterName &&
      normalizeEntryName(beforeName) !== normalizeEntryName(afterName)
    ) {
      aiRegistry.rename(bookName, beforeName, afterName);
    }
    refreshPanel();
  };

  const deleteEntry = async (bookName: string, uid: number | string): Promise<void> => {
    const entries = await repository.getEntries(bookName);
    const before = findEntryByUid(entries, uid);
    const beforeName = getEntryDisplayName(before ?? {});
    if (beforeName && isLockedEntry(bookName, beforeName)) {
      throw new Error(`条目已锁定，禁止删除: ${beforeName}`);
    }
    await saveRuntimeSnapshot(bookName, `manual:delete:${beforeName || String(uid)}`);
    await repository.deleteEntry(bookName, uid);
    if (beforeName) {
      aiRegistry.unmark(bookName, beforeName);
      entryLocks.unlock(bookName, beforeName);
    }
    refreshPanel();
  };

  const batchSetEnabled = async (
    bookName: string,
    uids: Array<number | string>,
    enabled: boolean,
  ): Promise<{ updated: number; skipped: number }> => {
    await saveRuntimeSnapshot(bookName, `manual:batchSetEnabled:${enabled ? 'on' : 'off'}`);
    const entries = await repository.getEntries(bookName);
    const matched = findEntriesByUids(entries, uids);
    let updated = 0;
    let skipped = 0;
    for (const uid of uids) {
      const current = matched.get(String(uid));
      if (!current) {
        skipped++;
        continue;
      }
      const entryName = getEntryDisplayName(current);
      if (entryName && isLockedEntry(bookName, entryName)) {
        skipped++;
        continue;
      }
      await repository.updateEntry(bookName, { ...current, enabled });
      updated++;
    }
    refreshPanel();
    return { updated, skipped };
  };

  const batchDeleteEntries = async (
    bookName: string,
    uids: Array<number | string>,
  ): Promise<{ deleted: number; skipped: number }> => {
    await saveRuntimeSnapshot(bookName, `manual:batchDelete:${uids.length}`);
    const entries = await repository.getEntries(bookName);
    const matched = findEntriesByUids(entries, uids);
    let deleted = 0;
    let skipped = 0;
    for (const uid of uids) {
      const current = matched.get(String(uid));
      if (!current) {
        skipped++;
        continue;
      }
      const entryName = getEntryDisplayName(current);
      if (entryName && isLockedEntry(bookName, entryName)) {
        skipped++;
        continue;
      }
      const entryUid = current.uid ?? current.id;
      if (entryUid == null) {
        skipped++;
        continue;
      }
      await repository.deleteEntry(bookName, entryUid);
      if (entryName) {
        aiRegistry.unmark(bookName, entryName);
        entryLocks.unlock(bookName, entryName);
      }
      deleted++;
    }
    refreshPanel();
    return { deleted, skipped };
  };

  const patchEntry = async (
    bookName: string,
    entryName: string,
    ops: PatchOp[],
  ): Promise<{ applied: number; skipped: number; errors: string[] }> => {
    if (isLockedEntry(bookName, entryName)) {
      return {
        applied: 0,
        skipped: 0,
        errors: ['条目已锁定，禁止 patch'],
      };
    }
    const entries = await repository.getEntries(bookName);
    const target = findEntryByName(entries, entryName);
    if (!target) throw new Error(`未找到条目: ${entryName}`);
    const next = { ...target };
    const result = patchProcessor.apply(next, ops, {
      duplicateGuard: config.patchDuplicateGuard,
    });
    if (result.applied > 0) {
      await saveRuntimeSnapshot(bookName, `manual:patch:${entryName}`);
      await repository.updateEntry(bookName, next);
      const afterName = getEntryDisplayName(next);
      if (
        config.aiRegistryEnabled &&
        entryName &&
        afterName &&
        normalizeEntryName(entryName) !== normalizeEntryName(afterName)
      ) {
        aiRegistry.rename(bookName, entryName, afterName);
      }
      refreshPanel();
    }
    return result;
  };

  const executeCommands = async (commands: WorldUpdateCommand[], bookName: string): Promise<RouterResult[]> => {
    const results = await executeCommandsWithLockGuard(commands, bookName, {
      approvalMode: config.approvalMode,
      source: 'manual',
      floor: lastObservedFloor,
      chatId: activeChatId || undefined,
      confirmUpdate: config.confirmUpdate,
      maxCreatePerRound: config.maxCreatePerRound,
      patchDuplicateGuard: config.patchDuplicateGuard,
    });
    refreshPanel();
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
        const results = await executeCommandsWithLockGuard(pending.commands, pending.bookName, {
          approvalMode: 'auto',
          source: pending.source,
          floor: pending.floor,
          chatId: pending.chatId,
          confirmUpdate: config.confirmUpdate,
          maxCreatePerRound: config.maxCreatePerRound,
          patchDuplicateGuard: config.patchDuplicateGuard,
        });
        if (config.aiRegistryEnabled) {
          for (const result of results) {
            if (result.status !== 'ok') continue;
            if (result.action !== 'create' && result.action !== 'update' && result.action !== 'patch') continue;
            aiRegistry.mark(pending.bookName, result.entry_name, pending.source === 'legacy' ? 'manual' : pending.source);
          }
        }
      }
      refreshPanel();
    },
    rejectQueue: async ids => {
      const rejected = queue.reject(ids);
      refreshPanel();
      return rejected;
    },
    rollback: async snapshotId => {
      const snapshot = snapshots.findById(snapshotId);
      if (!snapshot) throw new Error(`未找到快照: ${snapshotId}`);
      await repository.replaceEntries(snapshot.bookName, snapshot.entries);
      logger.info(`已回滚快照: ${snapshotId}`);
      refreshPanel();
    },
    rollbackFloor: async (floor, chatId) => {
      const snapshot = snapshots.findLatestByFloor(floor, chatId);
      if (!snapshot) throw new Error(`未找到楼层快照: floor=${floor}${chatId ? ` chatId=${chatId}` : ''}`);
      await repository.replaceEntries(snapshot.bookName, snapshot.entries);
      logger.info(`已按楼层回滚: floor=${floor} snapshot=${snapshot.id}`);
      refreshPanel();
    },
    listQueue: () => queue.list(),
    listSnapshots: bookName => snapshots.list(bookName),
    getStatus: () => getStatus(),

    getEntries,
    listWorldbookNames,
    getGlobalWorldbooks,
    setGlobalWorldbooks,
    listGlobalPresets,
    saveCurrentGlobalPreset,
    applyGlobalPreset,
    deleteGlobalPreset,
    exportGlobalPresets,
    importGlobalPresets,
    exportApiPresets,
    importApiPresets,
    exportPromptPresets,
    importPromptPresets,
    exportWorldbook,
    importWorldbookRaw,
    listLockedEntries: bookName => {
      const target = String(bookName ?? targetBookName ?? '').trim();
      if (!target) return [];
      return listLockedEntries(target);
    },
    setEntryLock: (bookName, entryName, locked) => {
      const target = String(bookName || targetBookName || '').trim();
      if (!target) return false;
      if (locked) return entryLocks.lock(target, entryName);
      return entryLocks.unlock(target, entryName);
    },
    addEntry,
    updateEntry,
    deleteEntry,
    batchSetEnabled,
    batchDeleteEntries,
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
    listBackendChats: () => [...backendChats],
    exportBackendChats: ids => panelBridge.exportBackendChats(ids),
    listActivationLogs: () => activationLogs.map(item => ({ ...item })),
    clearActivationLogs: () => {
      activationLogs.splice(0, activationLogs.length);
      refreshPanel();
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
  const eventWorldInfoActivated = getRuntimeEventName(
    runtime,
    'WORLD_INFO_ACTIVATED',
    'world_info_activated',
  );

  const resetRuntimeState = (reason: string): void => {
    targetBookName = config.targetBookName;
    resolvedBy = 'reset';
    fallbackUsed = false;
    lastResolveError = '';
    scheduler.reset(0);
    lastObservedFloor = 0;
    logger.info(reason);
    refreshPanel();
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
      refreshPanel();
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
  events.on(eventWorldInfoActivated, (...args) => {
    const payload = args[0];
    const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
    if (items.length === 0) return;
    const now = new Date().toISOString();
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      const uid = String(entry.uid ?? entry.id ?? '');
      const name = String(entry.comment ?? entry.name ?? '').trim() || '(未命名条目)';
      const bookName = String(
        entry.worldbookName ??
          entry.worldbook_name ??
          entry.lorebookName ??
          entry.lorebook_name ??
          targetBookName ??
          '',
      ).trim();
      const preview = createActivationPreview(entry.content);
      pushActivationLog({
        id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        time: now,
        bookName,
        uid,
        name,
        preview,
        source: 'world_info_activated',
      });
    }
    refreshPanel();
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
