import type { LoggerLike } from '../core/types';

type StopFn = () => void;

interface EventSourceLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
}

export class EventSubscriptions {
  private readonly stops: StopFn[] = [];

  constructor(
    private readonly source: EventSourceLike | null,
    private readonly logger: LoggerLike,
  ) {}

  on(event: string, listener: (...args: unknown[]) => void): void {
    if (!this.source) {
      this.logger.warn(`event source unavailable: ${event}`);
      return;
    }
    this.source.on(event, listener);
    this.stops.push(() => {
      try {
        this.source?.off?.(event, listener);
      } catch (error) {
        this.logger.warn(`failed to unbind event: ${event}`, error);
      }
    });
  }

  clear(): void {
    while (this.stops.length > 0) {
      const stop = this.stops.pop();
      if (!stop) continue;
      stop();
    }
  }
}
