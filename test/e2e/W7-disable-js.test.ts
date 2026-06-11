import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupE2E, callTool, navigate, type E2EContext } from './_helpers/e2e-setup.js';

/** W7 — set_javascript_enabled(false) → navigate → static HTML →
 *       set_javascript_enabled(true) → navigate → hook fires. */
describe('e2e: W7 disable-js', () => {
  let ctx: E2EContext | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ ctx, shutdown } = await setupE2E());
    if (!ctx) console.warn('[skip] W7: install geckodriver + Firefox');
  });
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('JS disabled hides probe data; re-enable lets the probe script run', async () => {
    if (!ctx) return;
    const url = `${ctx.fixture.url}/probe-webdriver.html`;

    await callTool(ctx.mcp.client, 'set_javascript_enabled', { enabled: false });
    await navigate(ctx.mcp, url);
    const off = await callTool<{ ok: true; data: { value: unknown } }>(
      ctx.mcp.client, 'evaluate_script',
      { expression: 'document.getElementById("result").dataset.webdriver ?? null' });
    expect(off.ok).toBe(true);
    // With JS off the inline script never ran, so dataset.webdriver is unset (null).
    if (off.ok) expect(off.data.value).toBeNull();

    await callTool(ctx.mcp.client, 'set_javascript_enabled', { enabled: true });
    await navigate(ctx.mcp, url);
    const on = await callTool<{ ok: true; data: { value: unknown } }>(
      ctx.mcp.client, 'evaluate_script',
      { expression: 'document.getElementById("result").dataset.webdriver ?? null' });
    expect(on.ok).toBe(true);
    if (on.ok) expect(typeof on.data.value).toBe('string');
  });
});
