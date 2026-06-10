import { describe, it, expect } from 'vitest';
import { get_request_initiator } from '../../../../src/tools/network/get_request_initiator.js';
import { executeTool } from '../../../../src/server/tool-registry.js';
import { RequestPool } from '../../../../src/session/caches.js';

describe('get_request_initiator', () => {
  it('returns initiator from request entry', async () => {
    const requests = new RequestPool();
    requests.put({
      requestId: 'r1',
      req: { method: 'GET', url: 'https://a' } as any,
      initiator: { type: 'script', stackTrace: { callFrames: [] } },
    });
    const session = { isReady: () => true, requests } as any;
    const r = await executeTool(get_request_initiator, { requestId: 'r1' }, session);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data.initiator as any).type).toBe('script');
  });

  it('resource_not_found for unknown id', async () => {
    const session = { isReady: () => true, requests: new RequestPool() } as any;
    const r = await executeTool(get_request_initiator, { requestId: 'missing' }, session);
    expect(r.ok).toBe(false);
  });
});
