import { describe, expect, it, vi } from 'vitest';
import { FloorScheduler } from '../src/WBM/services/scheduler/scheduler';

describe('Replay E2E', () => {
  it('高楼层并发触发时不会重复执行', async () => {
    const scheduler = new FloorScheduler({
      startAfter: 3,
      interval: 1,
      triggerTiming: 'after',
    });
    const run = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    const processFloor = async (floor: number): Promise<void> => {
      if (!scheduler.shouldTrigger('after', floor)) return;
      if (!scheduler.lock()) return;
      try {
        await run();
        scheduler.markProcessed(floor);
      } finally {
        scheduler.unlock();
      }
    };

    await Promise.all([processFloor(10), processFloor(10), processFloor(10)]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.getState().lastFloor).toBe(10);
  });
});
