import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootstrapWbmV3, unloadWbmV3 } from '../src/WBM/index';
import { memoryStorage } from './helpers';

interface RuntimeGlobal {
  window?: RuntimeGlobal;
  localStorage?: ReturnType<typeof memoryStorage>;
  WBM3?: {
    approveQueue(ids?: string[]): Promise<void>;
    rejectQueue(ids?: string[]): Promise<number>;
    listQueue(): unknown[];
    listSnapshots(bookName?: string): unknown[];
    listLockedEntries(bookName?: string): string[];
    setEntryLock(bookName: string, entryName: string, locked: boolean): boolean;
    batchSetEnabled(
      bookName: string,
      uids: Array<number | string>,
      enabled: boolean,
    ): Promise<{ updated: number; skipped: number }>;
    batchDeleteEntries(
      bookName: string,
      uids: Array<number | string>,
    ): Promise<{ deleted: number; skipped: number }>;
    listBackendChats(): unknown[];
    exportBackendChats(ids?: string[]): string;
    listWorldbookNames(targetType?: 'charPrimary' | 'charAdditional' | 'global' | 'managed'): Promise<string[]>;
    listActivationLogs(): unknown[];
    clearActivationLogs(): void;
    rollbackFloor(floor: number, chatId?: string): Promise<void>;
  };
  WBM?: {
    approveOne(id: string): Promise<void>;
    rejectOne(id: string): Promise<number>;
    getPendingQueue(): unknown[];
    getSnapshots(bookName?: string): unknown[];
    rollbackFloor(floor: number, chatId?: string): Promise<void>;
  };
}

const runtime = globalThis as unknown as RuntimeGlobal;

describe('bootstrapWbmV3 API bridge', () => {
  afterEach(() => {
    unloadWbmV3();
    delete runtime.WBM3;
    delete runtime.WBM;
    delete runtime.localStorage;
    delete runtime.window;
  });

  it('应挂载 v3 API 与 legacy 兼容壳映射', async () => {
    runtime.window = runtime;
    runtime.localStorage = memoryStorage();

    bootstrapWbmV3();

    expect(runtime.WBM3).toBeDefined();
    expect(runtime.WBM).toBeDefined();
    expect(runtime.WBM3?.listQueue()).toEqual([]);
    expect(runtime.WBM3?.listSnapshots()).toEqual([]);
    expect(runtime.WBM3?.listLockedEntries()).toEqual([]);
    expect(runtime.WBM3?.listBackendChats()).toEqual([]);
    expect(typeof runtime.WBM3?.exportBackendChats()).toBe('string');
    await expect(runtime.WBM3!.listWorldbookNames('global')).resolves.toEqual([]);
    expect(runtime.WBM3!.listActivationLogs()).toEqual([]);
    expect(() => runtime.WBM3!.clearActivationLogs()).not.toThrow();
    expect(runtime.WBM3?.setEntryLock('bookA', 'entry-1', true)).toBe(true);
    expect(runtime.WBM3?.listLockedEntries('bookA')).toEqual(['entry-1']);

    const approveSpy = vi.spyOn(runtime.WBM3!, 'approveQueue').mockResolvedValue();
    const rejectSpy = vi.spyOn(runtime.WBM3!, 'rejectQueue').mockResolvedValue(0);
    const rollbackFloorSpy = vi.spyOn(runtime.WBM3!, 'rollbackFloor').mockResolvedValue();

    await runtime.WBM!.approveOne('qid-1');
    await runtime.WBM!.rejectOne('qid-2');
    await runtime.WBM!.rollbackFloor(12, 'chat-a');

    expect(approveSpy).toHaveBeenCalledWith(['qid-1']);
    expect(rejectSpy).toHaveBeenCalledWith(['qid-2']);
    expect(rollbackFloorSpy).toHaveBeenCalledWith(12, 'chat-a');
    expect(runtime.WBM!.getPendingQueue()).toEqual([]);
    expect(runtime.WBM!.getSnapshots('bookA')).toEqual([]);
  });
});
