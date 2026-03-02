import { describe, expect, it } from 'vitest';
import { ReviewPromptBuilder } from '../src/WBM/services/review/promptBuilder';

describe('ReviewPromptBuilder', () => {
  it('会构建三段式提示词并包含上下文', () => {
    const builder = new ReviewPromptBuilder();
    const prompts = builder.build(
      [{ role: 'user', content: '你好' }],
      {
        bookName: 'book-A',
        source: 'auto',
        reviewDepth: 8,
        worldbookEntries: [{ uid: 1, name: '条目A', content: '内容A' }],
      },
    );
    expect(prompts).toHaveLength(3);
    expect(prompts[0].role).toBe('system');
    expect(prompts[1].role).toBe('system');
    expect(prompts[2].role).toBe('user');
    expect(prompts[2].content).toContain('"worldbook_name": "book-A"');
    expect(prompts[2].content).toContain('"name": "条目A"');
  });

  it('条目压缩逻辑应处理回退字段与默认值', () => {
    const builder = new ReviewPromptBuilder();
    const prompts = builder.build(
      [{ role: 'assistant', content: 'ok' }],
      {
        bookName: 'book-B',
        source: 'manual',
        reviewDepth: 3,
        worldbookEntries: [
          { id: 2, comment: '注释名', keys: ['k1', 'k2'], secondary_keys: ['s1'] },
          { uid: 3, name: '显式名', content: '正文', enabled: false },
        ],
      },
    );

    const payload = JSON.parse(prompts[2].content) as {
      worldbook_entries: Array<Record<string, unknown>>;
      review_meta: { source: string };
    };
    expect(payload.review_meta.source).toBe('manual');
    expect(payload.worldbook_entries[0]).toEqual({
      uid: 2,
      name: '注释名',
      content: '',
      keys: ['k1', 'k2'],
      secondary_keys: ['s1'],
      enabled: true,
    });
    expect(payload.worldbook_entries[1]).toEqual({
      uid: 3,
      name: '显式名',
      content: '正文',
      keys: '',
      secondary_keys: '',
      enabled: false,
    });
  });
});
