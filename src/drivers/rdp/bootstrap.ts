import { EventEmitter } from 'node:events';
import { RdpDriver } from './RdpDriver.js';

export interface ActorTree {
  root: string;
  descriptor: string;
  watcher: string;
  currentTarget: string;
  /** thread actor on the currentTarget — needed by pauseController.attach(). */
  threadActor: string;
  /** root-level Mozilla PreferenceActor — needed by makeRuntimePrefs. */
  prefActor: string;
  /** root-level Mozilla PerfActor — needed by makePerformanceProbe. */
  perfActor: string;
}

export interface BootstrapOpts {
  /** Max wait for the watcher's target-available-form fallback. Default 3000ms. */
  timeoutMs?: number;
}

interface TabDescriptor { actor: string; selected?: boolean; url?: string }

interface GetRootReply {
  preferenceActor?: string;
  perfActor?: string;
  [k: string]: unknown;
}

interface GetTargetReply {
  frame?: { actor?: string; threadActor?: string; [k: string]: unknown };
  [k: string]: unknown;
}

type TargetPayload = { from?: string; target?: { actor?: string; targetType?: string; threadActor?: string } };

/**
 * Discover the RDP actor tree against Firefox 150+.
 *
 * Synchronous path (works on all current Firefox builds):
 *   root.getRoot          → preferenceActor + perfActor
 *   root.listTabs         → tab descriptor for the selected tab
 *   descriptor.getTarget  → currentTarget actor + threadActor
 *   descriptor.getWatcher → watcher actor
 *
 * Watcher event subscription (`watchTargets` → `target-available-form`) is kept as a
 * best-effort follow-up so the RDP-aware workerTopology continues to receive
 * new-worker notifications, but is no longer on the critical path. Failure does
 * not block bootstrap.
 */
export async function bootstrapRdp(rdp: RdpDriver, opts: BootstrapOpts = {}): Promise<ActorTree> {
  const root = 'root';

  const rootReply = await rdp.call<GetRootReply>(root, { type: 'getRoot' });
  const prefActor = String(rootReply.preferenceActor ?? '');
  const perfActor = String(rootReply.perfActor ?? '');
  if (!prefActor) throw new Error('bootstrapRdp: getRoot missing preferenceActor');
  if (!perfActor) throw new Error('bootstrapRdp: getRoot missing perfActor');

  const tabsReply = await rdp.call<{ tabs?: TabDescriptor[]; selected?: number }>(root, { type: 'listTabs' });
  const tabs = tabsReply.tabs ?? [];
  let descriptor: TabDescriptor | undefined;
  if (typeof tabsReply.selected === 'number' && tabsReply.selected >= 0 && tabsReply.selected < tabs.length) {
    descriptor = tabs[tabsReply.selected];
  } else {
    descriptor = tabs.find(t => t.selected === true) ?? tabs[0];
  }
  if (!descriptor) throw new Error('bootstrapRdp: listTabs returned no tabs');

  const targetReply = await rdp.call<GetTargetReply>(descriptor.actor, { type: 'getTarget' });
  const frame = targetReply.frame ?? {};
  const currentTarget = String(frame.actor ?? '');
  const threadActor = String(frame.threadActor ?? '');
  if (!currentTarget) throw new Error('bootstrapRdp: getTarget missing frame.actor');
  if (!threadActor) throw new Error('bootstrapRdp: getTarget missing frame.threadActor');

  const watcherReply = await rdp.call<{ actor?: string }>(descriptor.actor, { type: 'getWatcher' });
  const watcher = String(watcherReply.actor ?? '');
  if (!watcher) throw new Error('bootstrapRdp: getWatcher returned no actor');

  // Best-effort: start the watcher's frame/worker subscriptions so callers that
  // depend on `<watcher>.target-available-form` (RDP-aware workerTopology) still
  // get pushed updates. Failure here does NOT fail bootstrap.
  try {
    const ee = rdp as unknown as EventEmitter;
    const eventName = `${watcher}.target-available-form`;
    const targetEventSeen = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        ee.off(eventName, onTarget);
        resolve();
      }, opts.timeoutMs ?? 3000);
      function onTarget(payload: TargetPayload) {
        if (payload?.target?.targetType !== 'frame') return;
        clearTimeout(timeout);
        ee.off(eventName, onTarget);
        resolve();
      }
      ee.on(eventName, onTarget);
    });
    await rdp.call(watcher, { type: 'watchTargets', targetType: 'frame' });
    await rdp.call(watcher, { type: 'watchTargets', targetType: 'worker' });
    // Don't await targetEventSeen — bootstrap completion no longer depends on it,
    // we just install the listener so an event arriving later still fires.
    void targetEventSeen;
  } catch {
    // watchTargets is allowed to fail; the synchronous tree we already built is enough.
  }

  return { root, descriptor: descriptor.actor, watcher, currentTarget, threadActor, prefActor, perfActor };
}
