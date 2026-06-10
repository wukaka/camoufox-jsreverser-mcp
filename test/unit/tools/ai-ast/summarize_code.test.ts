import { describe, it, expect } from 'vitest';
import { summarize_code } from '../../../../src/tools/ai-ast/summarize_code.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';

describe('summarize_code', () => {
  it('returns LlmNotConfigured cleanly when no provider', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(summarize_code, { source: 'var x;' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.LlmNotConfigured);
  });

  it('calls llmProvider with maxBullets in prompt', async () => {
    const calls: any[] = [];
    const llm = {
      isConfigured: () => true,
      providerName: () => 'anthropic',
      call: async (req: any) => {
        calls.push(req);
        return { text: '- a\n- b', model: 'claude', cached: true };
      },
    };
    const session = { isReady: () => true, caps: { llmProvider: llm } } as any;
    const r = await executeTool(summarize_code, { source: 'fn()', maxBullets: 3 }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.summary).toBe('- a\n- b');
      expect(r.data.cached).toBe(true);
    }
    expect(calls[0].messages[1].content).toContain('at most 3');
  });
});
