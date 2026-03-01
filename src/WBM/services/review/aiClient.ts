import type { LoggerLike } from '../../core/types';
import type { AiClient, ChatMessage } from './reviewService';

declare const TavernHelper: any;

export class TavernAiClient implements AiClient {
  constructor(private readonly logger: LoggerLike) {}

  async call(messages: ChatMessage[]): Promise<string> {
    if (TavernHelper?.generateRaw) {
      const output = await TavernHelper.generateRaw({
        ordered_prompts: messages,
        should_stream: false,
      });
      return String(output ?? '').trim();
    }
    this.logger.warn('TavernHelper.generateRaw unavailable, returning empty response');
    return '';
  }
}
