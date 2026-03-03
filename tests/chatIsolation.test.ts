import { describe, expect, it } from 'vitest';
import { ChatIsolation } from '../src/WBM/services/worldbook/chatIsolation';
import { memoryStorage } from './helpers';

describe('ChatIsolation', () => {
  it('应记录当前聊天隔离条目并统计', () => {
    const isolation = new ChatIsolation(memoryStorage());
    isolation.setCurrentChat('chat-1');
    isolation.record('bookA', 'entryA');
    isolation.record('bookA', 'entryB');
    isolation.record('bookB', 'entryC');

    const info = isolation.getCurrentInfo('bookA');
    expect(info.chatId).toBe('chat-1');
    expect(info.count).toBe(2);

    const stats = isolation.getStats();
    expect(stats.totalChats).toBe(1);
    expect(stats.totalEntries).toBe(3);
  });

  it('应支持清理与晋升列表', () => {
    const isolation = new ChatIsolation(memoryStorage());
    isolation.setCurrentChat('chat-1');
    isolation.record('bookA', 'entryA');
    isolation.record('bookA', 'entryB');

    expect(isolation.clearMine('bookA')).toBe(2);
    expect(isolation.getCurrentInfo('bookA').count).toBe(0);

    isolation.record('bookA', 'entryA');
    isolation.setCurrentChat('chat-2');
    isolation.record('bookA', 'entryC');

    const promoted = isolation.promoteToGlobal('bookA');
    expect(promoted.sort()).toEqual(['entryA', 'entryC']);
    expect(isolation.clearAll('bookA')).toBe(2);
  });

  it('空 chat 与全量 clear 分支', () => {
    const isolation = new ChatIsolation(memoryStorage());
    expect(isolation.clearMine()).toBe(0);
    expect(isolation.clearAll()).toBe(0);

    isolation.setCurrentChat('chat-1');
    isolation.record('bookA', 'entryA');
    isolation.record('bookB', 'entryB');
    expect(isolation.promoteToGlobal().sort()).toEqual(['entryA', 'entryB']);
    expect(isolation.clearAll()).toBe(2);
  });
});
