import type { LoggerLike, WorldUpdateCommand } from '../../core/types';
import type { WorldUpdateParser } from '../parser/worldUpdateParser';
import { ReviewPromptBuilder, type ReviewContext } from './promptBuilder';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiClient {
  call(messages: ChatMessage[]): Promise<string>;
}

export interface ReviewTraceResult {
  prompts: ChatMessage[];
  reply: string;
  commands: WorldUpdateCommand[];
}

export class ReviewService {
  readonly promptBuilder: ReviewPromptBuilder;

  constructor(
    private readonly aiClient: AiClient,
    private readonly parser: WorldUpdateParser,
    private readonly logger: LoggerLike,
  ) {
    this.promptBuilder = new ReviewPromptBuilder();
  }

  async review(messages: ChatMessage[], context?: ReviewContext): Promise<WorldUpdateCommand[]> {
    const traced = await this.reviewWithTrace(messages, context);
    return traced.commands;
  }

  async reviewWithTrace(messages: ChatMessage[], context?: ReviewContext): Promise<ReviewTraceResult> {
    const prompts = context ? this.promptBuilder.build(messages, context) : messages;
    const reply = await this.aiClient.call(prompts);
    const commands = this.parser.parse(reply);
    this.logger.info(`审核完成，解析指令数=${commands.length}`);
    return {
      prompts,
      reply,
      commands,
    };
  }
}
