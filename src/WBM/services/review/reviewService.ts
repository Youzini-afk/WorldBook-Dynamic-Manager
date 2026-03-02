import type { LoggerLike, WorldUpdateCommand } from '../../core/types';
import type { WorldUpdateParser } from '../parser/worldUpdateParser';
import { ReviewPromptBuilder, type ReviewContext } from './promptBuilder';

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
  private readonly promptBuilder = new ReviewPromptBuilder();

  constructor(
    private readonly aiClient: AiClient,
    private readonly parser: WorldUpdateParser,
    private readonly logger: LoggerLike,
  ) {}

  async review(messages: ChatMessage[], context?: ReviewContext): Promise<WorldUpdateCommand[]> {
    const prompts = context ? this.promptBuilder.build(messages, context) : messages;
    const reply = await this.aiClient.call(prompts);
    const commands = this.parser.parse(reply);
    this.logger.info(`审核完成，解析指令数=${commands.length}`);
    return commands;
  }
}
