import type {
  ContentFilterMode,
  ContextMode,
  PromptEntry,
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
  directTriggerOnly?: boolean;
  sendUserMessages?: boolean;
  sendAiMessages?: boolean;
  scanText?: string;
  promptEntries?: PromptEntry[];
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

function compactEntry(entry: WorldbookEntryLike, maxContentChars = 0, includeContent = true): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    uid: entry.uid ?? entry.id ?? null,
    name: pickName(entry),
    keys: entry.keys ?? '',
    secondary_keys: entry.secondary_keys ?? '',
    enabled: entry.enabled ?? true,
  };
  if (includeContent) {
    payload.content = truncate(String(entry.content ?? ''), maxContentChars);
  }
  return payload;
}

function hasKeywordHit(entry: WorldbookEntryLike, normalizedScanText: string): boolean {
  if (!normalizedScanText) return false;
  const keys = splitCsv(entry.keys).concat(splitCsv(entry.secondary_keys));
  return keys.some(key => normalizedScanText.includes(key.toLowerCase()));
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

  const normalizedScanText = String(context.scanText ?? '')
    .trim()
    .toLowerCase();
  if (context.directTriggerOnly === true) {
    if (!normalizedScanText) return [];
    next = next.filter(item => hasKeywordHit(item, normalizedScanText));
    return next;
  }

  if (context.contextMode === 'triggered' && normalizedScanText) {
    next = next.filter(item => hasKeywordHit(item, normalizedScanText));
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
  private buildContextText(
    bookName: string,
    contextMode: ContextMode,
    filteredEntries: WorldbookEntryLike[],
    totalEntries: number,
    maxContentChars: number,
  ): string {
    if (contextMode === 'summary') {
      const lines = filteredEntries.map(item => {
        const name = pickName(item) || '(未命名)';
        const keys = splitCsv(item.keys).join(',');
        const secondary = splitCsv(item.secondary_keys).join(',');
        const enabled = item.enabled === false ? '禁用' : '启用';
        return `- ${name} | 状态:${enabled} | keys:${keys || '无'} | secondary:${secondary || '无'}`;
      });
      return `世界书摘要[${bookName}]，筛选后 ${filteredEntries.length}/${totalEntries} 条：\n${lines.join('\n')}`;
    }

    if (contextMode === 'triggered') {
      const lines = filteredEntries.map(item => {
        const name = pickName(item) || '(未命名)';
        return `- ${name}: ${truncate(String(item.content ?? ''), Math.max(0, maxContentChars || 220))}`;
      });
      return `触发上下文[${bookName}]，命中 ${filteredEntries.length}/${totalEntries}：\n${lines.join('\n')}`;
    }

    const lines = filteredEntries.map(item => {
      const name = pickName(item) || '(未命名)';
      return `- ${name}: ${truncate(String(item.content ?? ''), maxContentChars)}`;
    });
    return `世界书[${bookName}]条目(${filteredEntries.length}/${totalEntries}):\n${lines.join('\n')}`;
  }

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

    const contextMode = context.contextMode ?? 'full';
    const filteredEntries = filterEntries(context.worldbookEntries, context);
    const filteredChat = filterChatMessages(messages, context);
    const includeContent = contextMode !== 'summary';
    const contextText = this.buildContextText(
      context.bookName,
      contextMode,
      filteredEntries,
      context.worldbookEntries.length,
      context.maxContentChars ?? 0,
    );

    const payload = {
      review_meta: {
        source: context.source,
        review_depth: context.reviewDepth,
        worldbook_name: context.bookName,
        context_mode: contextMode,
        direct_trigger_only: context.directTriggerOnly === true,
      },
      worldbook_entries: filteredEntries.map(item =>
        compactEntry(item, context.maxContentChars ?? 0, includeContent),
      ),
      recent_chat: filteredChat,
    };
    const payloadText = JSON.stringify(payload, null, 2);

    const defaultPrompts: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: rulePrompt },
      { role: 'user', content: payloadText },
    ];

    const activePromptEntries = (context.promptEntries ?? [])
      .filter(entry => entry.enabled !== false)
      .slice()
      .sort((a, b) => a.order - b.order);
    if (activePromptEntries.length === 0) {
      return defaultPrompts;
    }

    const preMessages: ChatMessage[] = [];
    const postMessages: ChatMessage[] = [];
    let payloadEmbedded = false;

    for (const promptEntry of activePromptEntries) {
      const raw = String(promptEntry.content ?? '');
      if (!raw.trim()) continue;
      if (raw.includes('{worldbook_payload_json}')) payloadEmbedded = true;
      const rendered = raw
        .replace(/\{current_worldbook_summary\}/g, contextText)
        .replace(/\{current_worldbook_context\}/g, contextText)
        .replace(/\{worldbook_payload_json\}/g, payloadText)
        .trim();
      if (!rendered) continue;

      const message: ChatMessage = {
        role: promptEntry.role,
        content: rendered,
      };
      if (message.role === 'user' && promptEntry.order >= 800) {
        postMessages.push(message);
      } else {
        preMessages.push(message);
      }
    }

    const payloadMessage: ChatMessage[] = payloadEmbedded
      ? []
      : [
          {
            role: 'user',
            content: payloadText,
          },
        ];
    return [...preMessages, ...filteredChat, ...payloadMessage, ...postMessages];
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
      const keys = splitCsv(item.keys).join(',');
      const secondary = splitCsv(item.secondary_keys).join(',');
      const enabled = item.enabled === false ? '禁用' : '启用';
      return `- ${name} | 状态:${enabled} | keys:${keys || '无'} | secondary:${secondary || '无'}`;
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
