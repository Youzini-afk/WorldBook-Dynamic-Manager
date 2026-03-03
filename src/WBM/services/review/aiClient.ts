import type { LoggerLike, WbmApiConfig } from '../../core/types';
import type { RuntimeReviewApi } from '../../infra/runtime/types';
import type { AiClient, ChatMessage } from './reviewService';

function toOpenAiMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map(item => ({ role: item.role, content: item.content }));
}

function toGeminiContents(messages: ChatMessage[]): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  return messages
    .filter(item => item.role !== 'system')
    .map(item => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }],
    }));
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function parseGeminiText(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    text?: string;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? data.text ?? '';
  return String(text).trim();
}

function parseOpenAiText(payload: unknown): string {
  const data = payload as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    text?: string;
  };
  const text = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text ?? data.text ?? '';
  return String(text).trim();
}

export class TavernAiClient implements AiClient {
  constructor(
    private readonly logger: LoggerLike,
    private readonly api: RuntimeReviewApi,
  ) {}

  async call(messages: ChatMessage[]): Promise<string> {
    if (typeof this.api.generateRaw === 'function') {
      const output = await this.api.generateRaw({
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
  api: WbmApiConfig;
  fetchFn?: typeof fetch;
}

export class ExternalAiClient implements AiClient {
  constructor(
    private readonly logger: LoggerLike,
    private readonly options: ExternalAiClientOptions,
  ) {}

  private async requestOnce(messages: ChatMessage[]): Promise<string> {
    const api = this.options.api;
    if (!api.endpoint) {
      this.logger.warn('外部 API endpoint 为空，返回空响应');
      return '';
    }

    const fetchFn = this.options.fetchFn ?? (globalThis.fetch?.bind(globalThis) as typeof fetch | undefined);
    if (typeof fetchFn !== 'function') {
      this.logger.error('外部 API 请求异常：fetch 不可用');
      return '';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), api.timeoutMs);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (api.key) {
        headers.Authorization = `Bearer ${api.key}`;
      }

      let body: Record<string, unknown>;
      if (api.type === 'gemini') {
        body = {
          generationConfig: {
            temperature: api.temperature,
            topP: api.topP,
            maxOutputTokens: api.maxTokens,
          },
          contents: toGeminiContents(messages),
        };
      } else {
        body = {
          model: api.model,
          messages: toOpenAiMessages(messages),
          max_tokens: api.maxTokens,
          temperature: api.temperature,
          top_p: api.topP,
          stream: false,
        };
      }

      const response = await fetchFn(api.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await safeReadText(response);
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
      }

      const payload = (await response.json()) as unknown;
      if (api.type === 'gemini') {
        return parseGeminiText(payload);
      }
      return parseOpenAiText(payload);
    } finally {
      clearTimeout(timeout);
    }
  }

  async call(messages: ChatMessage[]): Promise<string> {
    const retries = Math.max(0, this.options.api.retries);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.requestOnce(messages);
      } catch (error) {
        lastError = error;
        this.logger.warn(`外部 API 调用失败，重试 ${attempt + 1}/${retries + 1}`, error);
      }
    }

    this.logger.error('外部 API 最终失败', lastError);
    return '';
  }
}
