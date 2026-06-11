import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { setupE2E, callTool, navigate, type E2EContext } from './_helpers/e2e-setup.js';

interface MockLlm {
  url: string;
  close(): Promise<void>;
}

async function startMockLlm(): Promise<MockLlm> {
  const app = express();
  app.use(express.json());
  app.post('/chat/completions', (req, res) => {
    const userMsg = (req.body?.messages ?? []).find((m: any) => m.role === 'user')?.content ?? '';
    res.json({
      choices: [{ message: { content: `mock-answer for: ${String(userMsg).slice(0, 40)}` } }],
      usage: { prompt_tokens: 10, completion_tokens: 6 },
    });
  });
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise(r => server.close(() => r())),
  };
}

/** W6 — AI/AST chain backed by a mock LLM:
 *   deobfuscate_code → detect_crypto (AES) → analyze_target → understand_code. */
describe('e2e: W6 ai-ast', () => {
  let ctx: E2EContext | null = null;
  let shutdown: () => Promise<void>;
  let llm: MockLlm;

  beforeAll(async () => {
    llm = await startMockLlm();
    ({ ctx, shutdown } = await setupE2E({
      env: {
        LLM_PROVIDER: 'openai-compatible',
        LLM_API_KEY: 'test-key',
        LLM_BASE_URL: llm.url,
      },
    }));
    if (!ctx) console.warn('[skip] W6: install geckodriver + Firefox');
  });
  afterAll(async () => {
    if (shutdown) await shutdown();
    if (llm) await llm.close();
  });

  it('AES detection + deobfuscation + LLM explain on obfuscated-aes fixture', async () => {
    if (!ctx) return;
    await navigate(ctx.mcp, `${ctx.fixture.url}/obfuscated-aes.html`);

    // The inline <script> has no URL; use evaluate_script to grab its body, then run
    // local tools on the source we control: the fixture file via fetch().
    const fetched = await callTool<{ ok: true; data: { value: string } }>(
      ctx.mcp.client,
      'evaluate_script',
      {
        expression: `fetch('${ctx.fixture.url}/obfuscated-aes.html').then(r => r.text())`,
        awaitPromise: true,
      },
    );
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    const source = fetched.data.value;

    const aes = await callTool<{ ok: true; data: { matches: Array<{ name: string }> } }>(
      ctx.mcp.client, 'detect_crypto', { source });
    expect(aes.ok).toBe(true);
    if (aes.ok) expect(aes.data.matches.some(m => m.name === 'AES')).toBe(true);

    const deob = await callTool<{ ok: true; data: { appliedTransforms: Array<{ name: string; changed: boolean }> } }>(
      ctx.mcp.client, 'deobfuscate_code', { source });
    expect(deob.ok).toBe(true);
    if (deob.ok) {
      const cf = deob.data.appliedTransforms.find(t => t.name === 'constant-fold');
      expect(cf?.changed).toBe(true);
    }

    const explain = await callTool<{ ok: true; data: { explanation: string; provider: string } }>(
      ctx.mcp.client, 'understand_code', { source: 'var x = 1 + 2;' });
    expect(explain.ok).toBe(true);
    if (explain.ok) {
      expect(explain.data.provider).toBe('openai-compatible');
      expect(explain.data.explanation).toContain('mock-answer');
    }
  });
});
