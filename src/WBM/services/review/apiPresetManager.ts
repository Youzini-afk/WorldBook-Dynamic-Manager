import { loadJson, saveJson, type StorageLike } from '../../core/config';
import type { ApiPreset, WbmApiConfig } from '../../core/types';

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ApiPresetManager {
  private presets: ApiPreset[];

  constructor(private readonly storage: StorageLike | null) {
    const loaded = loadJson<ApiPreset[]>('api_presets', [], storage ?? undefined);
    this.presets = Array.isArray(loaded) ? clone(loaded) : [];
  }

  private persist(): void {
    saveJson('api_presets', this.presets, this.storage ?? undefined);
  }

  list(): ApiPreset[] {
    return clone(this.presets).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  get(id: string): ApiPreset | null {
    const found = this.presets.find(item => item.id === id);
    return found ? clone(found) : null;
  }

  upsert(name: string, config: WbmApiConfig, id?: string): ApiPreset {
    const now = nowIso();
    const targetId = id ?? newId('api_preset');
    const existing = this.presets.find(item => item.id === targetId);

    if (existing) {
      existing.name = name;
      existing.config = clone(config);
      existing.updatedAt = now;
      this.persist();
      return clone(existing);
    }

    const created: ApiPreset = {
      id: targetId,
      name,
      config: clone(config),
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
      const candidate = raw as Partial<ApiPreset>;
      if (!candidate || typeof candidate.name !== 'string' || !candidate.config) continue;
      this.upsert(candidate.name, candidate.config as WbmApiConfig, candidate.id);
      changed++;
    }
    return changed;
  }
}
