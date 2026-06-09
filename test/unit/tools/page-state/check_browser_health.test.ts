import { describe, it, expect, vi } from 'vitest';
import { check_browser_health } from '../../../../src/tools/page-state/check_browser_health.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('check_browser_health', () => {
  it('reports ready when session ready and BiDi session.status returns ready', async () => {
    const session = {
      isReady: () => true,
      bidi: { send: vi.fn().mockResolvedValue({ ready: true, message: 'ok' }) },
      emitName: '__mcp_emit_abc',
    } as any;
    const r = await executeTool(check_browser_health, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.ready).toBe(true);
      expect(r.data.emitName).toBe('__mcp_emit_abc');
    }
  });

  it('reports not ready when session not ready', async () => {
    const session = { isReady: () => false } as any;
    const r = await executeTool(check_browser_health, {}, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('browser_not_ready');
  });
});
