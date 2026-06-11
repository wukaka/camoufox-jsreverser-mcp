import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupE2E, callTool, navigate, type E2EContext } from './_helpers/e2e-setup.js';

/** W1 — observe-first: locate a signing function by browsing collected scripts. */
describe('e2e: W1 observe-first', () => {
  let ctx: E2EContext | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ ctx, shutdown } = await setupE2E());
    if (!ctx) console.warn('[skip] W1: install geckodriver + Firefox');
  });
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('list_scripts → get_script_source → search_in_scripts locates computeSig', async () => {
    if (!ctx) return;
    await navigate(ctx.mcp, `${ctx.fixture.url}/fixture-xhr-pause.html`);

    const list = await callTool<{ ok: true; data: { scripts: Array<{ url: string }> } }>(
      ctx.mcp.client, 'list_scripts', {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const sign = list.data.scripts.find(s => s.url.endsWith('/sign.js'));
    expect(sign).toBeDefined();

    const src = await callTool<{ ok: true; data: { source: string } }>(
      ctx.mcp.client, 'get_script_source', { url: sign!.url });
    expect(src.ok).toBe(true);
    if (src.ok) expect(src.data.source).toContain('computeSig');

    const hits = await callTool<{ ok: true; data: { totalHits: number } }>(
      ctx.mcp.client, 'search_in_scripts', { pattern: 'computeSig' });
    expect(hits.ok).toBe(true);
    if (hits.ok) expect(hits.data.totalHits).toBeGreaterThan(0);
  });
});
