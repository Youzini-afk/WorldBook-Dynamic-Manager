import { describe, expect, it } from 'vitest';
import { BackupManager } from '../src/WBM/services/worldbook/backupManager';
import { memoryStorage } from './helpers';

describe('BackupManager', () => {
  it('应创建、查询和删除备份，并执行保留策略', () => {
    const manager = new BackupManager(memoryStorage(), 2);

    const b1 = manager.create('bookA', [{ uid: 1, name: 'A' }], 'before');
    const b2 = manager.create('bookA', [{ uid: 2, name: 'B' }], 'before');
    manager.create('bookA', [{ uid: 3, name: 'C' }], 'before');

    const list = manager.list('bookA');
    expect(list).toHaveLength(2);
    expect(list.some(item => item.id === b1.id)).toBe(false);
    expect(manager.find(b2.id)?.bookName).toBe('bookA');

    expect(manager.remove(b2.id)).toBe(true);
    expect(manager.find(b2.id)).toBeNull();
  });

  it('setRetention 应触发裁剪', () => {
    const manager = new BackupManager(memoryStorage(), 5);
    manager.create('bookA', [], 'r1');
    manager.create('bookA', [], 'r2');
    manager.setRetention(1);
    expect(manager.list()).toHaveLength(1);
  });
});
