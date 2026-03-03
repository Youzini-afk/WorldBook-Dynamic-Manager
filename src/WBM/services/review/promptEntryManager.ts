import { loadJson, saveJson, type StorageLike } from '../../core/config';
import type { PromptEntry } from '../../core/types';

function nowId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const DEFAULT_PROMPT_ENTRIES: PromptEntry[] = [
  {
    id: '_sys_identity',
    name: '核心身份',
    role: 'system',
    order: 10,
    enabled: true,
    builtin: true,
    content:
      '你是动态世界书审查器。请根据近期聊天与世界书内容，输出最小必要的 <world_update> 指令。',
  },
  {
    id: '_sys_format',
    name: '格式要求',
    role: 'system',
    order: 20,
    enabled: true,
    builtin: true,
    content:
      '仅输出 <world_update>[...]</world_update>，action 仅允许 create/update/delete/patch，不需要更新时回复“无需更新”。',
  },
  {
    id: '_usr_trigger',
    name: '触发指令',
    role: 'user',
    order: 900,
    enabled: true,
    builtin: true,
    content: '请审查并按格式输出更新指令。',
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class PromptEntryManager {
  private entries: PromptEntry[];

  constructor(private readonly storage: StorageLike | null) {
    const loaded = loadJson<PromptEntry[]>('prompt_entries', [], storage ?? undefined);
    if (!Array.isArray(loaded) || loaded.length === 0) {
      this.entries = clone(DEFAULT_PROMPT_ENTRIES);
      this.persist();
    } else {
      this.entries = clone(loaded);
    }
  }

  private persist(): void {
    saveJson('prompt_entries', this.entries, this.storage ?? undefined);
  }

  list(): PromptEntry[] {
    return clone(this.entries).sort((a, b) => a.order - b.order);
  }

  replace(entries: PromptEntry[]): void {
    this.entries = clone(entries);
    this.persist();
  }

  upsert(entry: Omit<PromptEntry, 'id'> & { id?: string }): PromptEntry {
    const id = entry.id ?? nowId('prompt');
    const next: PromptEntry = { ...entry, id };
    const idx = this.entries.findIndex(item => item.id === id);
    if (idx >= 0) this.entries[idx] = next;
    else this.entries.push(next);
    this.persist();
    return clone(next);
  }

  remove(id: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter(item => item.id !== id || item.builtin);
    const changed = this.entries.length !== before;
    if (changed) this.persist();
    return changed;
  }

  resetToDefault(): void {
    this.entries = clone(DEFAULT_PROMPT_ENTRIES);
    this.persist();
  }
}
