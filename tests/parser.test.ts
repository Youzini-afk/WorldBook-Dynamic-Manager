import { describe, expect, it } from 'vitest';
import { WorldUpdateParser } from '../src/WBM/services/parser/worldUpdateParser';
import { noopLogger } from './helpers';

describe('WorldUpdateParser', () => {
  const parser = new WorldUpdateParser(noopLogger);

  it('可解析合法 world_update 指令', () => {
    const text = `<world_update>
[
  {"action":"create","entry_name":"角色A","fields":{"content":"设定"}}
]
</world_update>`;
    const result = parser.parse(text);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('create');
    expect(result[0].entry_name).toBe('角色A');
  });

  it('可修复轻度非法 JSON（末尾逗号）', () => {
    const text = `<world_update>
[{"action":"patch","entry_name":"角色A","ops":[{"op":"append","value":"x"},],}]
</world_update>`;
    const result = parser.parse(text);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe('patch');
  });

  it('缺少标签时返回空数组', () => {
    const result = parser.parse('无需更新');
    expect(result).toEqual([]);
  });

  it('非法 action 会被过滤', () => {
    const text = `<world_update>[{"action":"hack","entry_name":"bad"}]</world_update>`;
    const result = parser.parse(text);
    expect(result).toEqual([]);
  });

  it('stripWorldUpdate 会剥离标签内容', () => {
    const text = `你好<world_update>[{"action":"delete","entry_name":"旧条目"}]</world_update>世界`;
    const stripped = parser.stripWorldUpdate(text);
    expect(stripped).toBe('你好世界');
  });
});
