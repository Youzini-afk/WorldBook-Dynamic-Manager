import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeWorldbookApi } from '../src/WBM/infra/runtime/types';
import { TargetBookResolver } from '../src/WBM/services/worldbook/targetResolver';
import { noopLogger } from './helpers';

type MutableGlobal = typeof globalThis & Record<string, unknown>;

function clearApis(): void {
  const g = globalThis as MutableGlobal;
  delete g.getCurrentCharacterName;
  delete g.getCharacter;
  delete g.getCharWorldbookNames;
  delete g.getGlobalWorldbookNames;
  delete g.getWorldbookNames;
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
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色A');
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书A', additional: ['附加1'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charPrimary', '')).resolves.toBe('主书A');
  });

  it('charPrimary 无主书时抛错', async () => {
    const g = globalThis as MutableGlobal;
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色A');
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: null, additional: [] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charPrimary', '')).rejects.toThrow('未绑定主世界书');
  });

  it('charAdditional 在未指定时取第一个附加书', async () => {
    const g = globalThis as MutableGlobal;
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色A');
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书A', additional: ['附加1', '附加2'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charAdditional', '')).resolves.toBe('附加1');
  });

  it('global 模式会验证名称存在性', async () => {
    const g = globalThis as MutableGlobal;
    g.getGlobalWorldbookNames = vi.fn().mockReturnValue(['全球A']);
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('global', '全球A')).resolves.toBe('全球A');
    await expect(resolver.resolve('global', '不存在')).rejects.toThrow('未找到全局世界书');
  });

  it('charPrimary 在未打开角色卡时应报错，不回退到其他世界书', async () => {
    const g = globalThis as MutableGlobal;
    g.getCurrentCharacterName = vi.fn().mockReturnValue(null);
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charPrimary', '')).rejects.toThrow('未找到当前打开的角色卡');
  });

  it('charPrimary 会严格返回角色主世界书，不使用手动目标名覆盖', async () => {
    const g = globalThis as MutableGlobal;
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色B');
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书B', additional: ['附加B'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charPrimary', '手动指定书名')).resolves.toBe('主书B');
  });

  it('charAdditional 指定目标书名时必须是当前角色已绑定的附加书', async () => {
    const g = globalThis as MutableGlobal;
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色C');
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书C', additional: ['附加C1', '附加C2'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charAdditional', '附加C2')).resolves.toBe('附加C2');
    await expect(resolver.resolve('charAdditional', '不存在附加书')).rejects.toThrow('未绑定指定附加世界书');
  });

  it('charAdditional 在未打开角色卡时应报错', async () => {
    const g = globalThis as MutableGlobal;
    g.getCurrentCharacterName = vi.fn().mockReturnValue('');
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书D', additional: ['附加D'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charAdditional', '')).rejects.toThrow('未找到当前打开的角色卡');
  });

  it('缺少 getCurrentCharacterName 时可回退到 getCharacter 校验角色存在', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharacter = vi.fn().mockResolvedValue({ name: '角色E' });
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书E', additional: [] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charPrimary', '')).resolves.toBe('主书E');
  });

  it('当 getCurrentCharacterName 明确返回空时，不应再回退 getCharacter 误判', async () => {
    const g = globalThis as MutableGlobal;
    g.getCurrentCharacterName = vi.fn().mockReturnValue('');
    g.getCharacter = vi.fn().mockResolvedValue({ name: '角色E' });
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '主书E', additional: [] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charPrimary', '')).rejects.toThrow('未找到当前打开的角色卡');
  });

  it('角色校验 API 全缺失时，char 模式应拒绝拉取', async () => {
    const resolver = new TargetBookResolver(noopLogger, {} satisfies RuntimeWorldbookApi);
    await expect(resolver.resolve('charPrimary', '')).rejects.toThrow('未找到当前打开的角色卡');
  });

  it('仅有 getCharWorldbookNames 且返回空绑定时，也应识别为已打开角色卡', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: null, additional: [] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('charPrimary', '')).rejects.toThrow('未绑定主世界书');
  });

  it('managed 模式会在未绑定时创建并回绑', async () => {
    const g = globalThis as MutableGlobal;
    const getChatWorldbookName = vi.fn().mockReturnValue(null);
    const getOrCreateChatWorldbook = vi.fn().mockResolvedValue('聊天托管书');
    const rebindChatWorldbook = vi.fn().mockResolvedValue(undefined);
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色F');
    g.getChatWorldbookName = getChatWorldbookName;
    g.getOrCreateChatWorldbook = getOrCreateChatWorldbook;
    g.rebindChatWorldbook = rebindChatWorldbook;
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '')).resolves.toBe('聊天托管书');
    expect(rebindChatWorldbook).toHaveBeenCalledWith('current', '聊天托管书');
  });

  it('managed 回绑 current 失败时应降级尝试无参数回绑', async () => {
    const g = globalThis as MutableGlobal;
    const getChatWorldbookName = vi.fn().mockReturnValue(null);
    const getOrCreateChatWorldbook = vi.fn().mockResolvedValue('聊天托管书');
    const rebindChatWorldbook = vi
      .fn()
      .mockRejectedValueOnce(new Error('current failed'))
      .mockResolvedValueOnce(undefined);
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色F');
    g.getChatWorldbookName = getChatWorldbookName;
    g.getOrCreateChatWorldbook = getOrCreateChatWorldbook;
    g.rebindChatWorldbook = rebindChatWorldbook;

    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '')).resolves.toBe('聊天托管书');
    expect(rebindChatWorldbook).toHaveBeenNthCalledWith(1, 'current', '聊天托管书');
    expect(rebindChatWorldbook).toHaveBeenNthCalledWith(2, undefined, '聊天托管书');
  });

  it('managed 在缺少回绑接口时仍应返回创建结果', async () => {
    const g = globalThis as MutableGlobal;
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色F');
    g.getChatWorldbookName = vi.fn().mockReturnValue(null);
    g.getOrCreateChatWorldbook = vi.fn().mockResolvedValue('聊天托管书');
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '')).resolves.toBe('聊天托管书');
  });

  it('managed 已绑定时直接复用', async () => {
    const g = globalThis as MutableGlobal;
    const getChatWorldbookName = vi.fn().mockReturnValue('已绑定');
    const getOrCreateChatWorldbook = vi.fn();
    g.getCurrentCharacterName = vi.fn().mockReturnValue('角色G');
    g.getChatWorldbookName = getChatWorldbookName;
    g.getOrCreateChatWorldbook = getOrCreateChatWorldbook;
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '')).resolves.toBe('已绑定');
    expect(getOrCreateChatWorldbook).not.toHaveBeenCalled();
  });

  it('global 接口缺失但有指定名称时直接返回指定值', async () => {
    const resolver = new TargetBookResolver(noopLogger, {} satisfies RuntimeWorldbookApi);
    await expect(resolver.resolve('global', '全局直连')).resolves.toBe('全局直连');
  });

  it('global 接口缺失且未配置目标名时应报错，不回退任意世界书', async () => {
    const resolver = new TargetBookResolver(noopLogger, {} satisfies RuntimeWorldbookApi);
    await expect(resolver.resolve('global', '')).rejects.toThrow('全局世界书查询接口不可用');
  });

  it('managed strict 策略下，即使有配置名也不允许回退', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '角色主书', additional: ['附加书'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '托管直连', 'strict')).rejects.toThrow('strict 策略禁止回退');
  });

  it('managed fallback 策略会忽略配置名并回退角色主世界书', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '角色主书', additional: ['附加书'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '托管直连', 'fallback')).resolves.toBe('角色主书');
  });

  it('managed 接口缺失时回退到角色主世界书', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '角色主书', additional: [] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '', 'fallback')).resolves.toBe('角色主书');
  });

  it('managed 接口缺失时回退到角色附加世界书', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: null, additional: ['角色附加书'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '', 'fallback')).resolves.toBe('角色附加书');
  });

  it('managed 接口缺失且无角色卡时应报错，不回退任意世界书', async () => {
    const resolver = new TargetBookResolver(noopLogger, {} satisfies RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '')).rejects.toThrow('未找到当前打开的角色卡');
  });

  it('managed 无任何可用回退时抛错', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: null, additional: [] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '', 'fallback')).rejects.toThrow('当前角色未绑定可用世界书');
  });

  it('managed strict 策略在接口缺失时不允许回退', async () => {
    const g = globalThis as MutableGlobal;
    g.getCharWorldbookNames = vi.fn().mockReturnValue({ primary: '角色主书', additional: ['附加书'] });
    const resolver = new TargetBookResolver(noopLogger, g as RuntimeWorldbookApi);
    await expect(resolver.resolve('managed', '', 'strict')).rejects.toThrow('strict 策略禁止回退');
  });
});
