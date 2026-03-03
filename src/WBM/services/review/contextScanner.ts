import type { KeywordScanItem, KeywordScanResult, WorldbookEntryLike } from '../../core/types';
import type { ChatMessage } from './reviewService';

function splitCsv(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map(item => String(item).trim())
      .filter(Boolean);
  }
  if (typeof input !== 'string') return [];
  return input
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function pickName(entry: WorldbookEntryLike): string {
  const name = String(entry.name ?? entry.comment ?? '').trim();
  return name || '(未命名)';
}

export class ContextScanner {
  buildScanText(messages: ChatMessage[], depth: number): string {
    const normalizedDepth = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 10;
    const window = messages.slice(-normalizedDepth);
    return window.map(item => item.content).join('\n');
  }

  scan(entries: WorldbookEntryLike[], scanText: string): KeywordScanResult {
    const text = String(scanText ?? '').trim().toLowerCase();
    if (!text) {
      return { triggered: [], total: entries.length, scanText: '' };
    }

    const triggered: KeywordScanItem[] = [];
    for (const entry of entries) {
      const keys = splitCsv(entry.keys);
      const secondary = splitCsv(entry.secondary_keys);
      const matchedKeys = keys.filter(item => text.includes(item.toLowerCase()));
      const matchedSecondaryKeys = secondary.filter(item => text.includes(item.toLowerCase()));
      if (matchedKeys.length === 0 && matchedSecondaryKeys.length === 0) continue;
      triggered.push({
        uid: (entry.uid ?? entry.id ?? null) as number | string | null,
        name: pickName(entry),
        matchedKeys,
        matchedSecondaryKeys,
      });
    }

    return {
      triggered,
      total: entries.length,
      scanText,
    };
  }
}
