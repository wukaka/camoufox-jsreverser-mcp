import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { bootstrapRdp } from '../../../../src/drivers/rdp/bootstrap.js';

interface FakeDriver { call: ReturnType<typeof vi.fn>; on: EventEmitter['on']; off: EventEmitter['off']; emit: EventEmitter['emit'] }

function fakeDriver(): FakeDriver {
  const ee = new EventEmitter();
  const call = vi.fn();
  return Object.assign(ee, { call }) as unknown as FakeDriver;
}

describe('bootstrapRdp (synchronous)', () => {
  it('walks getRoot → listTabs → getTarget → getWatcher and returns the full tree', async () => {
    const drv = fakeDriver();
    drv.call
      .mockImplementationOnce(async (actor: string, req: { type: string }) => {
        expect(actor).toBe('root');
        expect(req.type).toBe('getRoot');
        return { from: 'root', preferenceActor: 'prefActor-1', perfActor: 'perfActor-1' };
      })
      .mockImplementationOnce(async (actor: string, req: { type: string }) => {
        expect(actor).toBe('root');
        expect(req.type).toBe('listTabs');
        return { from: 'root', tabs: [{ actor: 'tabDesc-1', selected: true }], selected: 0 };
      })
      .mockImplementationOnce(async (actor: string, req: { type: string }) => {
        expect(actor).toBe('tabDesc-1');
        expect(req.type).toBe('getTarget');
        return { from: 'tabDesc-1', frame: { actor: 'targetActor-1', threadActor: 'thread-1' } };
      })
      .mockImplementationOnce(async (actor: string, req: { type: string }) => {
        expect(actor).toBe('tabDesc-1');
        expect(req.type).toBe('getWatcher');
        return { from: 'tabDesc-1', actor: 'watcher-1' };
      })
      // The follow-up watchTargets calls are best-effort; resolve them so the bootstrap
      // doesn't fall into the catch block.
      .mockResolvedValueOnce({ from: 'watcher-1' })
      .mockResolvedValueOnce({ from: 'watcher-1' });

    const tree = await bootstrapRdp(drv as any);
    expect(tree).toEqual({
      root: 'root',
      descriptor: 'tabDesc-1',
      watcher: 'watcher-1',
      currentTarget: 'targetActor-1',
      threadActor: 'thread-1',
      prefActor: 'prefActor-1',
      perfActor: 'perfActor-1',
    });
  });

  it('rejects when getRoot is missing preferenceActor / perfActor', async () => {
    const drv = fakeDriver();
    drv.call.mockResolvedValueOnce({ from: 'root' });
    await expect(bootstrapRdp(drv as any)).rejects.toThrow(/preferenceActor/i);
  });

  it('rejects when listTabs returns no tabs', async () => {
    const drv = fakeDriver();
    drv.call
      .mockResolvedValueOnce({ from: 'root', preferenceActor: 'p', perfActor: 'q' })
      .mockResolvedValueOnce({ from: 'root', tabs: [] });
    await expect(bootstrapRdp(drv as any)).rejects.toThrow(/no tabs/i);
  });

  it('rejects when getTarget omits frame.actor or frame.threadActor', async () => {
    const drv = fakeDriver();
    drv.call
      .mockResolvedValueOnce({ from: 'root', preferenceActor: 'p', perfActor: 'q' })
      .mockResolvedValueOnce({ from: 'root', tabs: [{ actor: 'd', selected: true }] })
      .mockResolvedValueOnce({ from: 'd', frame: { actor: 't' /* threadActor missing */ } });
    await expect(bootstrapRdp(drv as any)).rejects.toThrow(/threadActor/);
  });

  it('rejects when getWatcher returns no actor', async () => {
    const drv = fakeDriver();
    drv.call
      .mockResolvedValueOnce({ from: 'root', preferenceActor: 'p', perfActor: 'q' })
      .mockResolvedValueOnce({ from: 'root', tabs: [{ actor: 'd', selected: true }] })
      .mockResolvedValueOnce({ from: 'd', frame: { actor: 't', threadActor: 'th' } })
      .mockResolvedValueOnce({ from: 'd' });
    await expect(bootstrapRdp(drv as any)).rejects.toThrow(/getWatcher/);
  });

  it('does not block when watchTargets fails — synchronous tree is the source of truth', async () => {
    const drv = fakeDriver();
    drv.call
      .mockResolvedValueOnce({ from: 'root', preferenceActor: 'p', perfActor: 'q' })
      .mockResolvedValueOnce({ from: 'root', tabs: [{ actor: 'd', selected: true }] })
      .mockResolvedValueOnce({ from: 'd', frame: { actor: 't', threadActor: 'th' } })
      .mockResolvedValueOnce({ from: 'd', actor: 'w' })
      .mockRejectedValueOnce(new Error('watchTargets nope'));
    const tree = await bootstrapRdp(drv as any);
    expect(tree.currentTarget).toBe('t');
    expect(tree.threadActor).toBe('th');
  });
});
