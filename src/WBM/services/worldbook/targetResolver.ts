import type { LoggerLike, TargetType } from '../../core/types';

type RuntimeApi = {
  getCharWorldbookNames?: (character_name: 'current' | string) => { primary: string | null; additional: string[] };
  getGlobalWorldbookNames?: () => string[];
  getChatWorldbookName?: (chat_name: 'current') => string | null;
  getOrCreateChatWorldbook?: (chat_name: 'current', worldbook_name?: string) => Promise<string>;
  rebindChatWorldbook?: (chat_name: 'current', worldbook_name: string) => Promise<void>;
};

function runtimeApi(): RuntimeApi {
  return globalThis as RuntimeApi;
}

export class TargetBookResolver {
  constructor(private readonly logger: LoggerLike) {}

  async resolve(targetType: TargetType, targetBookName: string): Promise<string> {
    const api = runtimeApi();
    if (targetType === 'charPrimary') {
      if (typeof api.getCharWorldbookNames !== 'function') {
        throw new Error('角色世界书查询接口不可用');
      }
      const books = api.getCharWorldbookNames('current');
      if (!books.primary) throw new Error('当前角色未绑定主世界书');
      return books.primary;
    }

    if (targetType === 'charAdditional') {
      if (typeof api.getCharWorldbookNames !== 'function') {
        throw new Error('角色世界书查询接口不可用');
      }
      const books = api.getCharWorldbookNames('current');
      if (targetBookName.trim()) return targetBookName.trim();
      if (books.additional.length === 0) throw new Error('当前角色未绑定附加世界书');
      return books.additional[0];
    }

    if (targetType === 'global') {
      if (typeof api.getGlobalWorldbookNames !== 'function') {
        throw new Error('全局世界书查询接口不可用');
      }
      const names = api.getGlobalWorldbookNames();
      if (targetBookName.trim()) {
        const name = targetBookName.trim();
        if (!names.includes(name)) {
          throw new Error(`未找到全局世界书: ${name}`);
        }
        return name;
      }
      if (names.length === 0) throw new Error('未找到可用全局世界书');
      return names[0];
    }

    return this.resolveManaged(targetBookName);
  }

  private async resolveManaged(targetBookName: string): Promise<string> {
    const api = runtimeApi();
    const preferred = targetBookName.trim() || undefined;
    if (typeof api.getChatWorldbookName === 'function') {
      const existing = api.getChatWorldbookName('current');
      if (existing) return existing;
    }

    if (typeof api.getOrCreateChatWorldbook !== 'function') {
      throw new Error('托管模式接口不可用');
    }

    const created = await api.getOrCreateChatWorldbook('current', preferred);
    if (typeof api.rebindChatWorldbook === 'function') {
      await api.rebindChatWorldbook('current', created);
    } else {
      this.logger.warn('托管模式创建成功，但聊天绑定接口不可用');
    }
    return created;
  }
}
