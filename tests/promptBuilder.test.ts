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
});
