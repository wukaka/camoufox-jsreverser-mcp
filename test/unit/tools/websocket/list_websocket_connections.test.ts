import { describe, it, expect, vi } from 'vitest';
import { list_websocket_connections } from '../../../../src/tools/websocket/list_websocket_connections.js';
import { executeTool } from '../../../../src/server/tool-registry.js';

describe('list_websocket_connections', () => {
  it('returns connections from wsObserver.listConnections', async () => {
    const obs = { listConnections: vi.fn().mockReturnValue([
      { targetId: 'page', wsid: 'w1', url: 'wss://a', frameCount: 5 },
    ]) };
    const session = { isReady: () => true, caps: { wsObserver: obs } } as any;
    const r = await executeTool(list_websocket_connections, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.connections).toHaveLength(1);
  });

  it('forwards filter args', async () => {
    const obs = { listConnections: vi.fn().mockReturnValue([]) };
    const session = { isReady: () => true, caps: { wsObserver: obs } } as any;
    await executeTool(list_websocket_connections, { urlSubstring: 'chat' }, session);
    expect(obs.listConnections).toHaveBeenCalledWith({ urlSubstring: 'chat', targetId: undefined });
  });
});
