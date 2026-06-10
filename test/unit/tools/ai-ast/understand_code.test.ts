import { describe, it, expect } from 'vitest';
import { understand_code } from '../../../../src/tools/ai-ast/understand_code.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { ErrorReason } from '../../../../src/server/result.js';

describe('understand_code', () => {
  it('returns LlmNotConfigured cleanly when no llmProvider', async () => {
    const session = { isReady: () => true, caps: {} } as any;
    const r = await executeTool(understand_code, { source: 'var x = 1;' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.LlmNotConfigured);
  });

  it('returns LlmNotConfigured when provider exists but isConfigured()=false', async () => {
    const llm = { isConfigured: () => false, providerName: () => null, call: async () => { throw new Error('no'); } };
    const session = { isReady: () => true, caps: { llmProvider: llm } } as any;
    const r = await executeTool(understand_code, { source: 'var x = 1;' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(ErrorReason.LlmNotConfigured);
  });

  it('calls llmProvider and returns explanation', async () => {
    const calls: any[] = [];
    const llm = {
      isConfigured: () => true,
      providerName: () => 'openai',
      call: async (req: any) => {
        calls.push(req);
        return { text: 'This adds two numbers.', model: 'gpt-x', cached: false };
      },
    };
    const session = { isReady: () => true, caps: { llmProvider: llm } } as any;
    const r = await executeTool(understand_code, { source: 'var x = 1 + 2;', question: 'what?' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.explanation).toBe('This adds two numbers.');
      expect(r.data.model).toBe('gpt-x');
      expect(r.data.cached).toBe(false);
      expect(r.data.provider).toBe('openai');
    }
    expect(calls[0].messages[0].role).toBe('system');
    expect(calls[0].messages[1].content).toContain('what?');
  });
});
