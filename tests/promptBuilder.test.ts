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

  it('triggered + tags + 消息过滤应生效', () => {
    const builder = new ReviewPromptBuilder();
    const prompts = builder.build(
      [
        { role: 'user', content: '剑士出现' },
        { role: 'assistant', content: 'AI 回复' },
      ],
      {
        bookName: 'book-C',
        source: 'auto',
        reviewDepth: 10,
        contextMode: 'triggered',
        contentFilterMode: 'tags',
        contentFilterTags: '剑',
        sendAiMessages: false,
        sendUserMessages: true,
        scanText: '剑士出现',
        worldbookEntries: [
          { uid: 1, name: '条目A', keys: '剑', secondary_keys: '战士', content: 'A', constant: false },
          { uid: 2, name: '条目B', keys: '法术', content: 'B', constant: true },
        ],
      },
    );

    const payload = JSON.parse(prompts[2].content) as {
      worldbook_entries: Array<Record<string, unknown>>;
      recent_chat: Array<{ role: string; content: string }>;
    };

    expect(payload.worldbook_entries).toHaveLength(1);
    expect(payload.worldbook_entries[0].name).toBe('条目A');
    expect(payload.recent_chat).toHaveLength(1);
    expect(payload.recent_chat[0].role).toBe('user');
  });

  it('buildFullContext/buildSummary/buildTriggeredContext 可生成文本', async () => {
    const builder = new ReviewPromptBuilder();
    const entries = [
      { uid: 1, name: '条目A', keys: '剑', content: 'A内容' },
      { uid: 2, name: '条目B', keys: '法', content: 'B内容' },
    ];

    const full = await builder.buildFullContext('book-A', entries);
    const summary = await builder.buildSummary('book-A', entries);
    const triggered = await builder.buildTriggeredContext('book-A', entries, '剑士');

    expect(full).toContain('条目A');
    expect(summary).toContain('世界书摘要');
    expect(triggered).toContain('命中 1/2');
  });

  it('summary 模式不应发送条目全文内容', () => {
    const builder = new ReviewPromptBuilder();
    const prompts = builder.build(
      [{ role: 'user', content: '剧情推进' }],
      {
        bookName: 'book-summary',
        source: 'manual',
        reviewDepth: 6,
        contextMode: 'summary',
        worldbookEntries: [{ uid: 11, name: '设定A', content: '不应出现在 payload 中的全文内容' }],
      },
    );
    const payload = JSON.parse(prompts[2].content) as {
      worldbook_entries: Array<Record<string, unknown>>;
    };
    expect(payload.worldbook_entries).toHaveLength(1);
    expect(payload.worldbook_entries[0].name).toBe('设定A');
    expect(payload.worldbook_entries[0].content).toBeUndefined();
  });

  it('directTriggerOnly=true 仅保留直接命中条目', () => {
    const builder = new ReviewPromptBuilder();
    const prompts = builder.build(
      [{ role: 'user', content: '夜色下出现剑士' }],
      {
        bookName: 'book-direct',
        source: 'auto',
        reviewDepth: 8,
        directTriggerOnly: true,
        scanText: '夜色下出现剑士',
        worldbookEntries: [
          { uid: 1, name: '剑士条目', keys: '剑士', content: '命中内容' },
          { uid: 2, name: '法师条目', keys: '法师', content: '不命中内容' },
          { uid: 3, name: '常量条目', keys: '常量', content: '常量但未命中', constant: true },
        ],
      },
    );
    const payload = JSON.parse(prompts[2].content) as {
      worldbook_entries: Array<Record<string, unknown>>;
    };
    expect(payload.worldbook_entries).toHaveLength(1);
    expect(payload.worldbook_entries[0].name).toBe('剑士条目');
  });

  it('directTriggerOnly=true 且扫描文本为空时应返回空条目集', () => {
    const builder = new ReviewPromptBuilder();
    const prompts = builder.build(
      [{ role: 'user', content: '消息' }],
      {
        bookName: 'book-direct-empty',
        source: 'auto',
        reviewDepth: 8,
        directTriggerOnly: true,
        scanText: '',
        worldbookEntries: [
          { uid: 1, name: '条目A', keys: 'a', content: 'A' },
          { uid: 2, name: '条目B', keys: 'b', content: 'B' },
        ],
      },
    );
    const payload = JSON.parse(prompts[2].content) as {
      worldbook_entries: Array<Record<string, unknown>>;
    };
    expect(payload.worldbook_entries).toHaveLength(0);
  });

  it('启用 PromptEntry 时应按条目拼装提示词', () => {
    const builder = new ReviewPromptBuilder();
    const prompts = builder.build(
      [{ role: 'user', content: '原始消息' }],
      {
        bookName: 'book-entry',
        source: 'manual',
        reviewDepth: 5,
        scanText: '原始消息',
        worldbookEntries: [{ uid: 1, name: '条目A', keys: '原始', content: '内容A' }],
        promptEntries: [
          { id: 'sys', name: '系统', role: 'system', content: '系统头', order: 10, enabled: true },
          {
            id: 'usr',
            name: '用户后置',
            role: 'user',
            content: '请按模板执行：{worldbook_payload_json}',
            order: 900,
            enabled: true,
          },
        ],
      },
    );
    expect(prompts.length).toBeGreaterThanOrEqual(3);
    expect(prompts[0].role).toBe('system');
    expect(prompts[0].content).toContain('系统头');
    expect(prompts[prompts.length - 1].role).toBe('user');
    expect(prompts[prompts.length - 1].content).toContain('"worldbook_name": "book-entry"');
  });
});
