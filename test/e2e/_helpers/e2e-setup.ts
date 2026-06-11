import { resolveFirefoxPath, resolveGeckodriverPath } from '../../integration/helpers/firefox.js';
import { startFixtureServer, type FixtureServer } from '../../integration/fixtures/server.js';
import { connectMcpStdio, callTool, type McpStdioHandle } from '../../integration/helpers/mcp-client.js';

export interface E2EContext {
  fixture: FixtureServer;
  mcp: McpStdioHandle;
}

/** Boot fixture server + MCP server over stdio (MCP will launch its own Firefox).
 *  Returns null when Firefox or geckodriver are missing so callers can skip. */
export async function setupE2E(opts: { env?: Record<string, string>; stealth?: 'auto' | 'off' } = {}): Promise<{
  ctx: E2EContext | null;
  shutdown: () => Promise<void>;
}> {
  const firefoxPath = await resolveFirefoxPath();
  const gecko = await resolveGeckodriverPath();
  const fixture = await startFixtureServer();

  if (!firefoxPath || !gecko) {
    return {
      ctx: null,
      shutdown: async () => { await fixture.close(); },
    };
  }

  const mcp = await connectMcpStdio({
    args: ['--firefox-path', firefoxPath, '--stealth', opts.stealth ?? 'off'],
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
