import type { SchedulerConfig } from '../../core/types';

export class FloorScheduler {
  constructor(private readonly config: SchedulerConfig) {}

  isDue(aiFloor: number): boolean {
    if (aiFloor <= this.config.startAfter) return false;
    if (this.config.interval === 0) return true;
    if (this.config.interval < 0) return false;
    return (aiFloor - this.config.startAfter) % this.config.interval === 0;
  }

  nextDue(currentFloor: number): number {
    const { startAfter, interval } = this.config;
    if (interval < 0) return Number.MAX_SAFE_INTEGER;
    if (interval === 0) return currentFloor < startAfter ? startAfter + 1 : currentFloor + 1;
    if (currentFloor < startAfter) return startAfter + interval;
    return startAfter + (Math.floor((currentFloor - startAfter) / interval) + 1) * interval;
  }
}
