import { describe, expect, it } from 'vitest';
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
});
