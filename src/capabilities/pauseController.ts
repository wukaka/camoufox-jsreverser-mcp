import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { RdpDriver } from '../drivers/rdp/RdpDriver.js';
import { ScriptCache } from '../session/caches.js';
import {
  BreakpointUnresolvedError,
  NotPausedError,
} from './errors.js';
import {
  BreakpointEntry, PauseController, PauseInfo, CallframeResult,
} from './types.js';

interface PausedFrame {
  from: string;
  type: string;
  actor: string;
  why: { type: string; [k: string]: unknown };
  currentFrame: { actor: string; where?: { source?: { url?: string }; line?: number; column?: number } };
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
      frameActor: f.currentFrame?.actor ?? '',
      why: f.why,
      currentFrame: f.currentFrame,
    };
  }

  return {
    async attach(t) {
      threadActor = t;
      // Install persistent paused listener before sending attach.
      ee.on(`${t}.paused`, onPausedEvent);
      await rdp.call(t, { type: 'attach' });
      // Resume from initial-pause to enter Running state.
      await rdp.call(t, { type: 'resume' });
    },
    isAttached() { return threadActor !== null; },

    async setBreakpointByLocation(sourceUrl, line, column) {
      if (!threadActor) throw new Error('pauseController: not attached');
      const sourcesReply = await rdp.call<{ sources: Array<{ actor: string; url: string }> }>(
        threadActor, { type: 'sources' },
      );
      const source = (sourcesReply.sources ?? []).find(s => s.url === sourceUrl);
      if (!source) {
        throw new BreakpointUnresolvedError('noScript', { sourceUrl, line });
      }
      const reply = await rdp.call<{ actor?: string; actualLocation?: { line: number; column?: number }; error?: string }>(
        source.actor,
        { type: 'setBreakpoint', location: { line, column } },
      );
      if (reply.error) {
        throw new BreakpointUnresolvedError(reply.error as 'noScript' | 'noCodeAtLineColumn', { sourceUrl, line });
      }
      if (!reply.actor) {
        throw new BreakpointUnresolvedError('noScript', { sourceUrl, line });
      }
      const bpId = `bp-${randomBytes(4).toString('hex')}`;
      const entry: BreakpointEntry = {
        bpId,
        bpActor: reply.actor,
        sourceActor: source.actor,
        sourceUrl,
        line,
        column,
        actualLine: reply.actualLocation?.line,
        actualColumn: reply.actualLocation?.column,
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
      try { await rdp.call(entry.bpActor, { type: 'delete' }); } catch { /* best-effort */ }
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
