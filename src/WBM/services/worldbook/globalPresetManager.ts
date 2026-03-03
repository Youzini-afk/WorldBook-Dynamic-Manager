import { loadJson, saveJson, type StorageLike } from '../../core/config';
import type { GlobalWorldbookPreset } from '../../core/types';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeNames(input: string[]): string[] {
  const dedup = new Set<string>();
  const normalized: string[] = [];
  for (const item of input) {
    const name = String(item ?? '').trim();
    if (!name || dedup.has(name)) continue;
    dedup.add(name);
    normalized.push(name);
  }
  return normalized;
}

export class GlobalPresetManager {
  private presets: GlobalWorldbookPreset[];

  constructor(private readonly storage: StorageLike | null) {
    const loaded = loadJson<GlobalWorldbookPreset[]>('global_worldbook_presets', [], storage ?? undefined);
    this.presets = Array.isArray(loaded) ? clone(loaded) : [];
  }

  private persist(): void {
    saveJson('global_worldbook_presets', this.presets, this.storage ?? undefined);
  }

  list(): GlobalWorldbookPreset[] {
    return clone(this.presets).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  get(id: string): GlobalWorldbookPreset | null {
    const found = this.presets.find(item => item.id === id);
    return found ? clone(found) : null;
  }

  upsert(name: string, worldbooks: string[], id?: string): GlobalWorldbookPreset {
    const cleanName = name.trim();
    if (!cleanName) throw new Error('预设名称不能为空');

    const now = nowIso();
    const targetId = id ?? newId('global_preset');
    const entries = normalizeNames(worldbooks);
    const existing = this.presets.find(item => item.id === targetId);

    if (existing) {
      existing.name = cleanName;
      existing.worldbooks = entries;
      existing.updatedAt = now;
      this.persist();
      return clone(existing);
    }

    const created: GlobalWorldbookPreset = {
      id: targetId,
      name: cleanName,
      worldbooks: entries,
      createdAt: now,
      updatedAt: now,
    };
    this.presets.push(created);
    this.persist();
    return clone(created);
  }

  remove(id: string): boolean {
    const before = this.presets.length;
    this.presets = this.presets.filter(item => item.id !== id);
    const changed = this.presets.length !== before;
    if (changed) this.persist();
    return changed;
  }
}

