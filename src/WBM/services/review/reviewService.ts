import type { LoggerLike, WorldUpdateCommand } from '../../core/types';
import type { WorldUpdateParser } from '../parser/worldUpdateParser';

// 发送给模型的聊天消息结构
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// AI 调用抽象，便于切换主 API / 外部 API
export interface AiClient {
  call(messages: ChatMessage[]): Promise<string>;
}

export class ReviewService {
  constructor(
    private readonly aiClient: AiClient,
    private readonly parser: WorldUpdateParser,
    private readonly logger: LoggerLike,
  ) {}

  async review(messages: ChatMessage[]): Promise<WorldUpdateCommand[]> {
    const reply = await this.aiClient.call(messages);
    const commands = this.parser.parse(reply);
    this.logger.info(`审核完成，解析指令数=${commands.length}`);
    return commands;
  }
}
