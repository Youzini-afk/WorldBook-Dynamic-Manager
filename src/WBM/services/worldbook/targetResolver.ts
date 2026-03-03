import type { LoggerLike, ManagedFallbackPolicy, TargetType } from '../../core/types';
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

export interface ResolveBookResult {
  bookName: string;
  resolvedBy: string;
  fallbackUsed: boolean;
}

export class TargetBookResolver {
  constructor(
    private readonly logger: LoggerLike,
    private readonly api: RuntimeWorldbookApi,
  ) {}

  async resolve(
    targetType: TargetType,
    targetBookName: string,
    managedFallbackPolicy: ManagedFallbackPolicy = 'strict',
  ): Promise<string> {
    const resolved = await this.resolveDetailed(targetType, targetBookName, managedFallbackPolicy);
    return resolved.bookName;
  }

  async resolveDetailed(
    targetType: TargetType,
    targetBookName: string,
    managedFallbackPolicy: ManagedFallbackPolicy = 'strict',
  ): Promise<ResolveBookResult> {
    const preferred = targetBookName.trim();

    if (targetType === 'charPrimary') {
      if (!(await this.hasCurrentCharacter())) {
        throw new Error('未找到当前打开的角色卡，无法解析角色主世界书');
      }
      const bindings = this.tryGetCharBindings();
      if (!bindings) {
        throw new Error('角色世界书接口不可用，无法解析角色主世界书');
      }
      if (!bindings.primary) {
        throw new Error('当前角色未绑定主世界书');
      }
      return {
        bookName: bindings.primary,
        resolvedBy: 'char_primary',
        fallbackUsed: false,
      };
    }

    if (targetType === 'charAdditional') {
      if (!(await this.hasCurrentCharacter())) {
        throw new Error('未找到当前打开的角色卡，无法解析角色附加世界书');
      }
      const bindings = this.tryGetCharBindings();
      if (!bindings) {
        throw new Error('角色世界书接口不可用，无法解析角色附加世界书');
      }
      if (bindings.additional.length === 0) {
        throw new Error('当前角色未绑定附加世界书');
      }
      if (preferred) {
        const matched = bindings.additional.find(name => name === preferred);
        if (!matched) {
          throw new Error(`当前角色未绑定指定附加世界书: ${preferred}`);
        }
        return {
          bookName: matched,
          resolvedBy: 'char_additional',
          fallbackUsed: false,
        };
      }
      return {
        bookName: bindings.additional[0],
        resolvedBy: 'char_additional',
        fallbackUsed: false,
      };
    }

    if (targetType === 'global') {
      if (typeof this.api.getGlobalWorldbookNames === 'function') {
        const names = normalizeBookList(this.api.getGlobalWorldbookNames());
        if (preferred) {
          const name = preferred;
          if (!names.includes(name)) {
            throw new Error(`未找到全局世界书: ${name}`);
          }
          return {
            bookName: name,
            resolvedBy: 'global',
            fallbackUsed: false,
          };
        }
        if (names.length === 0) throw new Error('未找到可用全局世界书');
        return {
          bookName: names[0],
          resolvedBy: 'global',
          fallbackUsed: false,
        };
      }

      if (preferred) {
        this.logger.warn('全局世界书查询接口不可用，使用配置中的目标世界书名');
        return {
          bookName: preferred,
          resolvedBy: 'global_preferred',
          fallbackUsed: false,
        };
      }

      throw new Error('全局世界书查询接口不可用，且未配置目标世界书名');
    }

    return this.resolveManaged(preferred, managedFallbackPolicy);
  }

  private async hasCurrentCharacter(): Promise<boolean> {
    if (typeof this.api.getCurrentCharacterName === 'function') {
      try {
        const currentName = normalizeBookName(this.api.getCurrentCharacterName());
        return currentName != null;
      } catch (error) {
        this.logger.warn('读取当前角色卡名称失败', error);
        // 若宿主提供了该接口但调用失败，不再继续使用次级接口“猜测”角色状态。
        return false;
      }
    }

    if (typeof this.api.getCharacter === 'function') {
      try {
        await this.api.getCharacter('current');
        return true;
      } catch (error) {
        this.logger.warn('读取当前角色卡内容失败', error);
      }
    }

    if (typeof this.api.getCharWorldbookNames === 'function') {
      try {
        const bindings = this.readCurrentCharWorldbookNames();
        return bindings != null;
      } catch (error) {
        this.logger.warn('读取当前角色世界书失败', error);
      }
    }

    return false;
  }

