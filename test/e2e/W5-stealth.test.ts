import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupE2E, callTool, navigate, type E2EContext } from './_helpers/e2e-setup.js';

/** W5 — stealth: stealth=auto should hide navigator.webdriver on the probe page. */
describe('e2e: W5 stealth', () => {
  let ctx: E2EContext | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ ctx, shutdown } = await setupE2E({ stealth: 'auto' }));
    if (!ctx) console.warn('[skip] W5: install geckodriver + Firefox');
  });
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('navigator.webdriver is false on the probe page', async () => {
    if (!ctx) return;
    await navigate(ctx.mcp, `${ctx.fixture.url}/probe-webdriver.html`);
    const r = await callTool<{ ok: true; data: { value: unknown } }>(
      ctx.mcp.client, 'evaluate_script', { expression: 'navigator.webdriver' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.value === false || r.data.value === undefined).toBe(true);
  });
});
