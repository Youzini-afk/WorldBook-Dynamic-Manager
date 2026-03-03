import type { WorldbookEntryLike } from '../../core/types';

export interface RuntimeChatMessage {
  role: 'system' | 'assistant' | 'user' | string;
  message?: string;
  content?: string;
  is_hidden?: boolean;
}

export interface RuntimeWorldbookApi {
  getWorldbook?: (name: string) => Promise<WorldbookEntryLike[]>;
  createWorldbookEntries?: (
    name: string,
    entries: Partial<WorldbookEntryLike>[],
  ) => Promise<{ worldbook: WorldbookEntryLike[] }>;
  updateWorldbookWith?: (
    name: string,
    updater: (
      entries: WorldbookEntryLike[],
    ) => Partial<WorldbookEntryLike>[] | Promise<Partial<WorldbookEntryLike>[]>,
  ) => Promise<WorldbookEntryLike[]>;
  deleteWorldbookEntries?: (
    name: string,
    predicate: (entry: WorldbookEntryLike) => boolean,
  ) => Promise<{ worldbook: WorldbookEntryLike[]; deleted_entries: WorldbookEntryLike[] }>;

  getLorebookEntries?: (name: string) => Promise<WorldbookEntryLike[]>;
  setLorebookEntries?: (
    name: string,
    entries: Array<Pick<WorldbookEntryLike, 'uid'> & Partial<WorldbookEntryLike>>,
  ) => Promise<unknown>;
  createLorebookEntries?: (name: string, entries: Partial<WorldbookEntryLike>[]) => Promise<unknown>;
  deleteLorebookEntries?: (name: string, uids: number[]) => Promise<unknown>;

  getCharWorldbookNames?: (character_name: 'current' | string) => { primary: string | null; additional: string[] };
  getGlobalWorldbookNames?: () => string[];
  getWorldbookNames?: () => string[];
  getChatWorldbookName?: (chat_name: 'current') => string | null;
  getOrCreateChatWorldbook?: (chat_name: 'current', worldbook_name?: string) => Promise<string>;
  rebindChatWorldbook?: (chat_name: 'current', worldbook_name: string) => Promise<void>;
}

export interface RuntimeReviewApi {
  generateRaw?: (payload: {
    ordered_prompts: Array<{ role: 'system' | 'assistant' | 'user'; content: string }>;
    should_stream: boolean;
  }) => Promise<string>;
  fetchFn?: typeof fetch;
}

export interface RuntimeChatApi {
  getChatMessages?: (range: string | number, options?: Record<string, unknown>) => RuntimeChatMessage[];
}

export interface RuntimeEventSourceLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
}

export interface RuntimeEventOnBinding {
  stop?: () => void;
}

export type RuntimeEventOnFn = (
  eventType: string,
  listener: (...args: unknown[]) => void,
) => RuntimeEventOnBinding | void;

export interface RuntimeEventApi {
  source: RuntimeEventSourceLike | null;
  eventOn?: RuntimeEventOnFn;
  tavernEvents?: {
    MESSAGE_RECEIVED?: string;
    MESSAGE_SENT?: string;
    MESSAGE_DELETED?: string;
    CHAT_CHANGED?: string;
  };
}

export interface RuntimeUiApi {
  windowRef: Window | null;
  documentRef: Document | null;
}

export interface RuntimeCapabilities {
  worldbook: RuntimeWorldbookApi;
  review: RuntimeReviewApi;
  chat: RuntimeChatApi;
  events: RuntimeEventApi;
  ui: RuntimeUiApi;
}

export interface RuntimeHealth {
  backendAvailable: boolean;
  eventSourceAvailable: boolean;
  mountAvailable: boolean;
  highLevelWorldbook: boolean;
  legacyWorldbook: boolean;
}
