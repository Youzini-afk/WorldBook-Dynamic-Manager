import type {
  BookSyncIssue,
  BookSyncResult,
  LoggerLike,
  RouterResult,
  WorldUpdateCommand,
  WorldbookEntryLike,
} from '../../core/types';
import type { WorldbookRepository } from './repository';

function entryName(entry: WorldbookEntryLike): string {
  return String(entry.name ?? entry.comment ?? '').trim();
}

export class BookSyncService {
  constructor(
    private readonly repository: WorldbookRepository,
    private readonly logger: LoggerLike,
  ) {}

  async verify(bookName: string, results?: RouterResult[]): Promise<BookSyncResult> {
    const issues: BookSyncIssue[] = [];

    if (Array.isArray(results)) {
      for (const result of results) {
        if (result.status !== 'error') continue;
        issues.push({
          type: 'runtime_error',
          message: result.reason || result.detail || '执行失败',
          entryName: result.entry_name,
        });
      }
    }

    try {
      const entries = await this.repository.getEntries(bookName);
      const seen = new Set<string>();
      for (const entry of entries) {
        const name = entryName(entry);
        if (!name) {
          issues.push({
            type: 'inconsistent',
            message: '发现无名称条目',
          });
          continue;
        }
        const lowered = name.toLowerCase();
        if (seen.has(lowered)) {
          issues.push({
            type: 'inconsistent',
            message: `发现重复条目名: ${name}`,
            entryName: name,
          });
          continue;
        }
        seen.add(lowered);
      }
    } catch (error) {
      issues.push({
        type: 'runtime_error',
        message: `读取世界书失败: ${String(error)}`,
      });
    }

    return {
      ok: issues.length === 0,
      checkedAt: new Date().toISOString(),
      bookName,
      issueCount: issues.length,
      issues,
    };
  }

  async repair(
    bookName: string,
    verifyResult?: BookSyncResult,
    commands?: WorldUpdateCommand[],
    executeCommands?: (commands: WorldUpdateCommand[], bookName: string) => Promise<RouterResult[]>,
  ): Promise<BookSyncResult> {
    const baseline = verifyResult ?? (await this.verify(bookName));
    if (baseline.ok) return baseline;

    if (commands && commands.length > 0 && executeCommands) {
      try {
        await executeCommands(commands, bookName);
      } catch (error) {
        this.logger.warn('repair 执行补偿指令失败', error);
      }
    }

    return await this.verify(bookName);
  }
}
