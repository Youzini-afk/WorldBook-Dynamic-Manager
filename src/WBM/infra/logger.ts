import type { LoggerLike } from '../core/types';

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogRecord {
  level: LogLevel;
  namespace: string;
  message: string;
  extra?: unknown;
  time: string;
}

type LogSink = (record: LogRecord) => void;

const LEVEL_RANK: Record<LogLevel, number> = {
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger implements LoggerLike {
  constructor(
    private readonly namespace: string,
    private level: LogLevel = 'info',
    private readonly sink?: LogSink,
  ) {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[this.level];
  }

  private emit(level: LogLevel, message: string, extra?: unknown): void {
    this.sink?.({
      level,
      namespace: this.namespace,
      message,
      extra,
      time: new Date().toISOString(),
    });
  }

  info(message: string, extra?: unknown): void {
    if (!this.shouldLog('info')) return;
    this.emit('info', message, extra);
    if (extra === undefined) console.log(`[${this.namespace}] ${message}`);
    else console.log(`[${this.namespace}] ${message}`, extra);
  }

  warn(message: string, extra?: unknown): void {
    if (!this.shouldLog('warn')) return;
    this.emit('warn', message, extra);
    if (extra === undefined) console.warn(`[${this.namespace}] ${message}`);
    else console.warn(`[${this.namespace}] ${message}`, extra);
  }

  error(message: string, extra?: unknown): void {
    if (!this.shouldLog('error')) return;
    this.emit('error', message, extra);
    if (extra === undefined) console.error(`[${this.namespace}] ${message}`);
    else console.error(`[${this.namespace}] ${message}`, extra);
  }
}
