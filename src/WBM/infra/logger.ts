import type { LoggerLike } from '../core/types';

export class Logger implements LoggerLike {
  constructor(private readonly namespace: string) {}

  info(message: string, extra?: unknown): void {
    if (extra === undefined) console.log(`[${this.namespace}] ${message}`);
    else console.log(`[${this.namespace}] ${message}`, extra);
  }

  warn(message: string, extra?: unknown): void {
    if (extra === undefined) console.warn(`[${this.namespace}] ${message}`);
    else console.warn(`[${this.namespace}] ${message}`, extra);
  }

  error(message: string, extra?: unknown): void {
    if (extra === undefined) console.error(`[${this.namespace}] ${message}`);
    else console.error(`[${this.namespace}] ${message}`, extra);
  }
}
