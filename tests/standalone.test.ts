import { describe, expect, it, vi } from 'vitest';

const bootstrapSpy = vi.fn();

vi.mock('../src/WBM/index', () => ({
  bootstrapWbmV3: bootstrapSpy,
}));

describe('standalone entry', () => {
  it('导入时会自动调用 bootstrapWbmV3', async () => {
    await import('../src/WBM/standalone');
    expect(bootstrapSpy).toHaveBeenCalledTimes(1);
  });
});

