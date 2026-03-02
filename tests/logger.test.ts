import { describe, expect, it, vi } from 'vitest';
import { Logger } from '../src/WBM/infra/logger';

describe('Logger', () => {
  it('warn 级别会屏蔽 info 但保留 warn/error', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const logger = new Logger('WBM3', 'warn');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('setLevel 可动态调整日志级别', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new Logger('WBM3', 'error');
    logger.info('no');
    logger.setLevel('info');
    logger.info('yes');
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('支持 sink 收集日志记录', () => {
    const records: Array<{ level: string; message: string }> = [];
    const logger = new Logger('WBM3', 'warn', record => {
      records.push({ level: record.level, message: record.message });
    });

    logger.info('ignore');
    logger.warn('warn');
    logger.error('error');

    expect(records).toEqual([
      { level: 'warn', message: 'warn' },
      { level: 'error', message: 'error' },
    ]);
  });
});