  private tryGetCharBindings(): CharBindings | null {
    const raw = this.readCurrentCharWorldbookNames();
    if (!raw) return null;
    return {
      primary: normalizeBookName(raw.primary),
      additional: normalizeBookList(raw.additional),
    };
  }

  private tryGetChatWorldbookName(): string | null {
    if (typeof this.api.getChatWorldbookName !== 'function') return null;
    const getter = this.api.getChatWorldbookName as (chat_name?: 'current') => string | null;
    try {
      return normalizeBookName(getter('current'));
    } catch {
      try {
        return normalizeBookName(getter());
      } catch (error) {
        this.logger.warn('读取当前聊天绑定世界书失败', error);
        return null;
      }
    }
  }

  private readCurrentCharWorldbookNames():
    | { primary?: unknown; additional?: unknown }
    | null {
    if (typeof this.api.getCharWorldbookNames !== 'function') return null;
    const getter = this.api.getCharWorldbookNames as (
      character_name?: 'current' | string,
    ) => { primary?: unknown; additional?: unknown };
    try {
      return getter('current');
    } catch {
      try {
        return getter();
      } catch (error) {
        this.logger.warn('读取当前角色世界书失败', error);
        return null;
      }
    }
  }

  private async resolveManaged(
    targetBookName: string,
    managedFallbackPolicy: ManagedFallbackPolicy,
  ): Promise<ResolveBookResult> {
    const preferred = targetBookName || undefined;
    const hasCharacter = await this.hasCurrentCharacter();

    if (!hasCharacter) {
      throw new Error('未找到当前打开的角色卡，托管模式无法解析世界书');
    }

    const existing = this.tryGetChatWorldbookName();
    if (existing) {
      return {
        bookName: existing,
        resolvedBy: 'managed_chat_binding',
        fallbackUsed: false,
      };
    }

    if (typeof this.api.getOrCreateChatWorldbook === 'function') {
      const getOrCreate = this.api.getOrCreateChatWorldbook as (
        chat_name?: 'current',
        worldbook_name?: string,
      ) => Promise<string>;
      let created: string;
      try {
        created = await getOrCreate('current', preferred);
      } catch {
        created = await getOrCreate(undefined, preferred);
      }

      if (typeof this.api.rebindChatWorldbook === 'function') {
        const rebind = this.api.rebindChatWorldbook as (
          chat_name?: 'current',
          worldbook_name?: string,
        ) => Promise<void>;
        try {
          await rebind('current', created);
        } catch {
          await rebind(undefined, created);
        }
      } else {
        this.logger.warn('托管模式创建成功，但聊天绑定接口不可用');
      }
      return {
        bookName: created,
        resolvedBy: 'managed_create_or_get',
        fallbackUsed: false,
      };
    }

    if (managedFallbackPolicy === 'strict') {
      if (preferred) {
        this.logger.warn(`strict 模式下忽略配置目标世界书名: ${preferred}`);
      }
      throw new Error('托管模式接口不可用，且 strict 策略禁止回退世界书');
    }

    if (preferred) {
      this.logger.warn(`托管接口不可用，fallback 模式忽略配置目标世界书名: ${preferred}`);
    }

    const bindings = this.tryGetCharBindings();
    if (bindings?.primary) {
      this.logger.warn('托管模式接口不可用，已回退到角色主世界书');
      return {
        bookName: bindings.primary,
        resolvedBy: 'fallback_char_primary',
        fallbackUsed: true,
      };
    }
    if (bindings?.additional.length) {
      this.logger.warn('托管模式接口不可用，已回退到角色附加世界书');
      return {
        bookName: bindings.additional[0],
        resolvedBy: 'fallback_char_additional',
        fallbackUsed: true,
      };
    }

    throw new Error('当前角色未绑定可用世界书，且托管模式接口不可用');
  }
}
