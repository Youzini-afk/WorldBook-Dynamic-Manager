import { describe, expect, it } from 'vitest';
import { FloorScheduler } from '../src/WBM/services/scheduler/scheduler';

describe('FloorScheduler', () => {
  it('isDue 在 start/interval 边界正确', () => {
    const scheduler = new FloorScheduler({
      startAfter: 3,
      interval: 5,
      triggerTiming: 'after',
    });
    expect(scheduler.isDue(3)).toBe(false);
    expect(scheduler.isDue(8)).toBe(true);
    expect(scheduler.isDue(9)).toBe(false);
  });

  it('nextDue 覆盖 interval 0、正数、禁用', () => {
    const always = new FloorScheduler({
      startAfter: 3,
      interval: 0,
      triggerTiming: 'after',
    });
    const periodic = new FloorScheduler({
      startAfter: 3,
      interval: 5,
      triggerTiming: 'after',
    });
    const disabled = new FloorScheduler({
      startAfter: 3,
      interval: -1,
      triggerTiming: 'after',
    });
    expect(always.nextDue(3)).toBe(4);
    expect(periodic.nextDue(0)).toBe(8);
    expect(disabled.nextDue(100)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('锁行为与状态推进正确', () => {
    const scheduler = new FloorScheduler({
      startAfter: 1,
      interval: 2,
      triggerTiming: 'both',
    });
    expect(scheduler.lock()).toBe(true);
    expect(scheduler.lock()).toBe(false);
    scheduler.markProcessed(5);
    const state = scheduler.getState();
    expect(state.lastFloor).toBe(5);
    expect(state.nextDueFloor).toBe(7);
    scheduler.unlock();
    expect(scheduler.isLocked()).toBe(false);
  });
});
