import type { WorldbookEntryLike } from '../../core/types';
import type { ChatMessage } from './reviewService';

export type ReviewSource = 'manual' | 'auto';

export interface ReviewContext {
  bookName: string;
  source: ReviewSource;
  reviewDepth: number;
  worldbookEntries: WorldbookEntryLike[];
}

function compactEntry(entry: WorldbookEntryLike): Record<string, unknown> {
  return {
    uid: entry.uid ?? entry.id ?? null,
    name: entry.name ?? entry.comment ?? '',
    content: entry.content ?? '',
    keys: entry.keys ?? '',
    secondary_keys: entry.secondary_keys ?? '',
    enabled: entry.enabled ?? true,
  };
}

export class ReviewPromptBuilder {
  build(chatMessages: ChatMessage[], context: ReviewContext): ChatMessage[] {
    const systemPrompt =
      '你是世界书审查器。根据聊天与现有世界书，仅在必要时输出<world_update>JSON数组；不需要更新时输出“无需更新”。';
    const rulePrompt =
      [
        '输出格式必须是：<world_update>[{...}]</world_update>',
        'action 仅允许 create/update/delete/patch',
        '优先使用 patch，减少全量重写',
        '禁止输出额外说明文本',
      ].join('\n');

    const payload = {
      review_meta: {
        source: context.source,
        review_depth: context.reviewDepth,
        worldbook_name: context.bookName,
      },
      worldbook_entries: context.worldbookEntries.map(compactEntry),
      recent_chat: chatMessages,
    };

    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: rulePrompt },
      { role: 'user', content: JSON.stringify(payload, null, 2) },
    ];
  }
}
