import type { LoggerLike } from '../core/types';

type LogLevel = 'info' | 'warn' | 'error';
const LEVEL_RANK: Record<LogLevel, number> = {
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger implements LoggerLike {
  constructor(
    private readonly namespace: string,
    private level: LogLevel = 'info',
  ) {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[this.level];
  }

  info(message: string, extra?: unknown): void {
    if (!this.shouldLog('info')) return;
    if (extra === undefined) console.log(`[${this.namespace}] ${message}`);
    else console.log(`[${this.namespace}] ${message}`, extra);
  }

  warn(message: string, extra?: unknown): void {
    if (!this.shouldLog('warn')) return;
    if (extra === undefined) console.warn(`[${this.namespace}] ${message}`);
    else console.warn(`[${this.namespace}] ${message}`, extra);
  }

  error(message: string, extra?: unknown): void {
    if (!this.shouldLog('error')) return;
    if (extra === undefined) console.error(`[${this.namespace}] ${message}`);
    else console.error(`[${this.namespace}] ${message}`, extra);
  }
}
