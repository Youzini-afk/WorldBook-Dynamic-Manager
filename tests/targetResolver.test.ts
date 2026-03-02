import { afterEach, describe, expect, it, vi } from 'vitest';
import { TargetBookResolver } from '../src/WBM/services/worldbook/targetResolver';
import { noopLogger } from './helpers';

type MutableGlobal = typeof globalThis & Record<string, unknown>;

function clearApis(): void {
  const g = globalThis as MutableGlobal;
  delete g.getCharWorldbookNames;
  delete g.getGlobalWorldbookNames;
  delete g.getChatWorldbookName;
  delete g.getOrCreateChatWorldbook;
  delete g.rebindChatWorldbook;
}

afterEach(() => {
  clearApis();
  vi.restoreAllMocks();
});

describe('TargetBookResolver', () => {
  it('charPrimary 返回当前角色主书', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书A', additional: ['附加1'] });
    const resolver = new TargetBookResolver(noopLogger);
    await expect(resolver.resolve('charPrimary', '')).resolves.toBe('主书A');
  });

  it('charPrimary 无主书时抛错', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: null, additional: [] });
    const resolver = new TargetBookResolver(noopLogger);
    await expect(resolver.resolve('charPrimary', '')).rejects.toThrow('未绑定主世界书');
  });

  it('charAdditional 在未指定时取第一个附加书', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书A', additional: ['附加1', '附加2'] });
    const resolver = new TargetBookResolver(noopLogger);
    await expect(resolver.resolve('charAdditional', '')).resolves.toBe('附加1');
  });

  it('global 模式会验证名称存在性', async () => {
    const g = globalThis as MutableGlobal;
    g.getGlobalWorldbookNames = vi.fn().mockReturnValue(['全球A']);
    const resolver = new TargetBookResolver(noopLogger);
    await expect(resolver.resolve('global', '全球A')).resolves.toBe('全球A');
    await expect(resolver.resolve('global', '不存在')).rejects.toThrow('未找到全局世界书');
  });

  it('managed 模式会在未绑定时创建并回绑', async () => {
    const g = globalThis as MutableGlobal;
    const getChatWorldbookName = vi.fn().mockReturnValue(null);
    const getOrCreateChatWorldbook = vi.fn().mockResolvedValue('聊天托管书');
    const rebindChatWorldbook = vi.fn().mockResolvedValue(undefined);
    g.getChatWorldbookName = getChatWorldbookName;
    g.getOrCreateChatWorldbook = getOrCreateChatWorldbook;
    g.rebindChatWorldbook = rebindChatWorldbook;
    const resolver = new TargetBookResolver(noopLogger);
    await expect(resolver.resolve('managed', '')).resolves.toBe('聊天托管书');
    expect(rebindChatWorldbook).toHaveBeenCalledWith('current', '聊天托管书');
  });

  it('managed 已绑定时直接复用', async () => {
    const g = globalThis as MutableGlobal;
    const getChatWorldbookName = vi.fn().mockReturnValue('已绑定');
    const getOrCreateChatWorldbook = vi.fn();
    g.getChatWorldbookName = getChatWorldbookName;
    g.getOrCreateChatWorldbook = getOrCreateChatWorldbook;
    const resolver = new TargetBookResolver(noopLogger);
    await expect(resolver.resolve('managed', '')).resolves.toBe('已绑定');
    expect(getOrCreateChatWorldbook).not.toHaveBeenCalled();
  });
});
