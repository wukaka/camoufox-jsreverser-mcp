import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupE2E, callTool, navigate, type E2EContext } from './_helpers/e2e-setup.js';

/** W3 — breakpoint-last: set a breakpoint by text, trigger click, evaluate on callframe, resume. */
describe('e2e: W3 breakpoint-last', () => {
  let ctx: E2EContext | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ ctx, shutdown } = await setupE2E());
    if (!ctx) console.warn('[skip] W3: install geckodriver + Firefox');
  });
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('set_breakpoint_on_text → click → paused → evaluate_on_callframe → resume', async () => {
    if (!ctx) return;
    await navigate(ctx.mcp, `${ctx.fixture.url}/fixture-xhr-pause.html`);
    // Make sure sign.js is in the cache so set_breakpoint_on_text can locate it.
    await callTool(ctx.mcp.client, 'get_script_source', {
      url: `${ctx.fixture.url}/sign.js`,
    });

    const bp = await callTool<{ ok: true; data: { bpId: string } }>(
      ctx.mcp.client, 'set_breakpoint_on_text', { text: 'return btoa', urlSubstring: '/sign.js' });
    expect(bp.ok).toBe(true);

    // Trigger the call asynchronously so the pause event can race in.
    await callTool(ctx.mcp.client, 'evaluate_script', {
      expression: 'document.getElementById("go").click()',
    });

    // Poll get_paused_info until paused.
    let paused: { ok: boolean; data?: { paused: boolean } } | null = null;
    const start = Date.now();
    while (Date.now() - start < 12_000) {
      paused = await callTool(ctx.mcp.client, 'get_paused_info', {});
      if (paused.ok && paused.data?.paused) break;
      await new Promise(r => setTimeout(r, 200));
    }
    expect(paused?.ok && paused.data?.paused).toBe(true);

    const ev = await callTool<{ ok: true; data: { value: unknown } }>(
      ctx.mcp.client, 'evaluate_on_callframe', { expression: 'typeof payload' });
    expect(ev.ok).toBe(true);

    const resumed = await callTool<{ ok: true }>(ctx.mcp.client, 'resume', {});
    expect(resumed.ok).toBe(true);

    if (bp.ok) await callTool(ctx.mcp.client, 'remove_breakpoint', { bpId: bp.data.bpId });
  });
});
