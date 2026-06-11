import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupE2E, callTool, navigate, type E2EContext } from './_helpers/e2e-setup.js';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/** W4 — rebuild end-to-end: collect_code → export_rebuild_bundle → bundle on disk. */
describe('e2e: W4 rebuild', () => {
  let ctx: E2EContext | null = null;
  let shutdown: () => Promise<void>;

  beforeAll(async () => {
    ({ ctx, shutdown } = await setupE2E());
    if (!ctx) console.warn('[skip] W4: install geckodriver + Firefox');
  });
  afterAll(async () => { if (shutdown) await shutdown(); });

  it('collect_code then export_rebuild_bundle writes the artifacts bundle', async () => {
    if (!ctx) return;
    await navigate(ctx.mcp, `${ctx.fixture.url}/fixture-xhr-pause.html`);

    const collected = await callTool<{ ok: true; data: { collected: Array<{ url: string }> } }>(
      ctx.mcp.client, 'collect_code', { urlSubstring: '/sign.js' });
    expect(collected.ok).toBe(true);
    if (collected.ok) {
      expect(collected.data.collected.some(c => c.url.endsWith('/sign.js'))).toBe(true);
    }

    const bundle = await callTool<{ ok: true; data: { taskRoot: string; fileTree: string[] } }>(
      ctx.mcp.client,
      'export_rebuild_bundle',
      { taskId: 'w4-rebuild', envProbes: [{ name: 'fixtureUrl', value: ctx.fixture.url }] },
    );
    expect(bundle.ok).toBe(true);
    if (!bundle.ok) return;

    const manifestPath = path.join(bundle.data.taskRoot, 'bundle.manifest.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.scriptCount).toBeGreaterThan(0);
    expect(manifest.envProbeCount).toBe(1);
  });
});
