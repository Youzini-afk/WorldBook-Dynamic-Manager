import type { LoggerLike, WorldUpdateCommand } from '../../core/types';
import { WorldUpdateParser } from '../parser/worldUpdateParser';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

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
    this.logger.info(`review completed: commands=${commands.length}`);
    return commands;
  }
}
