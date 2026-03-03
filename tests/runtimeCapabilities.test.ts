import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeCapabilities,
  detectRuntimeHealth,
  getRuntimeEventName,
} from '../src/WBM/infra/runtime';

describe('runtime capabilities', () => {
  it('应探测高层后端、事件与挂载能力', () => {
    const runtime = createRuntimeCapabilities({
      getWorldbook: vi.fn(),
      createWorldbookEntries: vi.fn(),
      updateWorldbookWith: vi.fn(),
      deleteWorldbookEntries: vi.fn(),
      rebindGlobalWorldbooks: vi.fn(),
      eventOn: vi.fn(),
      document: {},
      tavern_events: {
        MESSAGE_RECEIVED: 'msg_recv',
      },
    });

    const health = detectRuntimeHealth(runtime);
    expect(health.backendAvailable).toBe(true);
    expect(health.highLevelWorldbook).toBe(true);
    expect(health.eventSourceAvailable).toBe(true);
    expect(health.mountAvailable).toBe(true);
    expect(typeof runtime.worldbook.rebindGlobalWorldbooks).toBe('function');
    expect(getRuntimeEventName(runtime, 'MESSAGE_RECEIVED', 'message_received')).toBe('msg_recv');
  });

  it('能力缺失时应返回不可用状态并使用事件名回退', () => {
    const runtime = createRuntimeCapabilities({});
    const health = detectRuntimeHealth(runtime);
    expect(health.backendAvailable).toBe(false);
    expect(health.eventSourceAvailable).toBe(false);
    expect(health.mountAvailable).toBe(false);
    expect(getRuntimeEventName(runtime, 'MESSAGE_SENT', 'message_sent')).toBe('message_sent');
  });
});
