import type { LoggerLike } from '../../core/types';
import type { AiClient, ChatMessage } from './reviewService';

type RuntimeApi = {
  generateRaw?: (payload: { ordered_prompts: ChatMessage[]; should_stream: boolean }) => Promise<string>;
};

function runtimeApi(): RuntimeApi {
  return globalThis as RuntimeApi;
}

function toOpenAiMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map(item => ({ role: item.role, content: item.content }));
}

export class TavernAiClient implements AiClient {
  constructor(private readonly logger: LoggerLike) {}

  async call(messages: ChatMessage[]): Promise<string> {
    const api = runtimeApi();
    if (typeof api.generateRaw === 'function') {
      const output = await api.generateRaw({
        ordered_prompts: messages,
        should_stream: false,
      });
      return String(output ?? '').trim();
    }
    this.logger.warn('主 API generateRaw 不可用，返回空响应');
    return '';
  }
}

export interface ExternalAiClientOptions {
  endpoint: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class ExternalAiClient implements AiClient {
  constructor(
    private readonly logger: LoggerLike,
    private readonly options: ExternalAiClientOptions,
  ) {}

  async call(messages: ChatMessage[]): Promise<string> {
    if (!this.options.endpoint) {
      this.logger.warn('外部 API endpoint 为空，返回空响应');
      return '';
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30_000);
    try {
      const response = await fetch(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: toOpenAiMessages(messages),
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.error(`外部 API 调用失败: ${response.status}`);
        return '';
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        text?: string;
      };
      const content = payload.choices?.[0]?.message?.content ?? payload.text ?? '';
      return String(content).trim();
    } catch (error) {
      this.logger.error('外部 API 请求异常', error);
      return '';
    } finally {
      clearTimeout(timeout);
    }
  }
}
