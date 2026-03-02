import type { ChatMessage } from './reviewService';

interface RuntimeChatMessage {
  role: 'system' | 'assistant' | 'user' | string;
  message?: string;
  content?: string;
  is_hidden?: boolean;
}

interface RuntimeApi {
  getChatMessages?: (range: string | number, options?: Record<string, unknown>) => RuntimeChatMessage[];
}

function runtimeApi(): RuntimeApi {
  return globalThis as RuntimeApi;
}

function normalizeMessage(input: RuntimeChatMessage): ChatMessage | null {
  const role = input.role;
  if (role !== 'system' && role !== 'assistant' && role !== 'user') return null;
  const content = String(input.message ?? input.content ?? '').trim();
  if (!content) return null;
  return { role, content };
}

export function collectRecentChatMessages(reviewDepth: number): ChatMessage[] {
  const api = runtimeApi();
  if (typeof api.getChatMessages !== 'function') return [];

  const depth = Number.isFinite(reviewDepth) ? Math.max(1, Math.floor(reviewDepth)) : 10;
  const rawMessages = api.getChatMessages(-depth, {
    role: 'all',
    hide_state: 'unhidden',
    include_swipes: false,
  });

  const normalized: ChatMessage[] = [];
  for (const item of rawMessages) {
    if (item.is_hidden) continue;
    const parsed = normalizeMessage(item);
    if (!parsed) continue;
    normalized.push(parsed);
  }
  return normalized;
}
