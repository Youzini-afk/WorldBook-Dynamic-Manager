import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapWbmV3, unloadWbmV3 } from '../src/WBM/index';
import { memoryStorage } from './helpers';

interface RuntimeGlobal {
  window?: RuntimeGlobal;
  localStorage?: ReturnType<typeof memoryStorage>;
  WBM3?: unknown;
  WBM?: unknown;
  WorldBookManager?: unknown;
}

const runtime = globalThis as unknown as RuntimeGlobal;

describe('bootstrap lifecycle', () => {
  afterEach(() => {
    unloadWbmV3();
    delete runtime.WBM3;
    delete runtime.WBM;
    delete runtime.WorldBookManager;
    delete runtime.window;
    delete runtime.localStorage;
  });

  it('重复 bootstrap 不应抛错，且应维持 API 挂载', () => {
    runtime.window = runtime;
    runtime.localStorage = memoryStorage();

    expect(() => bootstrapWbmV3()).not.toThrow();
    const firstApi = runtime.WBM3;
    expect(firstApi).toBeDefined();

    expect(() => bootstrapWbmV3()).not.toThrow();
    const secondApi = runtime.WBM3;
    expect(secondApi).toBeDefined();
  });

  it('重复 unload 不应抛错', () => {
    runtime.window = runtime;
    runtime.localStorage = memoryStorage();
    bootstrapWbmV3();

    expect(() => unloadWbmV3()).not.toThrow();
    expect(() => unloadWbmV3()).not.toThrow();
  });

  it('应注册角色切换相关事件，避免角色切换后目标世界书不刷新', () => {
    const subscribedEvents: string[] = [];
    const source = {
      window: {} as Record<string, unknown>,
      localStorage: memoryStorage(),
      eventOn: (eventType: string, _listener: (...args: unknown[]) => void) => {
        subscribedEvents.push(eventType);
        return { stop: () => undefined };
      },
      tavern_events: {
        MESSAGE_RECEIVED: 'message_received',
        MESSAGE_SENT: 'message_sent',
        MESSAGE_DELETED: 'message_deleted',
        CHAT_CHANGED: 'chat_id_changed',
        CHARACTER_PAGE_LOADED: 'character_page_loaded',
        CHARACTER_EDITED: 'character_edited',
        CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected',
      },
    };

    expect(() => bootstrapWbmV3(source)).not.toThrow();
    expect(subscribedEvents).toContain('character_page_loaded');
    expect(subscribedEvents).toContain('character_edited');
    expect(subscribedEvents).toContain('character_first_message_selected');
  });
});
