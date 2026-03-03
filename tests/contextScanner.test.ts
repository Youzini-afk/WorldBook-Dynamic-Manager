import { describe, expect, it } from 'vitest';
import { ContextScanner } from '../src/WBM/services/review/contextScanner';

describe('ContextScanner', () => {
  it('buildScanText 应按深度截取最近消息', () => {
    const scanner = new ContextScanner();
    const text = scanner.buildScanText(
      [
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
        { role: 'user', content: 'C' },
      ],
      2,
    );
    expect(text).toBe('B\nC');
  });

  it('scan 应返回命中关键词条目', () => {
    const scanner = new ContextScanner();
    const result = scanner.scan(
      [
        { uid: 1, name: '条目A', keys: '剑,骑士', secondary_keys: '王国' },
        { uid: 2, name: '条目B', keys: '法术', secondary_keys: '' },
      ],
      '骑士来自王国',
    );

    expect(result.total).toBe(2);
    expect(result.triggered).toHaveLength(1);
    expect(result.triggered[0].matchedKeys).toContain('骑士');
    expect(result.triggered[0].matchedSecondaryKeys).toContain('王国');
  });

  it('scanText 为空时应返回空命中', () => {
    const scanner = new ContextScanner();
    const result = scanner.scan([{ uid: 1, name: 'A', keys: 'k' }], '   ');
    expect(result.triggered).toEqual([]);
  });

  it('应支持数组型 keys/secondary_keys', () => {
    const scanner = new ContextScanner();
    const result = scanner.scan(
      [{ uid: 1, comment: 'A', keys: ['火', '风'], secondary_keys: ['炎'] }],
      '炎与火',
    );
    expect(result.triggered).toHaveLength(1);
    expect(result.triggered[0].name).toBe('A');
  });
});
