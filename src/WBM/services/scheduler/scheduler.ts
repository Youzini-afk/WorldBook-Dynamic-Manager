import type { SchedulerConfig, SchedulerState } from '../../core/types';

export class FloorScheduler {
  private state: SchedulerState;

  constructor(private readonly config: SchedulerConfig) {
    this.state = {
      locked: false,
      lastFloor: 0,
      nextDueFloor: this.nextDue(0),
    };
  }

  isDue(aiFloor: number): boolean {
    if (aiFloor <= this.config.startAfter) return false;
    if (this.config.interval === 0) return true;
    if (this.config.interval < 0) return false;
    return (aiFloor - this.config.startAfter) % this.config.interval === 0;
  }

  shouldTrigger(when: 'before' | 'after', aiFloor: number): boolean {
    if (this.config.triggerTiming !== 'both' && this.config.triggerTiming !== when) return false;
    return this.isDue(aiFloor);
  }

  isLocked(): boolean {
    return this.state.locked;
  }

  lock(): boolean {
    if (this.state.locked) return false;
    this.state.locked = true;
    return true;
  }

  unlock(): void {
    this.state.locked = false;
  }

  markProcessed(aiFloor: number): void {
    this.state.lastFloor = aiFloor;
    this.state.nextDueFloor = this.nextDue(aiFloor);
  }

  getState(): SchedulerState {
    return { ...this.state };
  }

  nextDue(currentFloor: number): number {
    const { startAfter, interval } = this.config;
    if (interval < 0) return Number.MAX_SAFE_INTEGER;
    if (interval === 0) return currentFloor < startAfter ? startAfter + 1 : currentFloor + 1;
    if (currentFloor < startAfter) return startAfter + interval;
    return startAfter + (Math.floor((currentFloor - startAfter) / interval) + 1) * interval;
  }
}
