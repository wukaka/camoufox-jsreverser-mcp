import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { bootstrapRdp } from '../../../../src/drivers/rdp/bootstrap.js';

interface FakeDriver { call: ReturnType<typeof vi.fn>; on: EventEmitter['on']; emit: EventEmitter['emit'] }

function fakeDriver(): FakeDriver {
  const ee = new EventEmitter();
  const call = vi.fn();
  return Object.assign(ee, { call }) as unknown as FakeDriver;
}

describe('bootstrapRdp', () => {
  it('walks root → listTabs → descriptor → watcher → target', async () => {
    const drv = fakeDriver();
    // 1. listTabs returns one selected tab descriptor
    drv.call.mockImplementationOnce(async (actor: string, req: { type: string }) => {
      expect(actor).toBe('root');
      expect(req.type).toBe('listTabs');
      return { from: 'root', tabs: [{ actor: 'tabDesc-1', selected: true, url: 'https://a' }], selected: 0 };
    });
    // 2. getWatcher on descriptor returns watcher actor
    drv.call.mockImplementationOnce(async (actor: string, req: { type: string }) => {
      expect(actor).toBe('tabDesc-1');
      expect(req.type).toBe('getWatcher');
      return { from: 'tabDesc-1', actor: 'watcher-1' };
    });
    // 3. watchTargets frame
    drv.call.mockImplementationOnce(async (actor: string, req: { type: string; targetType: string }) => {
      expect(actor).toBe('watcher-1');
      expect(req.type).toBe('watchTargets');
      expect(req.targetType).toBe('frame');
      return { from: 'watcher-1' };
    });
    // 4. watchTargets worker
    drv.call.mockImplementationOnce(async (actor: string, req: { type: string; targetType: string }) => {
      expect(actor).toBe('watcher-1');
      expect(req.targetType).toBe('worker');
      return { from: 'watcher-1' };
    });

    // Simulate target-available-form for the frame target landing as a watcher event after watchTargets:
    queueMicrotask(() => {
      drv.emit('watcher-1.target-available-form', { from: 'watcher-1', target: { actor: 'targetActor-1', browsingContextID: 42, targetType: 'frame' } });
    });

    const tree = await bootstrapRdp(drv as any);
    expect(tree.root).toBe('root');
    expect(tree.descriptor).toBe('tabDesc-1');
    expect(tree.watcher).toBe('watcher-1');
    expect(tree.currentTarget).toBe('targetActor-1');
  });

  it('rejects when listTabs returns no selected tab', async () => {
    const drv = fakeDriver();
    drv.call.mockResolvedValueOnce({ from: 'root', tabs: [], selected: -1 });
    await expect(bootstrapRdp(drv as any)).rejects.toThrow(/no.*selected.*tab/i);
  });

  it('rejects when target-available-form does not arrive in time', async () => {
    const drv = fakeDriver();
    drv.call
      .mockResolvedValueOnce({ from: 'root', tabs: [{ actor: 'd1', selected: true }], selected: 0 })
      .mockResolvedValueOnce({ from: 'd1', actor: 'w1' })
      .mockResolvedValueOnce({ from: 'w1' })
      .mockResolvedValueOnce({ from: 'w1' });
    await expect(bootstrapRdp(drv as any, { timeoutMs: 50 })).rejects.toThrow(/timeout/i);
  });
});
