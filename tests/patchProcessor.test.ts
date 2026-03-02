import { describe, expect, it } from 'vitest';
import { PatchProcessor } from '../src/WBM/services/patch/patchProcessor';
import type { WorldbookEntryLike } from '../src/WBM/core/types';

describe('PatchProcessor', () => {
  const processor = new PatchProcessor();

  it('append/prepend 具备幂等防护', () => {
    const entry: WorldbookEntryLike = { content: 'world' };
    const result1 = processor.apply(entry, [{ op: 'prepend', value: 'hello ' }]);
    const result2 = processor.apply(entry, [{ op: 'prepend', value: 'hello ' }]);
    expect(result1.applied).toBe(1);
    expect(result2.applied).toBe(0);
    expect(String(entry.content)).toBe('hello world');
  });

  it('支持 insert_before 和 insert_after', () => {
    const entry: WorldbookEntryLike = { content: 'A-B' };
    const result = processor.apply(entry, [
      { op: 'insert_after', anchor: 'A', value: '_1' },
      { op: 'insert_before', anchor: 'B', value: '_2' },
    ]);
    expect(result.applied).toBe(2);
    expect(String(entry.content)).toBe('A_1-_2B');
  });

  it('set_field 限制白名单字段', () => {
    const entry: WorldbookEntryLike = { content: 'x' };
    const result = processor.apply(entry, [{ op: 'set_field', field: 'unsafe_field', value: 'oops' }]);
    expect(result.applied).toBe(0);
    expect(result.errors[0]).toContain('白名单');
  });

  it('关键词增删应保持去重并可删除', () => {
    const entry: WorldbookEntryLike = { keys: 'a,b', secondary_keys: 'x' };
    const result = processor.apply(entry, [
      { op: 'add_key', value: 'a' },
      { op: 'add_key', value: 'c' },
      { op: 'remove_key', value: 'b' },
      { op: 'add_secondary_key', value: 'y' },
      { op: 'remove_secondary_key', value: 'x' },
    ]);
    expect(result.applied).toBe(4);
    expect(String(entry.keys)).toBe('a,c');
    expect(String(entry.secondary_keys)).toBe('y');
  });

  it('replace_text/remove_text/set_field 正常生效', () => {
    const entry: WorldbookEntryLike = { content: 'abc123', enabled: true };
    const result = processor.apply(entry, [
      { op: 'replace_text', find: '123', value: 'xyz' },
      { op: 'remove_text', find: 'abc' },
      { op: 'set_field', field: 'enabled', value: false },
    ]);
    expect(result.applied).toBe(3);
    expect(String(entry.content)).toBe('xyz');
    expect(entry.enabled).toBe(false);
  });

  it('未知操作会被跳过', () => {
    const entry: WorldbookEntryLike = { content: 'x' };
    const result = processor.apply(entry, [{ op: 'not_exist' }]);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
