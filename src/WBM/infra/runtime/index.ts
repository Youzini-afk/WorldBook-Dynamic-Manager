import type { RuntimeCapabilities, RuntimeEventSourceLike, RuntimeHealth } from './types';

interface RuntimeGlobal {
  window?: Window;
  document?: Document;
  fetch?: typeof fetch;

  getWorldbook?: RuntimeCapabilities['worldbook']['getWorldbook'];
  createWorldbookEntries?: RuntimeCapabilities['worldbook']['createWorldbookEntries'];
  updateWorldbookWith?: RuntimeCapabilities['worldbook']['updateWorldbookWith'];
  deleteWorldbookEntries?: RuntimeCapabilities['worldbook']['deleteWorldbookEntries'];

  getLorebookEntries?: RuntimeCapabilities['worldbook']['getLorebookEntries'];
  setLorebookEntries?: RuntimeCapabilities['worldbook']['setLorebookEntries'];
  createLorebookEntries?: RuntimeCapabilities['worldbook']['createLorebookEntries'];
  deleteLorebookEntries?: RuntimeCapabilities['worldbook']['deleteLorebookEntries'];

  getCharWorldbookNames?: RuntimeCapabilities['worldbook']['getCharWorldbookNames'];
  getCurrentCharacterName?: RuntimeCapabilities['worldbook']['getCurrentCharacterName'];
  getCharacter?: RuntimeCapabilities['worldbook']['getCharacter'];
  getGlobalWorldbookNames?: RuntimeCapabilities['worldbook']['getGlobalWorldbookNames'];
  rebindGlobalWorldbooks?: RuntimeCapabilities['worldbook']['rebindGlobalWorldbooks'];
  getWorldbookNames?: RuntimeCapabilities['worldbook']['getWorldbookNames'];
  getChatWorldbookName?: RuntimeCapabilities['worldbook']['getChatWorldbookName'];
  getOrCreateChatWorldbook?: RuntimeCapabilities['worldbook']['getOrCreateChatWorldbook'];
  rebindChatWorldbook?: RuntimeCapabilities['worldbook']['rebindChatWorldbook'];

  generateRaw?: RuntimeCapabilities['review']['generateRaw'];
  getChatMessages?: RuntimeCapabilities['chat']['getChatMessages'];

  eventOn?: RuntimeCapabilities['events']['eventOn'];
  tavern_events?: RuntimeCapabilities['events']['tavernEvents'];
  eventSource?: RuntimeEventSourceLike;
}

function isEventSourceLike(input: unknown): input is RuntimeEventSourceLike {
  if (!input || typeof input !== 'object') return false;
  const candidate = input as { on?: unknown };
  return typeof candidate.on === 'function';
}

export function createRuntimeCapabilities(source: unknown = globalThis): RuntimeCapabilities {
  const runtime = source as RuntimeGlobal;

  return {
    worldbook: {
      getCurrentCharacterName: runtime.getCurrentCharacterName,
      getCharacter: runtime.getCharacter,
      getWorldbook: runtime.getWorldbook,
      createWorldbookEntries: runtime.createWorldbookEntries,
      updateWorldbookWith: runtime.updateWorldbookWith,
      deleteWorldbookEntries: runtime.deleteWorldbookEntries,
      getLorebookEntries: runtime.getLorebookEntries,
      setLorebookEntries: runtime.setLorebookEntries,
      createLorebookEntries: runtime.createLorebookEntries,
      deleteLorebookEntries: runtime.deleteLorebookEntries,
      getCharWorldbookNames: runtime.getCharWorldbookNames,
      getGlobalWorldbookNames: runtime.getGlobalWorldbookNames,
      rebindGlobalWorldbooks: runtime.rebindGlobalWorldbooks,
      getWorldbookNames: runtime.getWorldbookNames,
      getChatWorldbookName: runtime.getChatWorldbookName,
      getOrCreateChatWorldbook: runtime.getOrCreateChatWorldbook,
      rebindChatWorldbook: runtime.rebindChatWorldbook,
    },
    review: {
      generateRaw: runtime.generateRaw,
      fetchFn: typeof runtime.fetch === 'function' ? runtime.fetch.bind(runtime) : undefined,
    },
    chat: {
      getChatMessages: runtime.getChatMessages,
    },
    events: {
      source: isEventSourceLike(runtime.eventSource) ? runtime.eventSource : null,
      eventOn: runtime.eventOn,
      tavernEvents: runtime.tavern_events,
    },
    ui: {
      windowRef: runtime.window ?? (typeof window !== 'undefined' ? window : null),
      documentRef: runtime.document ?? (typeof document !== 'undefined' ? document : null),
    },
  };
}

export function detectRuntimeHealth(caps: RuntimeCapabilities): RuntimeHealth {
  const highLevelWorldbook =
    typeof caps.worldbook.getWorldbook === 'function' &&
    typeof caps.worldbook.createWorldbookEntries === 'function' &&
    typeof caps.worldbook.updateWorldbookWith === 'function' &&
    typeof caps.worldbook.deleteWorldbookEntries === 'function';

  const legacyWorldbook =
    typeof caps.worldbook.getLorebookEntries === 'function' &&
    typeof caps.worldbook.createLorebookEntries === 'function' &&
    typeof caps.worldbook.setLorebookEntries === 'function' &&
    typeof caps.worldbook.deleteLorebookEntries === 'function';

  return {
    backendAvailable: highLevelWorldbook || legacyWorldbook,
    eventSourceAvailable: typeof caps.events.eventOn === 'function' || caps.events.source != null,
    mountAvailable: caps.ui.documentRef != null,
    highLevelWorldbook,
    legacyWorldbook,
  };
}

export function getRuntimeEventName(
  caps: RuntimeCapabilities,
  key:
    | 'MESSAGE_RECEIVED'
    | 'MESSAGE_SENT'
    | 'MESSAGE_DELETED'
    | 'CHAT_CHANGED'
    | 'CHARACTER_PAGE_LOADED'
    | 'CHARACTER_EDITED'
    | 'CHARACTER_FIRST_MESSAGE_SELECTED'
    | 'WORLD_INFO_ACTIVATED',
  fallback: string,
): string {
  return caps.events.tavernEvents?.[key] ?? fallback;
}

export type { RuntimeCapabilities, RuntimeHealth } from './types';
