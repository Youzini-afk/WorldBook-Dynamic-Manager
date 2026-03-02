import type {
  ApprovalMode,
  LoggerLike,
  PendingReviewItem,
  RouterResult,
  SnapshotRecord,
  WorldUpdateCommand,
  WorldbookEntryLike,
} from '../../core/types';
import type { PatchProcessor } from '../patch/patchProcessor';
import type { WorldbookRepository } from '../worldbook/repository';

function resolveUid(entry: WorldbookEntryLike): number | string | null {
  if (entry.uid != null) return entry.uid;
  if (entry.id != null) return entry.id;
  return null;
}

function findByName(entries: WorldbookEntryLike[], name: string): WorldbookEntryLike | null {
  const needle = name.trim().toLowerCase();
  for (const entry of entries) {
    const title = String(entry.name ?? entry.comment ?? '').trim().toLowerCase();
    if (title === needle) return entry;
  }
  return null;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface PendingQueueStore {
  enqueue(item: PendingReviewItem): void;
}

export interface SnapshotStore {
  save(snapshot: SnapshotRecord): void;
}

export interface RouterExecutionOptions {
  approvalMode?: ApprovalMode;
  source?: PendingReviewItem['source'];
}

export class CommandRouter {
  constructor(
    private readonly repository: WorldbookRepository,
    private readonly patchProcessor: PatchProcessor,
    private readonly logger: LoggerLike,
    private readonly queueStore?: PendingQueueStore,
    private readonly snapshotStore?: SnapshotStore,
  ) {}

  async execute(
    commands: WorldUpdateCommand[],
    bookName: string,
    options: RouterExecutionOptions = {},
  ): Promise<RouterResult[]> {
    const approvalMode = options.approvalMode ?? 'auto';
    const source = options.source ?? 'manual';
    if (approvalMode === 'manual') {
      const queued = this.enqueueCommands(commands, bookName, source);
      return commands.map(command => ({
        action: 'queue',
        entry_name: command.entry_name,
        status: 'queued',
        detail: `已加入审核队列: ${queued.id}`,
      }));
    }

    const results: RouterResult[] = [];
    for (const command of commands) {
      if (approvalMode === 'selective' && command.action === 'delete') {
        const queued = this.enqueueCommands([command], bookName, source);
        results.push({
          action: 'queue',
          entry_name: command.entry_name,
          status: 'queued',
          detail: `delete 指令待审核: ${queued.id}`,
        });
        continue;
      }

      try {
        const result = await this.executeOne(command, bookName);
        results.push(result);
      } catch (error) {
        this.logger.error('指令执行失败', { command, error });
        results.push({
          action: command.action,
          entry_name: command.entry_name,
          status: 'error',
          reason: String(error),
        });
      }
    }
    return results;
  }

  private enqueueCommands(
    commands: WorldUpdateCommand[],
    bookName: string,
    source: PendingReviewItem['source'],
  ): PendingReviewItem {
    const item: PendingReviewItem = {
      id: makeId('queue'),
      bookName,
      commands,
      createdAt: new Date().toISOString(),
      source,
    };
    this.queueStore?.enqueue(item);
    return item;
  }

  private async saveSnapshot(bookName: string, reason: string): Promise<void> {
    if (!this.snapshotStore) return;
    const entries = await this.repository.getEntries(bookName);
    this.snapshotStore.save({
      id: makeId('snapshot'),
      bookName,
      createdAt: new Date().toISOString(),
      reason,
      entries,
    });
  }

  private async executeOne(command: WorldUpdateCommand, bookName: string): Promise<RouterResult> {
    const entries = await this.repository.getEntries(bookName);
    const target = findByName(entries, command.entry_name);

    if (command.action === 'create') {
      await this.repository.addEntry(bookName, { name: command.entry_name, ...command.fields });
      return { action: 'create', entry_name: command.entry_name, status: 'ok', detail: '已创建' };
    }

    if (!target) {
      return {
        action: command.action,
        entry_name: command.entry_name,
        status: 'skipped',
        reason: '未找到目标条目',
      };
    }

    if (command.action === 'update') {
      await this.saveSnapshot(bookName, `update:${command.entry_name}`);
      await this.repository.updateEntry(bookName, { ...target, ...command.fields });
      return { action: 'update', entry_name: command.entry_name, status: 'ok', detail: '已更新' };
    }

    if (command.action === 'delete') {
      const uid = resolveUid(target);
      if (uid == null) {
        return {
          action: 'delete',
          entry_name: command.entry_name,
          status: 'error',
          code: 'REPOSITORY_ENTRY_UID_MISSING',
          reason: '缺少 uid',
        };
      }
      await this.saveSnapshot(bookName, `delete:${command.entry_name}`);
      await this.repository.deleteEntry(bookName, uid);
      return { action: 'delete', entry_name: command.entry_name, status: 'ok', detail: '已删除' };
    }

    const next = { ...target, ...command.fields };
    const patchResult = this.patchProcessor.apply(next, command.ops);
    await this.saveSnapshot(bookName, `patch:${command.entry_name}`);
    await this.repository.updateEntry(bookName, next);
    return {
      action: 'patch',
      entry_name: command.entry_name,
      status: 'ok',
      detail: `patch 生效:${patchResult.applied} 跳过:${patchResult.skipped}`,
    };
  }
}
