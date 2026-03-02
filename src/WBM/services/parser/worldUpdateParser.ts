import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import type { LoggerLike, WorldUpdateCommand } from '../../core/types';

const WORLD_UPDATE_RE = /<world_update>([\s\S]*?)<\/world_update>/gi;
const ESCAPED_WORLD_UPDATE_RE = /&lt;world_update&gt;[\s\S]*?&lt;\/world_update&gt;/gi;

const patchOpSchema = z.object({ op: z.string().trim().min(1) }).catchall(z.unknown());
const commandSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'patch']),
  entry_name: z.string().trim().min(1),
  fields: z.record(z.string(), z.unknown()).default({}),
  ops: z.array(patchOpSchema).default([]),
});

function tryParseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parsePayload(payload: string): unknown | null {
  const rawParsed = tryParseJson(payload.trim());
  if (rawParsed !== null) return rawParsed;
  try {
    const repaired = jsonrepair(payload);
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

export class WorldUpdateParser {
  constructor(private readonly logger: LoggerLike) {}

  parse(text: string): WorldUpdateCommand[] {
    if (!text) return [];
    const commands: WorldUpdateCommand[] = [];
    const matches = [...text.matchAll(WORLD_UPDATE_RE)];
    if (matches.length === 0) return [];

    for (const match of matches) {
      const payload = match[1];
      const parsed = parsePayload(payload);
      if (!Array.isArray(parsed)) {
        this.logger.warn('跳过无效 world_update 载荷（非数组）');
        continue;
      }
      for (const item of parsed) {
        const normalized = commandSchema.safeParse(item);
        if (!normalized.success) {
          this.logger.warn('跳过 schema 非法指令', normalized.error.issues);
          continue;
        }
        commands.push(normalized.data);
      }
    }
    return commands;
  }

  stripWorldUpdate(text: string): string {
    return text.replace(WORLD_UPDATE_RE, '').replace(ESCAPED_WORLD_UPDATE_RE, '').trim();
  }
}
