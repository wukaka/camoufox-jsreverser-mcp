import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { LlmProvider } from '../../capabilities/types.js';

const schema = z.object({
  source: z.string(),
  question: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
}).strict();
type Args = z.infer<typeof schema>;

const SYSTEM_PROMPT = 'You are a JavaScript reverse-engineering assistant. Explain what the given code does, identify side effects, and call out obfuscation patterns. Be concise.';

export const understand_code = defineTool<Args, {
  explanation: string;
  model: string;
  cached: boolean;
  provider: string;
}>({
  name: 'understand_code',
  description: 'Use an LLM to explain what a JS snippet does. Returns LlmNotConfigured cleanly when no provider is set.',
  schema,
  handler: async ({ source, question, model, maxTokens }: Args, session) => {
    const llm = session.caps.llmProvider as LlmProvider | undefined;
    if (!llm || !llm.isConfigured()) {
      return fail(ErrorReason.LlmNotConfigured, {
        hint: 'Set LLM_PROVIDER + LLM_API_KEY (and LLM_BASE_URL for openai-compatible) before calling understand_code.',
      });
    }
    const userMsg = question
      ? `Question: ${question}\n\nCode:\n\`\`\`js\n${source}\n\`\`\``
      : `Explain this code:\n\`\`\`js\n${source}\n\`\`\``;
    const r = await llm.call({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      model,
      maxTokens,
    });
    return ok({
      explanation: r.text,
      model: r.model,
      cached: r.cached,
      provider: llm.providerName() ?? 'unknown',
    });
  },
});
