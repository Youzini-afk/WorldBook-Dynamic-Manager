import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventSubscriptions } from '../src/WBM/infra/events';
import { noopLogger } from './helpers';

type MutableGlobal = typeof globalThis & Record<string, unknown>;

afterEach(() => {
  const g = globalThis as MutableGlobal;
  Reflect.deleteProperty(g, 'eventOn');
  vi.restoreAllMocks();
});

describe('EventSubscriptions', () => {
  it('优先使用 eventOn，并可 clear 解绑', () => {
    const stop = vi.fn();
    const eventOn = vi.fn().mockReturnValue({ stop });
    (globalThis as MutableGlobal).eventOn = eventOn;

    const events = new EventSubscriptions(null, noopLogger);
    events.on('message_received', () => undefined);
    expect(eventOn).toHaveBeenCalled();
    events.clear();
    expect(stop).toHaveBeenCalled();
  });

  it('eventOn 不可用时降级到 source.on/off', () => {
    const on = vi.fn();
    const off = vi.fn();
    const events = new EventSubscriptions({ on, off }, noopLogger);
    const listener = () => undefined;
    events.on('chat_changed', listener);
    expect(on).toHaveBeenCalledWith('chat_changed', listener);
    events.clear();
    expect(off).toHaveBeenCalledWith('chat_changed', listener);
  });

  it('eventOn 抛错时会降级到 source.on/off', () => {
    const eventOn = vi.fn(() => {
      throw new Error('boom');
    });
    (globalThis as MutableGlobal).eventOn = eventOn;
    const on = vi.fn();
    const off = vi.fn();

    const events = new EventSubscriptions({ on, off }, noopLogger);
    const listener = () => undefined;
    events.on('message_deleted', listener);
    expect(on).toHaveBeenCalledWith('message_deleted', listener);
    events.clear();
    expect(off).toHaveBeenCalledWith('message_deleted', listener);
  });
});
