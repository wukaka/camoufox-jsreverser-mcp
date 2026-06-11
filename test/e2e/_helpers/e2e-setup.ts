import { resolveCamoufoxPath, resolveGeckodriverPath } from '../../integration/helpers/firefox.js';
import { startFixtureServer, type FixtureServer } from '../../integration/fixtures/server.js';
import { connectMcpStdio, callTool, type McpStdioHandle } from '../../integration/helpers/mcp-client.js';

export interface E2EContext {
  fixture: FixtureServer;
  mcp: McpStdioHandle;
}

/** Boot fixture server + MCP server over stdio. The MCP server launches Camoufox via
 *  geckodriver. Returns null when either binary is missing so callers can skip. */
export async function setupE2E(opts: { env?: Record<string, string>; stealth?: 'auto' | 'off' } = {}): Promise<{
  ctx: E2EContext | null;
  shutdown: () => Promise<void>;
}> {
  const camoufoxPath = await resolveCamoufoxPath();
  const gecko = await resolveGeckodriverPath();
  const fixture = await startFixtureServer();

  if (!camoufoxPath || !gecko) {
    return {
      ctx: null,
      shutdown: async () => { await fixture.close(); },
    };
  }

  const mcp = await connectMcpStdio({
    args: [
      '--camoufox-path', camoufoxPath,
      '--geckodriver-path', gecko,
      '--stealth', opts.stealth ?? 'off',
    ],
    env: opts.env,
  });

  return {
    ctx: { fixture, mcp },
    async shutdown() {
      try { await mcp.close(); } finally { await fixture.close(); }
    },
  };
}

export { callTool };

/** Convenience: navigate the first listed page to `url`. */
export async function navigate(mcp: McpStdioHandle, url: string): Promise<void> {
  const pages = await callTool<{ ok: true; data: { contexts: Array<{ context: string }> } }
    | { ok: false; reason: string }>(mcp.client, 'list_pages', {});
  if (!pages.ok) throw new Error(`list_pages failed: ${pages.reason}`);
  const ctxId = pages.data.contexts[0]?.context;
  if (!ctxId) throw new Error('no browsing context');
  await callTool(mcp.client, 'select_page', { contextId: ctxId });
  await callTool(mcp.client, 'navigate_page', { url, wait: 'complete' });
}
