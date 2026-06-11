import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupE2E, callTool, navigate, type E2EContext } from './_helpers/e2e-setup.js';

/** W2 — hook-preferred: create a hook + inject it, trigger the button, read samples. */
describe('e2e: W2 hook-preferred', () => {
  let ctx: E2EContext | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ ctx, shutdown } = await setupE2E());
    if (!ctx) console.warn('[skip] W2: install geckodriver + Firefox');
  });
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('create_hook + inject_hook + evaluate_script triggers → samples land in get_hook_data', async () => {
    if (!ctx) return;
    await navigate(ctx.mcp, `${ctx.fixture.url}/fixture-xhr-pause.html`);

    const created = await callTool<{ ok: true; data: { hookId: string } }>(
      ctx.mcp.client,
      'create_hook',
      {
        target: 'window.computeSig',
        capture: { args: true, return: true },
      },
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const hookId = created.data.hookId;

    await callTool(ctx.mcp.client, 'inject_hook', { hookId });

    // Drive the signing flow via evaluate_script (synthetic button click).
    await callTool(ctx.mcp.client, 'evaluate_script', {
      expression: 'document.getElementById("go").click()',
    });
    // Give the fetch+hook callback time to land.
    await new Promise(r => setTimeout(r, 800));

    const data = await callTool<{ ok: true; data: { samples: unknown[] } }>(
      ctx.mcp.client, 'get_hook_data', { hookId });
    expect(data.ok).toBe(true);
    if (data.ok) expect(data.data.samples.length).toBeGreaterThan(0);
  });
});
