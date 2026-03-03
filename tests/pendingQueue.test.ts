import { describe, expect, it } from 'vitest';
import { storageKey } from '../src/WBM/core/config';
import { PendingQueue } from '../src/WBM/services/review/pendingQueue';
import { memoryStorage } from './helpers';

describe('PendingQueue', () => {
  it('支持入队、按 id 提取、全部拒绝', () => {
    const queue = new PendingQueue(memoryStorage());
    queue.enqueue({
      id: 'q1',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [],
    });
    queue.enqueue({
      id: 'q2',
      bookName: 'bookA',
      source: 'auto',
      createdAt: new Date().toISOString(),
      commands: [],
    });
    expect(queue.size()).toBe(2);
    const one = queue.take(['q1']);
    expect(one).toHaveLength(1);
    expect(queue.size()).toBe(1);
    expect(queue.reject()).toBe(1);
    expect(queue.size()).toBe(0);
  });

  it('支持全量提取与按 id 拒绝', () => {
    const queue = new PendingQueue(memoryStorage());
    queue.enqueue({
      id: 'qa',
      bookName: 'bookA',
      source: 'auto',
      createdAt: new Date().toISOString(),
      commands: [],
    });
    queue.enqueue({
      id: 'qb',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [],
    });

    const all = queue.take();
    expect(all).toHaveLength(2);
    expect(queue.size()).toBe(0);

    queue.enqueue({
      id: 'qc',
      bookName: 'bookA',
      source: 'auto',
      createdAt: new Date().toISOString(),
      commands: [],
    });
    queue.enqueue({
      id: 'qd',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [],
    });
    expect(queue.reject(['qc'])).toBe(1);
    expect(queue.list().map(item => item.id)).toEqual(['qd']);
  });

  it('list 返回深拷贝，不会泄漏内部状态', () => {
    const queue = new PendingQueue(memoryStorage());
    queue.enqueue({
      id: 'q1',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [{ action: 'create', entry_name: 'a', fields: {}, ops: [] }],
    });
    const listed = queue.list();
    listed[0].id = 'changed';
    listed[0].commands.push({ action: 'delete', entry_name: 'x', fields: {}, ops: [] });

    const again = queue.list();
    expect(again[0].id).toBe('q1');
    expect(again[0].commands).toHaveLength(1);
  });

  it('无 storage 时也可工作', () => {
    const queue = new PendingQueue(null);
    queue.enqueue({
      id: 'q1',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [],
    });
    expect(queue.size()).toBe(1);
    expect(queue.take().map(item => item.id)).toEqual(['q1']);
  });

  it('可容错非法持久化数据', () => {
    const invalidJson = memoryStorage({
      [storageKey('pending_queue')]: '{not-json',
    });
    expect(new PendingQueue(invalidJson).size()).toBe(0);

    const nonArray = memoryStorage({
      [storageKey('pending_queue')]: JSON.stringify({ a: 1 }),
    });
    expect(new PendingQueue(nonArray).size()).toBe(0);
  });

  it('兼容方法 rejectOne / clearAll / getPending / count', () => {
    const queue = new PendingQueue(memoryStorage());
    queue.enqueue({
      id: 'q1',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [],
    });
    queue.enqueue({
      id: 'q2',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [],
    });

    expect(queue.getPending()).toHaveLength(2);
    expect(queue.count()).toBe(2);
    expect(queue.rejectOne('q1')).toBe(1);
    expect(queue.count()).toBe(1);
    expect(queue.clearAll()).toBe(1);
    expect(queue.count()).toBe(0);
  });

  it('cleanup 应清理过期任务并保留有效任务', () => {
    const queue = new PendingQueue(memoryStorage());
    queue.enqueue({
      id: 'old',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      commands: [],
    });
    queue.enqueue({
      id: 'new',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [],
    });
    queue.enqueue({
      id: 'unknown',
      bookName: 'bookA',
      source: 'manual',
      createdAt: 'not-a-date',
      commands: [],
    });

    expect(queue.cleanup()).toBe(1);
    expect(queue.list().map(item => item.id).sort()).toEqual(['new', 'unknown']);
  });

  it('支持按命令索引提取/拒绝单条指令', () => {
    const queue = new PendingQueue(memoryStorage());
    queue.enqueue({
      id: 'q-cmd',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [
        { action: 'create', entry_name: 'A', fields: {}, ops: [] },
        { action: 'update', entry_name: 'B', fields: {}, ops: [] },
      ],
    });

    const taken = queue.takeCommand('q-cmd', 1);
    expect(taken).not.toBeNull();
    expect(taken?.commands).toHaveLength(1);
    expect(taken?.commands[0]?.entry_name).toBe('B');
    expect(queue.list()[0]?.commands).toHaveLength(1);
    expect(queue.list()[0]?.commands[0]?.entry_name).toBe('A');

    expect(queue.rejectCommand('q-cmd', 0)).toBe(1);
    expect(queue.size()).toBe(0);
  });

  it('rejectCommand 在非末条场景下应仅移除指定指令', () => {
    const queue = new PendingQueue(memoryStorage());
    queue.enqueue({
      id: 'q-keep',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [
        { action: 'create', entry_name: 'A', fields: {}, ops: [] },
        { action: 'update', entry_name: 'B', fields: {}, ops: [] },
      ],
    });

    expect(queue.rejectCommand('q-keep', 0)).toBe(1);
    expect(queue.list()).toHaveLength(1);
    expect(queue.list()[0]?.commands).toHaveLength(1);
    expect(queue.list()[0]?.commands[0]?.entry_name).toBe('B');
  });

  it('takeCommand/rejectCommand 对非法索引与缺失任务应返回空结果', () => {
    const queue = new PendingQueue(memoryStorage());
    queue.enqueue({
      id: 'q-err',
      bookName: 'bookA',
      source: 'manual',
      createdAt: new Date().toISOString(),
      commands: [{ action: 'create', entry_name: 'A', fields: {}, ops: [] }],
    });

    expect(queue.takeCommand('q-err', -1)).toBeNull();
    expect(queue.takeCommand('missing', 0)).toBeNull();
    expect(queue.takeCommand('q-err', 5)).toBeNull();
    expect(queue.rejectCommand('q-err', -1)).toBe(0);
    expect(queue.rejectCommand('missing', 0)).toBe(0);
    expect(queue.rejectCommand('q-err', 5)).toBe(0);
  });
});
