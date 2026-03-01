import type {
  LoggerLike,
  RouterResult,
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

export class CommandRouter {
  constructor(
    private readonly repository: WorldbookRepository,
    private readonly patchProcessor: PatchProcessor,
    private readonly logger: LoggerLike,
  ) {}

  async execute(commands: WorldUpdateCommand[], bookName: string): Promise<RouterResult[]> {
    const results: RouterResult[] = [];
    for (const command of commands) {
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
      await this.repository.updateEntry(bookName, { ...target, ...command.fields });
      return { action: 'update', entry_name: command.entry_name, status: 'ok', detail: '已更新' };
    }

    if (command.action === 'delete') {
      const uid = resolveUid(target);
      if (uid == null) return { action: 'delete', entry_name: command.entry_name, status: 'error', reason: '缺少 uid' };
      await this.repository.deleteEntry(bookName, uid);
      return { action: 'delete', entry_name: command.entry_name, status: 'ok', detail: '已删除' };
    }

    const next = { ...target, ...command.fields };
    const patchResult = this.patchProcessor.apply(next, command.ops);
    await this.repository.updateEntry(bookName, next);
    return {
      action: 'patch',
      entry_name: command.entry_name,
      status: 'ok',
      detail: `patch 生效:${patchResult.applied} 跳过:${patchResult.skipped}`,
    };
  }
}
