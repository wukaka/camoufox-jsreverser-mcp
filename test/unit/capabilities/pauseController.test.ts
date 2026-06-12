import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { makePauseController } from '../../../src/capabilities/pauseController.js';
import { __testing as pauseControllerTesting } from '../../../src/capabilities/pauseController.js';
import { ScriptCache } from '../../../src/session/caches.js';

interface FakeRdp { call: ReturnType<typeof vi.fn>; on: EventEmitter['on']; emit: EventEmitter['emit']; off: EventEmitter['off'] }

function fakeRdp(): FakeRdp {
  const ee = new EventEmitter();
  const call = vi.fn();
  return Object.assign(ee, { call }) as unknown as FakeRdp;
}

describe('pauseController', () => {
  it('attach sends thread `attach` with the documented options object then resumes', async () => {
    const rdp = fakeRdp();
    rdp.call.mockResolvedValueOnce({ from: 'thread-1' });   // attach reply
    rdp.call.mockResolvedValueOnce({ from: 'thread-1', type: 'resumed' });  // resume reply
    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    expect(pc.isAttached()).toBe(true);
    // Firefox 150 rejects `attach` without options.
    const [actor1, req1] = rdp.call.mock.calls[0];
    expect(actor1).toBe('thread-1');
    expect(req1.type).toBe('attach');
    expect(req1.options).toEqual(expect.objectContaining({
      ignoreCaughtExceptions: true,
      pauseOnExceptions: false,
      breakpoints: {},
      eventBreakpoints: [],
    }));
    expect(rdp.call).toHaveBeenNthCalledWith(2, 'thread-1', { type: 'resume' });
  });

  it('setBreakpointByLocation pre-resolves the source then routes setBreakpoint through the thread actor', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1' })   // attach
      .mockResolvedValueOnce({ from: 'thread-1' });  // resume

    rdp.call.mockResolvedValueOnce({
      from: 'thread-1',
      sources: [
        { actor: 'src-1', url: 'https://a/x.js' },
        { actor: 'src-2', url: 'https://a/y.js' },
      ],
    });
    rdp.call.mockResolvedValueOnce({ from: 'src-1', positions: [] });  // getPossibleBreakpoints reply
    rdp.call.mockResolvedValueOnce({ from: 'thread-1' });  // setBreakpoint reply

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    const bp = await pc.setBreakpointByLocation('https://a/x.js', 10);
    expect(bp.sourceActor).toBe('src-1');
    // Firefox 150 no longer returns a bp actor; threadActor doubles as the owner.
    expect(bp.bpActor).toBe('thread-1');
    expect(pc.listBreakpoints()).toHaveLength(1);
    expect(rdp.call).toHaveBeenLastCalledWith('thread-1', {
      type: 'setBreakpoint',
      location: { sourceUrl: 'https://a/x.js', line: 10 },
      options: {},
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

  it('removeBreakpoint sends thread.removeBreakpoint with the same location object', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1' })  // attach
      .mockResolvedValueOnce({ from: 'thread-1' })  // resume
      .mockResolvedValueOnce({ from: 'thread-1', sources: [{ actor: 'src-1', url: 'https://a' }] })
      .mockResolvedValueOnce({ from: 'src-1', positions: [] })  // getPossibleBreakpoints reply
      .mockResolvedValueOnce({ from: 'thread-1' })  // setBreakpoint
      .mockResolvedValueOnce({ from: 'thread-1' }); // removeBreakpoint

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    const bp = await pc.setBreakpointByLocation('https://a', 1);
    await pc.removeBreakpoint(bp.bpId);
    expect(pc.listBreakpoints()).toHaveLength(0);
    expect(rdp.call).toHaveBeenLastCalledWith('thread-1', {
      type: 'removeBreakpoint',
      location: { sourceUrl: 'https://a', line: 1 },
    });
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

describe('snapColumn', () => {
  const { snapColumn } = pauseControllerTesting;

  it('returns undefined when positions array is empty', () => {
    expect(snapColumn([], 10)).toBeUndefined();
  });

  it('returns the only position when positions has length 1', () => {
    expect(snapColumn([{ line: 4, column: 12 }], 5)).toBe(12);
  });

  it('returns the closest position to desiredCol', () => {
    expect(snapColumn(
      [{ line: 4, column: 4 }, { line: 4, column: 12 }, { line: 4, column: 20 }],
      11,
    )).toBe(12);
  });

  it('tie-breaks toward the position at or after desiredCol', () => {
    expect(snapColumn(
      [{ line: 4, column: 5 }, { line: 4, column: 15 }],
      10,
    )).toBe(15);
  });
});

describe('pauseController setBreakpoint with possibleBreakpoints snap', () => {
  it('snaps user column to the nearest legal position before setBreakpoint', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1' })  // attach
      .mockResolvedValueOnce({ from: 'thread-1' }); // post-attach resume

    rdp.call.mockResolvedValueOnce({
      from: 'thread-1',
      sources: [{ actor: 'src-1', url: 'https://a/x.js' }],
    });
    rdp.call.mockResolvedValueOnce({
      from: 'src-1',
      positions: [
        { line: 4, column: 4 },
        { line: 4, column: 12 },
        { line: 4, column: 20 },
      ],
    });
    rdp.call.mockResolvedValueOnce({ from: 'thread-1' });  // setBreakpoint reply

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    const bp = await pc.setBreakpointByLocation('https://a/x.js', 4, 11);

    expect(bp.requestedColumn).toBe(11);
    expect(bp.actualColumn).toBe(12);
    expect(bp.actualLine).toBe(4);
    expect(rdp.call).toHaveBeenLastCalledWith('thread-1', {
      type: 'setBreakpoint',
      location: { sourceUrl: 'https://a/x.js', line: 4, column: 12 },
      options: {},
    });
  });

  it('omits column when getPossibleBreakpoints returns empty (fallback path)', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1' })
      .mockResolvedValueOnce({ from: 'thread-1' });

    rdp.call.mockResolvedValueOnce({
      from: 'thread-1',
      sources: [{ actor: 'src-1', url: 'https://a/x.js' }],
    });
    rdp.call.mockResolvedValueOnce({ from: 'src-1', positions: [] });
    rdp.call.mockResolvedValueOnce({ from: 'thread-1' });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    const bp = await pc.setBreakpointByLocation('https://a/x.js', 7, 99);

    expect(bp.actualColumn).toBeUndefined();
    expect(rdp.call).toHaveBeenLastCalledWith('thread-1', {
      type: 'setBreakpoint',
      location: { sourceUrl: 'https://a/x.js', line: 7 },
      options: {},
    });
  });

  it('omits column when getPossibleBreakpoints itself throws', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1' })
      .mockResolvedValueOnce({ from: 'thread-1' });

    rdp.call.mockResolvedValueOnce({
      from: 'thread-1',
      sources: [{ actor: 'src-1', url: 'https://a/x.js' }],
    });
    rdp.call.mockRejectedValueOnce(new Error('unknownPacketType'));
    rdp.call.mockResolvedValueOnce({ from: 'thread-1' });

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    const bp = await pc.setBreakpointByLocation('https://a/x.js', 9, 3);

    expect(bp.actualColumn).toBeUndefined();
    expect(rdp.call).toHaveBeenLastCalledWith('thread-1', {
      type: 'setBreakpoint',
      location: { sourceUrl: 'https://a/x.js', line: 9 },
      options: {},
    });
  });
});

describe('pauseController removeBreakpoint location', () => {
  it('sends removeBreakpoint with actualLine/actualColumn from the snap', async () => {
    const rdp = fakeRdp();
    rdp.call
      .mockResolvedValueOnce({ from: 'thread-1' })
      .mockResolvedValueOnce({ from: 'thread-1' });
    rdp.call.mockResolvedValueOnce({
      from: 'thread-1',
      sources: [{ actor: 'src-1', url: 'https://a/x.js' }],
    });
    rdp.call.mockResolvedValueOnce({
      from: 'src-1',
      positions: [{ line: 4, column: 4 }, { line: 4, column: 12 }],
    });
    rdp.call.mockResolvedValueOnce({ from: 'thread-1' });  // setBreakpoint
    rdp.call.mockResolvedValueOnce({ from: 'thread-1' });  // removeBreakpoint

    const pc = makePauseController(rdp as any, new ScriptCache());
    await pc.attach('thread-1');
    const bp = await pc.setBreakpointByLocation('https://a/x.js', 4, 11);
    await pc.removeBreakpoint(bp.bpId);

    expect(rdp.call).toHaveBeenLastCalledWith('thread-1', {
      type: 'removeBreakpoint',
      location: { sourceUrl: 'https://a/x.js', line: 4, column: 12 },
    });
  });
});
