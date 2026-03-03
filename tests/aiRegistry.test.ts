import { describe, expect, it } from 'vitest';
import { AiRegistry } from '../src/WBM/services/worldbook/aiRegistry';
import { memoryStorage } from './helpers';

describe('AiRegistry', () => {
  it('应支持标记、重命名与清理', () => {
    const registry = new AiRegistry(memoryStorage());

    registry.mark('bookA', 'entryA', 'auto');
    registry.mark('bookA', 'entryB', 'manual');
    expect(registry.list('bookA')).toHaveLength(2);

    registry.rename('bookA', 'entryA', 'entryA2');
    expect(registry.list('bookA').some(item => item.entryName === 'entryA2')).toBe(true);

    registry.unmark('bookA', 'entryB');
    expect(registry.list('bookA')).toHaveLength(1);

    const stats = registry.stats('bookA');
    expect(stats.count).toBe(1);
    expect(stats.latestAt).toBeTruthy();

    registry.rename('bookA', 'missing', 'noop');
    registry.unmark('bookA', 'missing');
    expect(registry.stats('bookA').count).toBe(1);
  });
});
