import { loadJson, saveJson, type StorageLike } from '../../core/config';
import type { PromptEntry, PromptPreset } from '../../core/types';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class PromptPresetManager {
  private presets: PromptPreset[];

  constructor(private readonly storage: StorageLike | null) {
    const loaded = loadJson<PromptPreset[]>('prompt_presets', [], storage ?? undefined);
    this.presets = Array.isArray(loaded) ? clone(loaded) : [];
  }

  private persist(): void {
    saveJson('prompt_presets', this.presets, this.storage ?? undefined);
  }

  list(): PromptPreset[] {
    return clone(this.presets).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  get(id: string): PromptPreset | null {
    const found = this.presets.find(item => item.id === id);
    return found ? clone(found) : null;
  }

  upsert(name: string, entries: PromptEntry[], id?: string): PromptPreset {
    const now = nowIso();
    const targetId = id ?? newId('prompt_preset');
    const existing = this.presets.find(item => item.id === targetId);

    if (existing) {
      existing.name = name;
      existing.entries = clone(entries);
      existing.updatedAt = now;
      this.persist();
      return clone(existing);
    }

    const created: PromptPreset = {
      id: targetId,
      name,
      entries: clone(entries),
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

  exportAll(): string {
    return JSON.stringify(this.presets, null, 2);
  }

  importAll(payload: string): number {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return 0;
    }
    if (!Array.isArray(parsed)) return 0;

    let changed = 0;
    for (const raw of parsed) {
      const candidate = raw as Partial<PromptPreset>;
      if (!candidate || typeof candidate.name !== 'string' || !Array.isArray(candidate.entries)) continue;
      this.upsert(candidate.name, candidate.entries as PromptEntry[], candidate.id);
      changed++;
    }
    return changed;
  }
}
