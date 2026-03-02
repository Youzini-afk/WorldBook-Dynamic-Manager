import type { PatchOp, WorldbookEntryLike } from '../../core/types';

export interface PatchResult {
  applied: number;
  skipped: number;
  errors: string[];
}

const SET_FIELD_ALLOW_LIST = new Set([
  'content',
  'enabled',
  'comment',
  'name',
  'constant',
  'selective',
  'depth',
  'order',
  'keys',
  'secondary_keys',
  'probability',
  'sticky',
  'cooldown',
  'delay',
]);

function splitKeys(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map(v => v.trim()).filter(Boolean);
  if (typeof input === 'string') return input.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

export class PatchProcessor {
  apply(entry: WorldbookEntryLike, ops: PatchOp[]): PatchResult {
    const result: PatchResult = { applied: 0, skipped: 0, errors: [] };
    for (const op of ops) {
      const opName = String(op.op ?? '').toLowerCase();
      try {
        const changed = this.applyOne(entry, opName, op);
        if (changed) result.applied++;
        else result.skipped++;
      } catch (error) {
        result.skipped++;
        result.errors.push(`${opName || '未知操作'} 执行失败: ${String(error)}`);
      }
    }
    return result;
  }

  private applyOne(entry: WorldbookEntryLike, opName: string, op: PatchOp): boolean {
    const current = String(entry.content ?? '');
    if (!opName) return false;
    if (opName === 'append') {
      const value = String(op.value ?? '');
      if (!value) return false;
      if (current.includes(value)) return false;
      entry.content = current + value;
      return true;
    }
    if (opName === 'prepend') {
      const value = String(op.value ?? '');
      if (!value) return false;
      if (current.startsWith(value)) return false;
      entry.content = value + current;
      return true;
    }
    if (opName === 'insert_after') {
      const anchor = String(op.anchor ?? '');
      const value = String(op.value ?? '');
      if (!anchor || !value) return false;
      const index = current.indexOf(anchor);
      if (index < 0) return false;
      const injected = `${anchor}${value}`;
      if (current.includes(injected)) return false;
      entry.content = current.slice(0, index) + injected + current.slice(index + anchor.length);
      return true;
    }
    if (opName === 'insert_before') {
      const anchor = String(op.anchor ?? '');
      const value = String(op.value ?? '');
      if (!anchor || !value) return false;
      const index = current.indexOf(anchor);
      if (index < 0) return false;
      const injected = `${value}${anchor}`;
      if (current.includes(injected)) return false;
      entry.content = current.slice(0, index) + injected + current.slice(index + anchor.length);
      return true;
    }
    if (opName === 'replace_text') {
      const find = String(op.find ?? '');
      const value = String(op.value ?? '');
      if (!find || !current.includes(find)) return false;
      if (find === value) return false;
      entry.content = current.split(find).join(value);
      return true;
    }
    if (opName === 'remove_text') {
      const find = String(op.find ?? '');
      if (!find || !current.includes(find)) return false;
      entry.content = current.split(find).join('');
      return true;
    }
    if (opName === 'set_field') {
      const field = String(op.field ?? '').trim();
      if (!field) return false;
      if (!SET_FIELD_ALLOW_LIST.has(field)) {
        throw new Error(`字段不在白名单内: ${field}`);
      }
      entry[field] = op.value;
      return true;
    }
    if (opName === 'add_key') {
      const value = String(op.value ?? '').trim();
      if (!value) return false;
      const keys = uniq(splitKeys(entry.keys));
      if (keys.includes(value)) return false;
      keys.push(value);
      entry.keys = keys.join(',');
      return true;
    }
    if (opName === 'remove_key') {
      const value = String(op.value ?? '').trim();
      if (!value) return false;
      const keys = splitKeys(entry.keys);
      const next = keys.filter(key => key !== value);
      if (next.length === keys.length) return false;
      entry.keys = next.join(',');
      return true;
    }
    if (opName === 'add_secondary_key') {
      const value = String(op.value ?? '').trim();
      if (!value) return false;
      const keys = uniq(splitKeys(entry.secondary_keys));
      if (keys.includes(value)) return false;
      keys.push(value);
      entry.secondary_keys = keys.join(',');
      return true;
    }
    if (opName === 'remove_secondary_key') {
      const value = String(op.value ?? '').trim();
      if (!value) return false;
      const keys = splitKeys(entry.secondary_keys);
      const next = keys.filter(key => key !== value);
      if (next.length === keys.length) return false;
      entry.secondary_keys = next.join(',');
      return true;
    }
    return false;
  }
}
