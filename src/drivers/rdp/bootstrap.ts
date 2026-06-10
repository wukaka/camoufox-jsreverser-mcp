import { EventEmitter } from 'node:events';
import { RdpDriver } from './RdpDriver.js';

export interface ActorTree {
  root: string;
  descriptor: string;
  watcher: string;
  currentTarget: string;
}

export interface BootstrapOpts {
  /** Max wait for the first target-available-form event after watchTargets. Default 5000ms. */
  timeoutMs?: number;
}

interface TabDescriptor { actor: string; selected?: boolean; url?: string }

type TargetPayload = { from?: string; target?: { actor?: string; targetType?: string } };

export async function bootstrapRdp(rdp: RdpDriver, opts: BootstrapOpts = {}): Promise<ActorTree> {
  const root = 'root';

  // 1. listTabs → pick selected tab descriptor.
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

  // 2. getWatcher on the descriptor.
  const watcherReply = await rdp.call<{ actor: string }>(descriptor.actor, { type: 'getWatcher' });
  const watcher = watcherReply.actor;
  if (!watcher) {
    throw new Error('bootstrapRdp: getWatcher returned no actor');
  }

  // 3. Subscribe target-available-form BEFORE issuing watchTargets so we
  //    never race the watcher's first emit. Firefox emits the initial
  //    target-available-form synchronously inside watchTargets handling.
  const ee = rdp as unknown as EventEmitter;
  const eventName = `${watcher}.target-available-form`;
  const targetPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ee.off(eventName, onTarget);
      reject(new Error('bootstrapRdp: timeout waiting for target-available-form'));
    }, opts.timeoutMs ?? 5000);
    function onTarget(payload: TargetPayload) {
      const target = payload?.target;
      if (!target || target.targetType !== 'frame') return;
      if (!target.actor) return;
      clearTimeout(timeout);
      ee.off(eventName, onTarget);
      resolve(target.actor);
    }
    ee.on(eventName, onTarget);
  });

  // 4. Start watching frame + worker targets. Firefox emits target-available-form
  //    for already-existing frames synchronously during this call.
  await rdp.call(watcher, { type: 'watchTargets', targetType: 'frame' });
  await rdp.call(watcher, { type: 'watchTargets', targetType: 'worker' });

  const currentTarget = await targetPromise;
  return { root, descriptor: descriptor.actor, watcher, currentTarget };
}
