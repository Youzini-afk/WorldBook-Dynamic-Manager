import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectRecentChatMessages } from '../src/WBM/services/review/messageCollector';

type MutableGlobal = typeof globalThis & Record<string, unknown>;

afterEach(() => {
  const g = globalThis as MutableGlobal;
  Reflect.deleteProperty(g, 'getChatMessages');
  vi.restoreAllMocks();
});

describe('messageCollector', () => {
  it('在接口不可用时返回空数组', () => {
    expect(collectRecentChatMessages(10)).toEqual([]);
  });

  it('能过滤隐藏消息与空消息，并标准化结果', () => {
    const g = globalThis as MutableGlobal;
    const getChatMessages = vi.fn().mockReturnValue([
      { role: 'system', message: 'sys' },
      { role: 'assistant', message: '  ' },
      { role: 'assistant', message: 'reply', is_hidden: true },
      { role: 'user', content: 'hi' },
      { role: 'tool', message: 'ignored' },
    ]);
    g.getChatMessages = getChatMessages;

    const result = collectRecentChatMessages(5);
    expect(getChatMessages).toHaveBeenCalledWith(-5, {
      role: 'all',
      hide_state: 'unhidden',
      include_swipes: false,
    });
    expect(result).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);
  });
});
