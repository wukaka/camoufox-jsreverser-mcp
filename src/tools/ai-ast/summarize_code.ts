import { z } from 'zod';
import { defineTool } from '../../server/tool-registry.js';
import { ok, fail, ErrorReason } from '../../server/result.js';
import type { LlmProvider } from '../../capabilities/types.js';

const schema = z.object({
  source: z.string(),
  maxBullets: z.number().int().positive().max(20).optional(),
  model: z.string().optional(),
}).strict();
type Args = z.infer<typeof schema>;

const SYSTEM_PROMPT = 'You are a JavaScript reverse-engineering assistant. Summarize the given code as a short bullet list focusing on observable behavior, network/storage side effects, and called APIs.';

export const summarize_code = defineTool<Args, {
  summary: string;
  model: string;
  cached: boolean;
}>({
  name: 'summarize_code',
  description: 'Use an LLM to produce a bullet-list summary of a JS snippet. Returns LlmNotConfigured when no provider is set.',
  schema,
  handler: async ({ source, maxBullets, model }: Args, session) => {
    const llm = session.caps.llmProvider as LlmProvider | undefined;
    if (!llm || !llm.isConfigured()) {
      return fail(ErrorReason.LlmNotConfigured, {
        hint: 'Set LLM_PROVIDER + LLM_API_KEY to enable summarize_code.',
      });
    }
    const bullets = maxBullets ?? 8;
    const r = await llm.call({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Summarize this code in at most ${bullets} bullet points:\n\`\`\`js\n${source}\n\`\`\`` },
      ],
      model,
    });
    return ok({ summary: r.text, model: r.model, cached: r.cached });
  },
});
