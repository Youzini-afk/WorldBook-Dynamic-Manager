import { describe, expect, it } from 'vitest';
import { WorldUpdateParser } from '../src/WBM/services/parser/worldUpdateParser';
import { ReviewService, type AiClient } from '../src/WBM/services/review/reviewService';
import { noopLogger } from './helpers';

describe('ReviewService', () => {
  it('可调用 AI 并解析出指令', async () => {
    const aiClient: AiClient = {
      call: async () =>
        '<world_update>[{"action":"create","entry_name":"A","fields":{"content":"x"}}]</world_update>',
    };
    const service = new ReviewService(aiClient, new WorldUpdateParser(noopLogger), noopLogger);
    const commands = await service.review([{ role: 'user', content: 'hi' }]);
    expect(commands).toHaveLength(1);
    expect(commands[0].action).toBe('create');
  });

  it('带 context 时会走 PromptBuilder 构建提示词', async () => {
    let capturedMessages: Array<{ role: string; content: string }> = [];
    const aiClient: AiClient = {
      call: async messages => {
        capturedMessages = messages;
        return '<world_update>[]</world_update>';
      },
    };
    const service = new ReviewService(aiClient, new WorldUpdateParser(noopLogger), noopLogger);
    const commands = await service.review(
      [{ role: 'user', content: 'hi' }],
      {
        bookName: 'book-A',
        source: 'manual',
        reviewDepth: 5,
        worldbookEntries: [{ uid: 1, name: '条目A', content: '内容A' }],
      },
    );
    expect(commands).toEqual([]);
    expect(capturedMessages.length).toBe(3);
    expect(capturedMessages[0].role).toBe('system');
    expect(capturedMessages[2].content).toContain('"worldbook_name": "book-A"');
  });
});
