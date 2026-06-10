import { describe, it, expect, vi } from 'vitest';
import { get_network_request } from '../../../../src/tools/network/get_network_request.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { RequestPool } from '../../../../src/session/caches.js';

describe('get_network_request', () => {
  it('returns request entry by id', async () => {
    const requests = new RequestPool();
    requests.put({ requestId: 'r1', req: { method: 'POST', url: 'https://a' } as any, res: { status: 201 } as any });
    const session = { isReady: () => true, requests, caps: {} } as any;
    const r = await executeTool(get_network_request, { requestId: 'r1' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data.entry.req as any).method).toBe('POST');
  });

  it('resource_not_found for unknown id', async () => {
    const requests = new RequestPool();
    const session = { isReady: () => true, requests, caps: {} } as any;
    const r = await executeTool(get_network_request, { requestId: 'missing' }, session);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('resource_not_found');
  });

  it('fetches body when fetchBody=true', async () => {
    const requests = new RequestPool();
    requests.put({ requestId: 'r1', req: { method: 'GET', url: 'https://a' } as any });
    const observer = { getData: vi.fn().mockResolvedValue({ bytes: { type: 'string', value: '{"ok":true}' } }) };
    const session = { isReady: () => true, requests, caps: { networkObserver: observer } } as any;
    const r = await executeTool(get_network_request, { requestId: 'r1', fetchBody: true, dataType: 'response' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.body).toEqual({ type: 'string', value: '{"ok":true}' });
    expect(observer.getData).toHaveBeenCalledWith({ dataType: 'response', request: 'r1' });
  });
});
