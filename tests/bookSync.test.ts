import { describe, expect, it } from 'vitest';
import type { RouterResult, WorldUpdateCommand, WorldbookEntryLike } from '../src/WBM/core/types';
import { BookSyncService } from '../src/WBM/services/worldbook/bookSync';
import type { WorldbookRepository } from '../src/WBM/services/worldbook/repository';
import { noopLogger } from './helpers';

class Repo implements WorldbookRepository {
  constructor(private entries: WorldbookEntryLike[]) {}

  async getEntries(): Promise<WorldbookEntryLike[]> {
    return [...this.entries];
  }

  async addEntry(): Promise<void> {}

  async updateEntry(): Promise<void> {}

  async deleteEntry(): Promise<void> {}

  async replaceEntries(): Promise<void> {}

  getCapabilities() {
    return { highLevel: true, legacy: false };
  }
}

class BrokenRepo extends Repo {
  override async getEntries(): Promise<WorldbookEntryLike[]> {
    throw new Error('boom');
  }
}

describe('BookSyncService', () => {
  it('verify 在无异常时应返回 ok', async () => {
    const repo = new Repo([{ uid: 1, name: 'A' }]);
    const service = new BookSyncService(repo, noopLogger);
    const result = await service.verify('bookA');
    expect(result.ok).toBe(true);
    expect(result.issueCount).toBe(0);
  });

  it('verify 在仓储异常时应记录 runtime_error', async () => {
    const service = new BookSyncService(new BrokenRepo([]), noopLogger);
    const result = await service.verify('bookA');
    expect(result.ok).toBe(false);
    expect(result.issues.some(item => item.type === 'runtime_error')).toBe(true);
  });

  it('verify 应识别重复名与错误结果', async () => {
    const repo = new Repo([
      { uid: 1, name: 'A' },
      { uid: 2, name: 'A' },
    ]);
    const service = new BookSyncService(repo, noopLogger);

    const result = await service.verify('bookA', [
      { action: 'update', entry_name: 'A', status: 'error', reason: 'x' },
    ] as RouterResult[]);

    expect(result.ok).toBe(false);
    expect(result.issueCount).toBeGreaterThanOrEqual(2);
  });

  it('repair 在有命令执行器时应调用并返回二次 verify', async () => {
    const repo = new Repo([{ uid: 1, name: 'A' }]);
    const service = new BookSyncService(repo, noopLogger);
    const commands: WorldUpdateCommand[] = [
      { action: 'update', entry_name: 'A', fields: {}, ops: [] },
    ];

    let called = 0;
    const verify = await service.repair(
      'bookA',
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        bookName: 'bookA',
        issueCount: 1,
        issues: [{ type: 'runtime_error', message: 'x' }],
      },
      commands,
      async () => {
        called++;
        return [];
      },
    );

    expect(called).toBe(1);
    expect(verify.bookName).toBe('bookA');
  });

  it('repair 在 baseline 已通过时不执行补偿', async () => {
    const repo = new Repo([{ uid: 1, name: 'A' }]);
    const service = new BookSyncService(repo, noopLogger);
    let called = 0;

    const verify = await service.repair(
      'bookA',
      {
        ok: true,
        checkedAt: new Date().toISOString(),
        bookName: 'bookA',
        issueCount: 0,
        issues: [],
      },
      [],
      async () => {
        called++;
        return [];
      },
    );

    expect(called).toBe(0);
    expect(verify.ok).toBe(true);
  });
});
