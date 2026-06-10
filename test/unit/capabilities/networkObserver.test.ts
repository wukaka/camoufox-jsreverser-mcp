import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeNetworkObserver } from '../../../src/capabilities/networkObserver.js';
import { RequestPool } from '../../../src/session/caches.js';

function fakeBidi() {
  const ee = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn> };
  ee.send = vi.fn().mockResolvedValue({});
  return ee;
}

describe('networkObserver', () => {
  it('records beforeRequestSent into the request pool', () => {
    const bidi = fakeBidi();
    const pool = new RequestPool();
    makeNetworkObserver(bidi as any, pool);
    bidi.emit('network.beforeRequestSent', {
      request: { request: 'req-1', method: 'GET', url: 'https://example.com/' },
      context: 'ctx-1',
    });
    const entry = pool.get('req-1');
    expect(entry).toBeDefined();
    expect((entry?.req as any).method).toBe('GET');
  });

  it('records responseCompleted by merging onto existing pool entry', () => {
    const bidi = fakeBidi();
    const pool = new RequestPool();
    makeNetworkObserver(bidi as any, pool);
    bidi.emit('network.beforeRequestSent', {
      request: { request: 'req-2', method: 'POST', url: 'https://a' },
    });
    bidi.emit('network.responseCompleted', {
      request: { request: 'req-2' },
      response: { status: 200, bytesReceived: 42 },
    });
    const entry = pool.get('req-2');
    expect((entry?.res as any)?.status).toBe(200);
    expect((entry?.req as any).method).toBe('POST');
  });

  it('records fetchError into the pool', () => {
    const bidi = fakeBidi();
    const pool = new RequestPool();
    makeNetworkObserver(bidi as any, pool);
    bidi.emit('network.beforeRequestSent', { request: { request: 'req-3', url: 'https://a' } });
    bidi.emit('network.fetchError', { request: { request: 'req-3' }, errorText: 'NS_ERROR_NET_RESET' });
    const entry = pool.get('req-3');
    expect((entry?.res as any)?.error).toBe('NS_ERROR_NET_RESET');
  });

  it('addIntercept returns intercept id from BiDi result', async () => {
    const bidi = fakeBidi();
    bidi.send.mockResolvedValueOnce({ intercept: 'int-1' });
    const obs = makeNetworkObserver(bidi as any, new RequestPool());
    const id = await obs.addIntercept({ phases: ['beforeRequestSent'] });
    expect(id).toBe('int-1');
    expect(bidi.send).toHaveBeenCalledWith('network.addIntercept', { phases: ['beforeRequestSent'] });
  });

  it('continueRequest forwards params verbatim', async () => {
    const bidi = fakeBidi();
    const obs = makeNetworkObserver(bidi as any, new RequestPool());
    await obs.continueRequest({ request: 'r1', method: 'PUT' });
    expect(bidi.send).toHaveBeenCalledWith('network.continueRequest', { request: 'r1', method: 'PUT' });
  });

  it('failRequest calls network.failRequest', async () => {
    const bidi = fakeBidi();
    const obs = makeNetworkObserver(bidi as any, new RequestPool());
    await obs.failRequest({ request: 'r2' });
    expect(bidi.send).toHaveBeenCalledWith('network.failRequest', { request: 'r2' });
  });

  it('addDataCollector returns collector id', async () => {
    const bidi = fakeBidi();
    bidi.send.mockResolvedValueOnce({ collector: 'col-1' });
    const obs = makeNetworkObserver(bidi as any, new RequestPool());
    const id = await obs.addDataCollector({ dataTypes: ['response'], maxEncodedDataSize: 1024 });
    expect(id).toBe('col-1');
    expect(bidi.send).toHaveBeenCalledWith('network.addDataCollector', {
      dataTypes: ['response'], maxEncodedDataSize: 1024,
    });
  });

  it('getData returns BiDi BytesValue', async () => {
    const bidi = fakeBidi();
    bidi.send.mockResolvedValueOnce({ bytes: { type: 'string', value: 'hello' } });
    const obs = makeNetworkObserver(bidi as any, new RequestPool());
    const r = await obs.getData({ dataType: 'response', request: 'r1' });
    expect(r.bytes).toEqual({ type: 'string', value: 'hello' });
  });
});
