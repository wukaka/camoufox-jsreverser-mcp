export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCallOptions {
  messages: LlmMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface LlmCallResult {
  text: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface LlmProviderImpl {
  readonly name: string;
  call(opts: LlmCallOptions): Promise<LlmCallResult>;
}

export interface LlmProviderConfig {
  provider: 'openai' | 'anthropic' | 'openai-compatible';
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}
