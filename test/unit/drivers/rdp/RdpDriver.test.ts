import { describe, it, expect, vi } from 'vitest';
import { RdpDriver } from '../../../../src/drivers/rdp/RdpDriver.js';
import { EventEmitter } from 'node:events';
import { encodeFrame } from '../../../../src/drivers/rdp/framing.js';

class MockTcp extends EventEmitter {
  written: Buffer[] = [];
  writable = true;
  write(b: Buffer): boolean { this.written.push(b); return true; }
  end(): void { this.writable = false; this.emit('close'); }
  reply(payload: unknown): void { this.emit('data', encodeFrame(payload)); }
}

describe('RdpDriver', () => {
  it('pairs request to response by `from`', async () => {
    const sock = new MockTcp();
    const drv = new RdpDriver({ socket: sock as any });
    drv.markConnected();
    const p = drv.call('root', { type: 'listTabs' });
    sock.reply({ from: 'root', tabs: [{ actor: 't1', url: 'about:blank' }], selected: 0 });
    const res = await p;
    expect((res as any).tabs[0].actor).toBe('t1');
  });

  it('emits notification packets as events', () => {
    const sock = new MockTcp();
    const drv = new RdpDriver({ socket: sock as any });
    drv.markConnected();
    const seen: unknown[] = [];
    drv.on('root.tabListChanged', (p) => seen.push(p));
    // No outstanding request → treated as notification (has `type`)
    sock.reply({ from: 'root', type: 'tabListChanged' });
    expect(seen).toEqual([{ from: 'root', type: 'tabListChanged' }]);
  });

  it('rejects on protocol error packet', async () => {
    const sock = new MockTcp();
    const drv = new RdpDriver({ socket: sock as any });
    drv.markConnected();
    const p = drv.call('thread1', { type: 'setBreakpoint' });
    sock.reply({ from: 'thread1', error: 'noScript', message: 'no script' });
    await expect(p).rejects.toMatchObject({ code: 'noScript' });
  });

  it('rejects all pending on socket close', async () => {
    const sock = new MockTcp();
    const drv = new RdpDriver({ socket: sock as any });
    drv.markConnected();
    const p = drv.call('root', { type: 'listTabs' });
    sock.end();
    await expect(p).rejects.toMatchObject({ name: 'DriverDisconnectedError' });
  });

  it('serialises requests to the same actor', async () => {
    const sock = new MockTcp();
    const drv = new RdpDriver({ socket: sock as any });
    drv.markConnected();
    const p1 = drv.call('thread1', { type: 'frames' });
    const p2 = drv.call('thread1', { type: 'sources' });
    // Only one frame should be written initially (second waits behind p1).
    // Allow one microtask tick for the first send to enqueue.
    await Promise.resolve();
    expect(sock.written).toHaveLength(1);
    sock.reply({ from: 'thread1', frames: [] });
    await p1;
    await Promise.resolve();
    expect(sock.written).toHaveLength(2);
    sock.reply({ from: 'thread1', sources: [] });
    await p2;
  });
});
