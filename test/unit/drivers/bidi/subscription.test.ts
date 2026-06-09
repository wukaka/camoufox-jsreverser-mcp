import { describe, it, expect, afterEach, vi } from 'vitest';
import { BidiDriver } from '../../../../src/drivers/bidi/BidiDriver.js';
import { MockSocket } from './mock-socket.js';

describe('BidiDriver.subscribe', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('records subscriptions and sends session.subscribe', async () => {
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock });
    const p = drv.subscribe(['log.entryAdded', 'network.beforeRequestSent']);
    const sent = JSON.parse(sock.sent[0]!);
    expect(sent.method).toBe('session.subscribe');
    expect(sent.params).toEqual({ events: ['log.entryAdded', 'network.beforeRequestSent'] });
    sock.receive({ type: 'success', id: sent.id, result: {} });
    await p;
    expect(drv.listSubscriptions()).toEqual([
      { events: ['log.entryAdded', 'network.beforeRequestSent'], contexts: undefined },
    ]);
  });

  it('subscribe with contexts includes contexts in params', async () => {
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock });
    const p = drv.subscribe(['log.entryAdded'], ['ctx1']);
    const sent = JSON.parse(sock.sent[0]!);
    expect(sent.params).toEqual({ events: ['log.entryAdded'], contexts: ['ctx1'] });
    sock.receive({ type: 'success', id: sent.id, result: {} });
    await p;
  });

  it('unsubscribe removes matching entry from registry', async () => {
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock });
    const p1 = drv.subscribe(['log.entryAdded']);
    sock.receive({ type: 'success', id: JSON.parse(sock.sent[0]!).id, result: {} });
    await p1;
    expect(drv.listSubscriptions()).toHaveLength(1);
    const p2 = drv.unsubscribe(['log.entryAdded']);
    sock.receive({ type: 'success', id: JSON.parse(sock.sent[1]!).id, result: {} });
    await p2;
    expect(drv.listSubscriptions()).toHaveLength(0);
  });

  it('replaySubscriptions resends every recorded subscription', async () => {
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock });
    const p1 = drv.subscribe(['log.entryAdded']);
    sock.receive({ type: 'success', id: JSON.parse(sock.sent[0]!).id, result: {} });
    await p1;
    const p2 = drv.subscribe(['network.beforeRequestSent'], ['ctx1']);
    sock.receive({ type: 'success', id: JSON.parse(sock.sent[1]!).id, result: {} });
    await p2;

    // simulate reconnect: clear sent buffer
    sock.sent.length = 0;
    const replay = drv.replaySubscriptions();

    // Sequential replay: respond as each frame appears.
    // Frame 1 is enqueued synchronously inside the first send().
    await Promise.resolve(); // let send() run to the await point
    expect(sock.sent).toHaveLength(1);
    sock.receive({ type: 'success', id: JSON.parse(sock.sent[0]!).id, result: {} });
    await Promise.resolve();
    await Promise.resolve();
    // Frame 2 enqueued only after frame 1's response was processed.
    expect(sock.sent).toHaveLength(2);
    sock.receive({ type: 'success', id: JSON.parse(sock.sent[1]!).id, result: {} });
    await replay;
    const sentMethods = sock.sent.map(s => JSON.parse(s).method);
    expect(sentMethods).toEqual(['session.subscribe', 'session.subscribe']);
  });
});
