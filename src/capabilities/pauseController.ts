import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { RdpDriver } from '../drivers/rdp/RdpDriver.js';
import { ScriptCache, BreakpointPosition } from '../session/caches.js';
import {
  BreakpointUnresolvedError,
  NotPausedError,
} from './errors.js';
import {
  BreakpointEntry, BreakpointOptions, PauseController, PauseInfo, CallframeResult,
} from './types.js';

interface PausedFrame {
  from: string;
  type: string;
  actor: string;
  why: { type: string; [k: string]: unknown };
  /** Firefox 70+ uses `frame`; the legacy `currentFrame` alias is also tolerated. */
  frame?: { actor: string; where?: { source?: { url?: string }; line?: number; column?: number } };
  currentFrame?: { actor: string; where?: { source?: { url?: string }; line?: number; column?: number } };
}

export function makePauseController(rdp: RdpDriver, scripts: ScriptCache): PauseController {
  let threadActor: string | null = null;
  let pauseCtx: PauseInfo | null = null;
  const breakpoints = new Map<string, BreakpointEntry>();
  const ee = rdp as unknown as EventEmitter;

  // Persistent paused-event handler — installed during attach, updates pauseCtx always.
  function onPausedEvent(f: PausedFrame): void {
    recordPauseCtx(f);
    // Notify any one-shot waiters.
    ee.emit('__pauseController.paused', f);
  }

  function waitForPaused(timeoutMs = 30000): Promise<PausedFrame> {
    return new Promise<PausedFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        ee.off('__pauseController.paused', handler);
        reject(new Error('pauseController: timeout waiting for paused'));
      }, timeoutMs);
      function handler(f: PausedFrame) {
        clearTimeout(timer);
        ee.off('__pauseController.paused', handler);
        resolve(f);
      }
      ee.on('__pauseController.paused', handler);
    });
  }

  function recordPauseCtx(f: PausedFrame): void {
    pauseCtx = {
      threadActor: threadActor!,
      pauseActor: f.actor,
      frameActor: (f.frame ?? f.currentFrame)?.actor ?? '',
      why: f.why,
      // Surface both keys so callers expecting the legacy `currentFrame` name and
      // the modern `frame` name both see something useful.
      currentFrame: (f.frame ?? f.currentFrame) as PauseInfo['currentFrame'],
    };
  }

  return {
    async attach(t) {
      threadActor = t;
      // Install persistent paused listener before sending attach.
      ee.on(`${t}.paused`, onPausedEvent);
      // Firefox 150 rejects `attach` with no `options` field
      // ("undefined passed where a value is required"). We send the documented
      // default-shaped options object — every field stays at its inactive
      // value so attach does not change any debugger semantics.
      await rdp.call(t, {
        type: 'attach',
        options: {
          ignoreCaughtExceptions: true,
          pauseOnExceptions: false,
          shouldShowOverlay: false,
          shouldIncludeSavedFrames: false,
          shouldIncludeAsyncLiveFrames: false,
          skipBreakpoints: false,
          logEventBreakpoints: false,
          breakpoints: {},
          eventBreakpoints: [],
        },
      });
      // Firefox 150 leaves the thread Running after attach (no initial-pause); the
      // resume here is a no-op when no pause is outstanding, but still safe to
      // keep so callers don't accidentally inherit a paused state on older builds.
      try { await rdp.call(t, { type: 'resume' }); } catch { /* already running */ }
    },
    isAttached() { return threadActor !== null; },

    async setBreakpointByLocation(sourceUrl, line, column, opts) {
      if (!threadActor) throw new Error('pauseController: not attached');
      const sourcesReply = await rdp.call<{ sources: Array<{ actor: string; url: string }> }>(
        threadActor, { type: 'sources' },
      );
      const source = (sourcesReply.sources ?? []).find(s => s.url === sourceUrl);
      if (!source) {
        throw new BreakpointUnresolvedError('noScript', { sourceUrl, line });
      }

      // Firefox 150 resolves location via Debugger.Source.getPossibleBreakpoints.
      // We snap the requested column to the nearest legal position; if the source
      // actor doesn't support the packet or returns no positions, we fall back to
      // omitting the column and let the server LSP-resolve to the line's first
      // legal stop. See docs/superpowers/specs/2026-06-12-m7.07-column-index-fix-design.md
      let positions: BreakpointPosition[] = [];
      const cachedScript = scripts.list().find(s => s.url === sourceUrl);
      const fetchPositions = async (): Promise<BreakpointPosition[]> => {
        try {
          const reply = await rdp.call<{ positions?: BreakpointPosition[] }>(
            source.actor,
            {
              type: 'getPossibleBreakpoints',
              start: { line, column: 0 },
              end: { line: line + 1, column: 0 },
            },
          );
          return reply.positions ?? [];
        } catch {
          return [];
        }
      };
      if (cachedScript) {
        positions = await scripts.getOrComputePositions(cachedScript.id, line, fetchPositions);
      } else {
        positions = await fetchPositions();
      }

      let actualColumn: number | undefined;
      if (column !== undefined) {
        actualColumn = snapColumn(positions, column);
      } else if (positions.length > 0) {
        actualColumn = positions[0]!.column;
      }

      const location: { sourceUrl: string; line: number; column?: number } = { sourceUrl, line };
      if (actualColumn !== undefined) location.column = actualColumn;

      const reply = await rdp.call<{ error?: string }>(
        threadActor,
        { type: 'setBreakpoint', location, options: {} },
      );
      if (reply.error) {
        throw new BreakpointUnresolvedError(reply.error as 'noScript' | 'noCodeAtLineColumn', { sourceUrl, line });
      }
      const bpId = `bp-${randomBytes(4).toString('hex')}`;
      const entry: BreakpointEntry = {
        bpId,
        bpActor: threadActor,
        sourceActor: source.actor,
        sourceUrl,
        line,
        ...(column !== undefined ? { column } : {}),
        ...(column !== undefined ? { requestedColumn: column } : {}),
        actualLine: line,
        ...(actualColumn !== undefined ? { actualColumn } : {}),
        ...((opts as BreakpointOptions | undefined)?.columnTolerance ? { columnTolerance: opts!.columnTolerance } : {}),
      };
      breakpoints.set(bpId, entry);
      return entry;
    },

    async setBreakpointByText(text, sourceUrl) {
      const candidates = scripts.list().filter(s => !sourceUrl || s.url === sourceUrl);
      for (const cached of candidates) {
        const lines = cached.source.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const idx = (lines[i] ?? '').indexOf(text);
          if (idx >= 0) {
            return await this.setBreakpointByLocation(cached.url, i + 1, idx + 1);
          }
        }
      }
      throw new BreakpointUnresolvedError('noScript', { text, sourceUrl });
    },

    async removeBreakpoint(bpId) {
      const entry = breakpoints.get(bpId);
      if (!entry) return;
      try {
        // Firefox 150: thread.removeBreakpoint accepts the same location object as
        // setBreakpoint. The legacy per-bp-actor 'delete' packet is gone.
        await rdp.call(entry.bpActor, {
          type: 'removeBreakpoint',
          location: {
            sourceUrl: entry.sourceUrl,
            line: entry.line,
            ...(entry.column !== undefined ? { column: entry.column } : {}),
          },
        });
      } catch { /* best-effort */ }
      breakpoints.delete(bpId);
    },

    listBreakpoints() { return Array.from(breakpoints.values()); },

    async pause() {
      if (!threadActor) throw new Error('pauseController: not attached');
      // waitForPaused must be set up before sending interrupt so the event isn't missed.
      const wait = waitForPaused();
      await rdp.call(threadActor, { type: 'interrupt' });
      await wait; // pauseCtx is recorded by the persistent handler + relay
    },

    async resume() {
      if (!threadActor) throw new Error('pauseController: not attached');
      await rdp.call(threadActor, { type: 'resume' });
      pauseCtx = null;
    },

    async stepOver() {
      if (!threadActor) throw new NotPausedError();
      // Send the step command; the persistent handler updates pauseCtx when paused fires.
      await rdp.call(threadActor, { type: 'resume', resumeLimit: { type: 'next' } });
    },

    async stepInto() {
      if (!threadActor) throw new NotPausedError();
      await rdp.call(threadActor, { type: 'resume', resumeLimit: { type: 'step' } });
    },

    async stepOut() {
      if (!threadActor) throw new NotPausedError();
      await rdp.call(threadActor, { type: 'resume', resumeLimit: { type: 'finish' } });
    },

    getPausedInfo() { return pauseCtx; },

    async evaluateOnCallframe(expression) {
      if (!pauseCtx) throw new NotPausedError();
      // waitForPaused must be registered before sending the command.
      const wait = waitForPaused();
      await rdp.call(pauseCtx.threadActor, {
        type: 'clientEvaluate',
        expression,
        frame: pauseCtx.frameActor,
      });
      const f = await wait; // pauseCtx is already updated by persistent handler; f is relayed here
      const ff = f.why.frameFinished as { return?: unknown; throw?: unknown } | undefined;
      if (ff?.throw !== undefined) {
        return { value: undefined, exceptionDetails: ff.throw } as CallframeResult;
      }
      return { value: ff?.return };
    },

    async freezeCurrent() {
      if (!threadActor) throw new Error('pauseController: not attached');
      const wait = waitForPaused();
      await rdp.call(threadActor, { type: 'interrupt' });
      await wait;
      // Stay paused — no auto-resume.
    },

    async unfreezeCurrent() {
      if (!threadActor) throw new Error('pauseController: not attached');
      await rdp.call(threadActor, { type: 'resume' });
      pauseCtx = null;
    },
  };
}

function snapColumn(positions: BreakpointPosition[], desiredCol: number): number | undefined {
  if (positions.length === 0) return undefined;
  if (positions.length === 1) return positions[0]!.column;
  let best = positions[0]!;
  let bestDist = Math.abs(best.column - desiredCol);
  for (const p of positions.slice(1)) {
    const dist = Math.abs(p.column - desiredCol);
    if (dist < bestDist || (dist === bestDist && p.column >= desiredCol && best.column < desiredCol)) {
      best = p;
      bestDist = dist;
    }
  }
  return best.column;
}

export const __testing = { snapColumn };
