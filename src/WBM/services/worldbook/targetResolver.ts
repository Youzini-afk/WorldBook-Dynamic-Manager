import type { LoggerLike, TargetType } from '../../core/types';
import type { RuntimeWorldbookApi } from '../../infra/runtime/types';

function normalizeBookName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBookList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => normalizeBookName(item))
    .filter((item): item is string => item != null);
}

type CharBindings = {
  primary: string | null;
  additional: string[];
};

export class TargetBookResolver {
  constructor(
    private readonly logger: LoggerLike,
    private readonly api: RuntimeWorldbookApi,
  ) {}

  async resolve(targetType: TargetType, targetBookName: string): Promise<string> {
    const preferred = targetBookName.trim();
    if (preferred && targetType !== 'global' && targetType !== 'managed') {
      return preferred;
    }

    if (targetType === 'charPrimary') {
      const bindings = this.tryGetCharBindings();
      if (bindings?.primary) return bindings.primary;

      const chatBound = this.tryGetChatWorldbookName();
      if (chatBound) {
        this.logger.warn('当前角色主世界书不可解析，已回退到聊天绑定世界书');
        return chatBound;
      }

      if (bindings?.additional.length) {
        this.logger.warn('当前角色主世界书缺失，已回退到附加世界书');
        return bindings.additional[0];
      }

      const fallback = this.tryGetAnyAvailableWorldbook();
      if (fallback) {
        this.logger.warn(`当前角色主世界书不可用，已回退到可用世界书: ${fallback}`);
        return fallback;
      }

      throw new Error('当前角色未绑定主世界书，且无法解析可用目标世界书');
    }

    if (targetType === 'charAdditional') {
      if (preferred) return preferred;

      const bindings = this.tryGetCharBindings();
      if (bindings?.additional.length) return bindings.additional[0];
      if (bindings?.primary) {
        this.logger.warn('当前角色未绑定附加世界书，已回退到主世界书');
        return bindings.primary;
      }

      const chatBound = this.tryGetChatWorldbookName();
      if (chatBound) {
        this.logger.warn('当前角色附加世界书不可解析，已回退到聊天绑定世界书');
        return chatBound;
      }

      const fallback = this.tryGetAnyAvailableWorldbook();
      if (fallback) {
        this.logger.warn(`当前角色附加世界书不可用，已回退到可用世界书: ${fallback}`);
        return fallback;
      }

      throw new Error('当前角色未绑定附加世界书，且无法解析可用目标世界书');
    }

    if (targetType === 'global') {
      if (typeof this.api.getGlobalWorldbookNames === 'function') {
        const names = normalizeBookList(this.api.getGlobalWorldbookNames());
        if (preferred) {
          const name = preferred;
          if (!names.includes(name)) {
            throw new Error(`未找到全局世界书: ${name}`);
          }
          return name;
        }
        if (names.length === 0) throw new Error('未找到可用全局世界书');
        return names[0];
      }

      if (preferred) {
        this.logger.warn('全局世界书查询接口不可用，使用配置中的目标世界书名');
        return preferred;
      }

      const fallback = this.tryGetAnyAvailableWorldbook();
      if (fallback) {
        this.logger.warn(`全局世界书查询接口不可用，已回退到可用世界书: ${fallback}`);
        return fallback;
      }

      throw new Error('全局世界书查询接口不可用');
    }

    return this.resolveManaged(preferred);
  }

  private tryGetCharBindings(): CharBindings | null {
    if (typeof this.api.getCharWorldbookNames !== 'function') return null;
    try {
      const raw = this.api.getCharWorldbookNames('current');
      return {
        primary: normalizeBookName(raw?.primary),
        additional: normalizeBookList(raw?.additional),
      };
    } catch (error) {
      this.logger.warn('读取当前角色世界书失败', error);
      return null;
    }
  }

  private tryGetChatWorldbookName(): string | null {
    if (typeof this.api.getChatWorldbookName !== 'function') return null;
    try {
      return normalizeBookName(this.api.getChatWorldbookName('current'));
    } catch (error) {
      this.logger.warn('读取当前聊天绑定世界书失败', error);
      return null;
    }
  }

  private tryGetAnyAvailableWorldbook(): string | null {
    if (typeof this.api.getWorldbookNames === 'function') {
      try {
        const names = normalizeBookList(this.api.getWorldbookNames());
        if (names.length > 0) return names[0];
      } catch (error) {
        this.logger.warn('读取世界书列表失败', error);
      }
    }

    if (typeof this.api.getGlobalWorldbookNames === 'function') {
      try {
        const names = normalizeBookList(this.api.getGlobalWorldbookNames());
        if (names.length > 0) return names[0];
      } catch (error) {
        this.logger.warn('读取全局世界书列表失败', error);
      }
    }

    return null;
  }

  private async resolveManaged(targetBookName: string): Promise<string> {
    const preferred = targetBookName || undefined;

    const existing = this.tryGetChatWorldbookName();
    if (existing) return existing;

    if (typeof this.api.getOrCreateChatWorldbook === 'function') {
      const created = await this.api.getOrCreateChatWorldbook('current', preferred);
      if (typeof this.api.rebindChatWorldbook === 'function') {
        await this.api.rebindChatWorldbook('current', created);
      } else {
        this.logger.warn('托管模式创建成功，但聊天绑定接口不可用');
      }
      return created;
    }

    if (preferred) {
      this.logger.warn('托管模式接口不可用，使用配置中的目标世界书名');
      return preferred;
    }

    const bindings = this.tryGetCharBindings();
    if (bindings?.primary) {
      this.logger.warn('托管模式接口不可用，已回退到角色主世界书');
      return bindings.primary;
    }
    if (bindings?.additional.length) {
      this.logger.warn('托管模式接口不可用，已回退到角色附加世界书');
      return bindings.additional[0];
    }

    const fallback = this.tryGetAnyAvailableWorldbook();
    if (fallback) {
      this.logger.warn(`托管模式接口不可用，已回退到可用世界书: ${fallback}`);
      return fallback;
    }

    throw new Error('托管模式接口不可用');
  }
}
