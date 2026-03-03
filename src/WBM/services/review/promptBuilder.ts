import type {
  ContentFilterMode,
  ContextMode,
  WorldbookEntryLike,
} from '../../core/types';
import type { ChatMessage } from './reviewService';

export type ReviewSource = 'manual' | 'auto';

export interface ReviewContext {
  bookName: string;
  source: ReviewSource;
  reviewDepth: number;
  worldbookEntries: WorldbookEntryLike[];
  contextMode?: ContextMode;
  contentFilterMode?: ContentFilterMode;
  contentFilterTags?: string;
  maxContentChars?: number;
  excludeConstantFromPrompt?: boolean;
  sendUserMessages?: boolean;
  sendAiMessages?: boolean;
  scanText?: string;
}

function splitCsv(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map(item => String(item).trim())
      .filter(Boolean);
  }
  if (typeof input !== 'string') return [];
  return input
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function pickName(entry: WorldbookEntryLike): string {
  return String(entry.name ?? entry.comment ?? '').trim();
}

function truncate(content: string, maxChars: number): string {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return content;
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}...`;
}

function compactEntry(entry: WorldbookEntryLike, maxContentChars = 0): Record<string, unknown> {
  return {
    uid: entry.uid ?? entry.id ?? null,
    name: pickName(entry),
    content: truncate(String(entry.content ?? ''), maxContentChars),
    keys: entry.keys ?? '',
    secondary_keys: entry.secondary_keys ?? '',
    enabled: entry.enabled ?? true,
  };
}

function filterEntries(entries: WorldbookEntryLike[], context: ReviewContext): WorldbookEntryLike[] {
  let next = [...entries];

  if (context.excludeConstantFromPrompt) {
    next = next.filter(item => item.constant !== true);
  }

  if (context.contentFilterMode === 'tags') {
    const tags = new Set(splitCsv(context.contentFilterTags).map(item => item.toLowerCase()));
    if (tags.size > 0) {
      next = next.filter(item => {
        const keys = splitCsv(item.keys).concat(splitCsv(item.secondary_keys));
        return keys.some(key => tags.has(key.toLowerCase()));
      });
    }
  }

  if (context.contextMode === 'triggered' && context.scanText) {
    const scanText = context.scanText.toLowerCase();
    next = next.filter(item => {
      const keys = splitCsv(item.keys).concat(splitCsv(item.secondary_keys));
      return keys.some(key => scanText.includes(key.toLowerCase()));
    });
  }

  return next;
}

function filterChatMessages(messages: ChatMessage[], context: ReviewContext): ChatMessage[] {
  return messages.filter(item => {
    if (item.role === 'user' && context.sendUserMessages === false) return false;
    if (item.role === 'assistant' && context.sendAiMessages === false) return false;
    return true;
  });
}

export class ReviewPromptBuilder {
  build(messages: ChatMessage[], context: ReviewContext): ChatMessage[] {
    const systemPrompt =
      '你是世界书审查器。根据聊天与现有世界书，仅在必要时输出<world_update>JSON数组；不需要更新时输出“无需更新”。';
    const rulePrompt =
      [
        '输出格式必须是：<world_update>[{...}]</world_update>',
        'action 仅允许 create/update/delete/patch',
        '优先使用 patch，减少全量重写',
        '禁止输出额外说明文本',
      ].join('\n');

    const filteredEntries = filterEntries(context.worldbookEntries, context);
    const payload = {
      review_meta: {
        source: context.source,
        review_depth: context.reviewDepth,
        worldbook_name: context.bookName,
        context_mode: context.contextMode ?? 'full',
      },
      worldbook_entries: filteredEntries.map(item => compactEntry(item, context.maxContentChars ?? 0)),
      recent_chat: filterChatMessages(messages, context),
    };

    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: rulePrompt },
      { role: 'user', content: JSON.stringify(payload, null, 2) },
    ];
  }

  async buildFullContext(bookName: string, entries: WorldbookEntryLike[]): Promise<string> {
    const lines = entries.map(item => {
      const name = pickName(item) || '(未命名)';
      return `- ${name}: ${String(item.content ?? '')}`;
    });
    return `世界书[${bookName}]条目(${entries.length}):\n${lines.join('\n')}`;
  }

  async buildSummary(bookName: string, entries: WorldbookEntryLike[]): Promise<string> {
    const lines = entries.slice(0, 20).map(item => {
      const name = pickName(item) || '(未命名)';
      const preview = truncate(String(item.content ?? ''), 120);
      return `- ${name}: ${preview}`;
    });
    return `世界书摘要[${bookName}]，共 ${entries.length} 条：\n${lines.join('\n')}`;
  }

  async buildTriggeredContext(
    bookName: string,
    entries: WorldbookEntryLike[],
    scanText: string,
  ): Promise<string> {
    const filtered = filterEntries(entries, {
      bookName,
      source: 'manual',
      reviewDepth: 0,
      worldbookEntries: entries,
      contextMode: 'triggered',
      scanText,
    });

    const lines = filtered.map(item => {
      const name = pickName(item) || '(未命名)';
      return `- ${name}: ${truncate(String(item.content ?? ''), 220)}`;
    });
    return `触发上下文[${bookName}]，命中 ${filtered.length}/${entries.length}：\n${lines.join('\n')}`;
  }
}
