import { EventEmitter } from 'node:events';
import { RdpDriver } from './RdpDriver.js';

export interface ActorTree {
  root: string;
  descriptor: string;
  watcher: string;
  currentTarget: string;
}

export interface BootstrapOpts {
  /** Max wait for the first target-available-form event. Default 5000ms. */
  timeoutMs?: number;
}

interface TabDescriptor { actor: string; selected?: boolean; url?: string }

type TargetPayload = { from: string; target?: { actor?: string; targetType?: string } };

export async function bootstrapRdp(rdp: RdpDriver, opts: BootstrapOpts = {}): Promise<ActorTree> {
  const root = 'root';
  const ee = rdp as unknown as EventEmitter;

  // Buffer target-available-form events from ANY actor BEFORE the first await,
  // so that events emitted during the async negotiation phase are not lost.
  // Once we know the watcher actor, we filter by prefix.
  const buffered: Array<{ eventName: string; payload: TargetPayload }> = [];
  const SUFFIX = '.target-available-form';
  function earlyCapture(this: EventEmitter, eventName: string | symbol, ...args: unknown[]) {
    if (typeof eventName === 'string' && eventName.endsWith(SUFFIX)) {
      buffered.push({ eventName, payload: args[0] as TargetPayload });
    }
  }
  // newListener fires synchronously when a new listener is added; we instead
  // intercept via the 'newListener' event ourselves — but the cleanest approach
  // is to monkey-patch emit on this instance only for the duration of setup.
  const originalEmit = ee.emit.bind(ee);
  (ee as { emit: typeof ee.emit }).emit = function (eventName: string | symbol, ...args: unknown[]) {
    earlyCapture.call(ee, eventName, ...args);
    return originalEmit(eventName, ...args);
  };

  try {
    // 1. listTabs → pick selected
    const tabsReply = await rdp.call<{ tabs: TabDescriptor[]; selected: number }>(root, { type: 'listTabs' });
    const tabs = tabsReply.tabs ?? [];
    let descriptor: TabDescriptor | undefined;
    if (typeof tabsReply.selected === 'number' && tabsReply.selected >= 0 && tabsReply.selected < tabs.length) {
      descriptor = tabs[tabsReply.selected];
    } else {
      descriptor = tabs.find(t => t.selected === true);
    }
    if (!descriptor) {
      throw new Error('bootstrapRdp: no selected tab descriptor in listTabs reply');
    }

    // 2. getWatcher
    const watcherReply = await rdp.call<{ actor: string }>(descriptor.actor, { type: 'getWatcher' });
    const watcher = watcherReply.actor;
    if (!watcher) {
      throw new Error('bootstrapRdp: getWatcher returned no actor');
    }

    // 3. Restore emit and check buffer for already-arrived events for this watcher.
    (ee as { emit: typeof ee.emit }).emit = originalEmit;
    const watcherEventName = `${watcher}${SUFFIX}`;

    // Check if the event already arrived while we were negotiating.
    const preArrived = buffered.find(b => b.eventName === watcherEventName && b.payload?.target?.targetType === 'frame' && b.payload?.target?.actor);
    if (preArrived) {
      // Event already arrived — subscribe for future ones then kick off watchTargets.
      await rdp.call(watcher, { type: 'watchTargets', targetType: 'frame' });
      await rdp.call(watcher, { type: 'watchTargets', targetType: 'worker' });
      return { root, descriptor: descriptor.actor, watcher, currentTarget: preArrived.payload.target!.actor! };
    }

    // 4. Subscribe BEFORE watchTargets so we don't miss the first event.
    const targetPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ee.off(watcherEventName, onTarget);
        reject(new Error('bootstrapRdp: timeout waiting for target-available-form'));
      }, opts.timeoutMs ?? 5000);
      function onTarget(payload: TargetPayload) {
        const target = payload?.target;
        if (!target || target.targetType !== 'frame') return;
        if (!target.actor) return;
        clearTimeout(timeout);
        ee.off(watcherEventName, onTarget);
        resolve(target.actor);
      }
      ee.on(watcherEventName, onTarget);
    });

    await rdp.call(watcher, { type: 'watchTargets', targetType: 'frame' });
    await rdp.call(watcher, { type: 'watchTargets', targetType: 'worker' });

    const currentTarget = await targetPromise;

    return { root, descriptor: descriptor.actor, watcher, currentTarget };
  } finally {
    // Always restore emit if we haven't already.
    if ((ee as { emit: typeof ee.emit }).emit !== originalEmit) {
      (ee as { emit: typeof ee.emit }).emit = originalEmit;
    }
  }
}
