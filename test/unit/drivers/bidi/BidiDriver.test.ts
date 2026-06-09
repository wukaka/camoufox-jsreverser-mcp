import { describe, it, expect, vi } from 'vitest';
import { BidiDriver } from '../../../../src/drivers/bidi/BidiDriver.js';
import { MockSocket } from './mock-socket.js';

describe('BidiDriver', () => {
  it('pairs request id with response', async () => {
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock as any });
    const p = drv.send('session.status', {});
    // emulate Firefox reply
    const sent = JSON.parse(sock.sent[0]!);
    expect(sent.method).toBe('session.status');
    sock.receive({ type: 'success', id: sent.id, result: { ready: true } });
    const res = await p;
    expect(res).toEqual({ ready: true });
  });

  it('rejects with DriverProtocolError on error response', async () => {
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock as any });
    const p = drv.send('script.evaluate', {});
    const sent = JSON.parse(sock.sent[0]!);
    sock.receive({ type: 'error', id: sent.id, error: 'invalid argument', message: 'bad params' });
    await expect(p).rejects.toMatchObject({ code: 'invalid argument' });
  });

  it('emits events to handlers', () => {
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock as any });
    const onLog = vi.fn();
    drv.on('log.entryAdded', onLog);
    sock.receive({ type: 'event', method: 'log.entryAdded', params: { text: 'hi' } });
    expect(onLog).toHaveBeenCalledWith({ text: 'hi' });
  });

  it('rejects all in-flight on close with DriverDisconnectedError', async () => {
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock as any });
    const p = drv.send('session.status', {});
    sock.close();
    await expect(p).rejects.toMatchObject({ name: 'DriverDisconnectedError' });
  });

  it('times out after configured ms', async () => {
    vi.useFakeTimers();
    const sock = new MockSocket();
    const drv = new BidiDriver({ socket: sock as any, timeoutMs: 100 });
    const p = drv.send('session.status', {});
    vi.advanceTimersByTime(150);
    await expect(p).rejects.toMatchObject({ name: 'DriverTimeoutError' });
    vi.useRealTimers();
  });
});
