import type { LoggerLike } from '../core/types';

type StopFn = () => void;

declare const eventOn:
  | ((eventType: string, listener: (...args: unknown[]) => void) => { stop: () => void })
  | undefined;

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
    if (typeof eventOn === 'function') {
      const binding = eventOn(event, listener);
      this.stops.push(() => {
        try {
          binding.stop();
        } catch (error) {
          this.logger.warn(`eventOn stop 失败: ${event}`, error);
        }
      });
      return;
    }

    if (!this.source) {
      this.logger.warn(`事件源不可用，且 eventOn 不可用: ${event}`);
      return;
    }
    this.source.on(event, listener);
    this.stops.push(() => {
      try {
        this.source?.off?.(event, listener);
      } catch (error) {
        this.logger.warn(`解绑事件失败: ${event}`, error);
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
