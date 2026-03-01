import type { LoggerLike, WorldAction, WorldUpdateCommand } from '../../core/types';

const WORLD_UPDATE_RE = /<world_update>([\s\S]*?)<\/world_update>/i;
const ACTIONS: WorldAction[] = ['create', 'update', 'delete', 'patch'];

function safeParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

export class WorldUpdateParser {
  constructor(private readonly logger: LoggerLike) {}

  parse(text: string): WorldUpdateCommand[] {
    // 只解析包裹在 <world_update> 标签内的指令载荷
    if (!text) return [];
    const match = text.match(WORLD_UPDATE_RE);
    if (!match) return [];
    const parsed = safeParseJson<unknown>(match[1]);
    if (!Array.isArray(parsed)) return [];

    const commands: WorldUpdateCommand[] = [];
    for (const item of parsed) {
      const raw = item as Record<string, unknown>;
      const action = String(raw.action ?? '').toLowerCase() as WorldAction;
      const entryName = String(raw.entry_name ?? '').trim();
      if (!ACTIONS.includes(action) || !entryName) {
        this.logger.warn('跳过非法指令载荷', raw);
        continue;
      }
      commands.push({
        action,
        entry_name: entryName,
        fields: (raw.fields as Record<string, unknown>) ?? {},
        ops: Array.isArray(raw.ops) ? (raw.ops as WorldUpdateCommand['ops']) : [],
      });
    }
    return commands;
  }

  stripWorldUpdate(text: string): string {
    // 用于在内联模式下剥离指令块，避免显示给用户
    return text.replace(WORLD_UPDATE_RE, '').trim();
  }
}
