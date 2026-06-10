import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makePauseController } from '../../../src/capabilities/pauseController.js';
import { ScriptCache } from '../../../src/session/caches.js';

interface FakeRdp { call: ReturnType<typeof vi.fn>; on: EventEmitter['on']; emit: EventEmitter['emit']; off: EventEmitter['off'] }

function fakeRdp(): FakeRdp {
  const ee = new EventEmitter();
  const call = vi.fn();
  return Object.assign(ee, { call }) as unknown as FakeRdp;
}

describe('pauseController', () => {
  it('attach sends thread `attach` and resumes from initial-pause', async () => {
    const rdp = fakeRdp();
    // attach reply
    rdp.call.mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'pause-init' });
    // resume reply (transition out of initial pause)
    rdp.call.mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });
    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    expect(pc.isAttached()).toBe(true);
    expect(rdp.call).toHaveBeenNthCalledWith(1, 'thread-1', { type: 'attach' });
    expect(rdp.call).toHaveBeenNthCalledWith(2, 'thread-1', { type: 'resume' });
  });

  it('setBreakpointByLocation walks getSources, finds source actor, calls setBreakpoint', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'p0' })
      .mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });

    // getSources
    rdp.call.mockResolvedValueOnce({
      from: 'thread-1',
      sources: [
        { actor: 'src-1', url: 'https://a/x.js' },
        { actor: 'src-2', url: 'https://a/y.js' },
      ],
    });
    // setBreakpoint reply
    rdp.call.mockResolvedValueOnce({
      from: 'src-1',
      actor: 'bp-1',
      actualLocation: { line: 12, column: 4 },
    });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    const bp = await pc.setBreakpointByLocation('https://a/x.js', 10);
    expect(bp.bpActor).toBe('bp-1');
    expect(bp.sourceActor).toBe('src-1');
    expect(bp.actualLine).toBe(12);
    expect(pc.listBreakpoints()).toHaveLength(1);
    expect(rdp.call).toHaveBeenLastCalledWith('src-1', {
      type: 'setBreakpoint',
      location: { line: 10, column: undefined },
    });
  });

  it('setBreakpointByLocation throws BreakpointUnresolvedError on noScript', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'p0' })
      .mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });
    rdp.call.mockResolvedValueOnce({
      from: 'thread-1',
      sources: [],
    });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    await expect(pc.setBreakpointByLocation('https://missing/x.js', 1)).rejects.toThrow();
  });

  it('removeBreakpoint deletes by id and calls bp.delete', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'p0' })
      .mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' })
      .mockResolvedValueOnce({ from: 'thread-1', sources: [{ actor: 'src-1', url: 'https://a' }] })
      .mockResolvedValueOnce({ from: 'src-1', actor: 'bp-1', actualLocation: { line: 1 } })
      .mockResolvedValueOnce({ from: 'bp-1' });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    const bp = await pc.setBreakpointByLocation('https://a', 1);
    await pc.removeBreakpoint(bp.bpId);
    expect(pc.listBreakpoints()).toHaveLength(0);
    expect(rdp.call).toHaveBeenLastCalledWith('bp-1', { type: 'delete' });
  });

  it('pause issues interrupt and records PauseInfo on paused event', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'p0' })
      .mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });

    // interrupt
    rdp.call.mockImplementationOnce(async () => {
      queueMicrotask(() => {
        rdp.emit('thread-1.paused', {
          from: 'thread-1',
          type: 'paused',
          actor: 'pause-1',
          why: { type: 'interrupted' },
          currentFrame: { actor: 'frame-1', where: { source: { url: 'https://a' }, line: 5 } },
        });
      });
      return { from: 'thread-1' };
    });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    await pc.pause();
    const info = pc.getPausedInfo();
    expect(info).not.toBeNull();
    expect(info?.pauseActor).toBe('pause-1');
    expect(info?.frameActor).toBe('frame-1');
    expect(info?.why.type).toBe('interrupted');
  });

  it('resume clears pauseCtx and sends resume to thread', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'p0' })
      .mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });
    rdp.call.mockImplementationOnce(async () => {
      queueMicrotask(() => {
        rdp.emit('thread-1.paused', {
          from: 'thread-1', type: 'paused', actor: 'pause-1',
          why: { type: 'interrupted' }, currentFrame: { actor: 'frame-1', where: {} },
        });
      });
      return { from: 'thread-1' };
    });
    rdp.call.mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    await pc.pause();
    await pc.resume();
    expect(pc.getPausedInfo()).toBeNull();
    expect(rdp.call).toHaveBeenLastCalledWith('thread-1', { type: 'resume' });
  });

  it('stepOver sends resume with resumeLimit type=next', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'p0' })
      .mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });
    rdp.call.mockImplementationOnce(async () => {
      queueMicrotask(() => {
        rdp.emit('thread-1.paused', {
          from: 'thread-1', type: 'paused', actor: 'pause-1',
          why: { type: 'interrupted' }, currentFrame: { actor: 'frame-1', where: {} },
        });
      });
      return { from: 'thread-1' };
    });
    rdp.call.mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    await pc.pause();
    await pc.stepOver();
    expect(rdp.call).toHaveBeenLastCalledWith('thread-1', { type: 'resume', resumeLimit: { type: 'next' } });
  });

  it('evaluateOnCallframe wraps clientEvaluate + waits for the next paused', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'p0' })
      .mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });
    rdp.call.mockImplementationOnce(async () => {
      queueMicrotask(() => {
        rdp.emit('thread-1.paused', {
          from: 'thread-1', type: 'paused', actor: 'pause-1',
          why: { type: 'interrupted' }, currentFrame: { actor: 'frame-1', where: {} },
        });
      });
      return { from: 'thread-1' };
    });

    // clientEvaluate call — returns immediately, then paused event arrives
    rdp.call.mockImplementationOnce(async () => {
      queueMicrotask(() => {
        rdp.emit('thread-1.paused', {
          from: 'thread-1', type: 'paused', actor: 'pause-2',
          why: { type: 'clientEvaluate', frameFinished: { return: { type: 'number', value: 42 } } },
          currentFrame: { actor: 'frame-1', where: {} },
        });
      });
      return { from: 'thread-1' };
    });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    await pc.pause();
    const r = await pc.evaluateOnCallframe('1 + 41');
    expect((r.value as { value?: unknown })?.value).toBe(42);
    // pauseCtx should now reflect pause-2
    expect(pc.getPausedInfo()?.pauseActor).toBe('pause-2');
  });

  it('freezeCurrent stays paused (no auto-resume)', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1', type: 'paused', why: { type: 'attached' }, actor: 'p0' })
      .mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });
    rdp.call.mockImplementationOnce(async () => {
      queueMicrotask(() => {
        rdp.emit('thread-1.paused', {
          from: 'thread-1', type: 'paused', actor: 'pause-1',
          why: { type: 'interrupted' }, currentFrame: { actor: 'frame-1', where: {} },
        });
      });
      return { from: 'thread-1' };
    });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    await pc.freezeCurrent();
    expect(pc.getPausedInfo()).not.toBeNull();
  });
});
