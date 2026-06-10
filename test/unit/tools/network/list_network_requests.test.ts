import { describe, it, expect } from 'vitest';
import { list_network_requests } from '../../../../src/tools/network/list_network_requests.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { RequestPool } from '../../../../src/session/caches.js';

describe('list_network_requests', () => {
  it('returns all requests when no filter', async () => {
    const requests = new RequestPool();
    requests.put({ requestId: 'r1', req: { method: 'GET', url: 'https://a/x' } as any });
    requests.put({ requestId: 'r2', req: { method: 'POST', url: 'https://b/y' } as any, res: { status: 200 } as any });
    const session = { isReady: () => true, requests } as any;
    const r = await executeTool(list_network_requests, {}, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.requests).toHaveLength(2);
  });

  it('filters by urlSubstring', async () => {
    const requests = new RequestPool();
    requests.put({ requestId: 'r1', req: { method: 'GET', url: 'https://api.example.com/users' } as any });
    requests.put({ requestId: 'r2', req: { method: 'GET', url: 'https://cdn.example.com/script.js' } as any });
    const session = { isReady: () => true, requests } as any;
    const r = await executeTool(list_network_requests, { urlSubstring: 'api' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.requests).toHaveLength(1);
      expect(r.data.requests[0].requestId).toBe('r1');
    }
  });

  it('filters by method', async () => {
    const requests = new RequestPool();
    requests.put({ requestId: 'r1', req: { method: 'GET', url: 'https://a' } as any });
    requests.put({ requestId: 'r2', req: { method: 'POST', url: 'https://a' } as any });
    const session = { isReady: () => true, requests } as any;
    const r = await executeTool(list_network_requests, { method: 'POST' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.requests).toHaveLength(1);
  });
});
