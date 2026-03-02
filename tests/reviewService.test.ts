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
});
