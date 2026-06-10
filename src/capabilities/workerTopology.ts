import { EventEmitter } from 'node:events';
import { ScriptHost, WorkerTopology, WorkerInfo } from './types.js';
import type { RdpDriver } from '../drivers/rdp/RdpDriver.js';

/**
 * M2 implementation derives workers from scriptHost.listRealms() filtered by type.
 * M3 augments this with RDP target-watcher to also surface detached/pre-attach workers.
 *
 * BiDi-only mode cannot receive push notifications when new workers appear mid-flight,
 * so onWorkerAvailable is a documented no-op in this factory.
 */
export function makeWorkerTopology(scripts: ScriptHost): WorkerTopology {
  return {
    async listWorkers() {
      const realms = await scripts.listRealms();
      return realms
        .filter(r => r.type === 'worker' || r.type === 'service-worker')
        .map((r): WorkerInfo => ({
          realmId: r.realmId,
          type: r.type as 'worker' | 'service-worker',
          origin: r.origin,
        }));
    },
    onWorkerAvailable(_cb) {
      // BiDi-only mode cannot push new-worker notifications; subscriptions are no-ops.
      return () => { /* no-op unsubscribe */ };
    },
  };
}

// ---------------------------------------------------------------------------
// M3 RDP-aware factory
// ---------------------------------------------------------------------------

interface TargetAvailablePayload {
  target?: {
    actor?: string;
    targetType?: string;
    threadActor?: string;
    workerDescriptor?: { url?: string; type?: string };
    [k: string]: unknown;
  };
}

/**
 * RDP-aware WorkerTopology. Subscribes to `<watcherActor>.target-available-form`
 * events on the RdpDriver EventEmitter to maintain a live Map of known workers.
 * Also handles `<watcherActor>.target-destroyed-form` to remove stale entries.
 *
 * Does NOT auto-replay hooks or auto-attach wsObserver — that wiring is done
 * at the Session level in M3.11.
 */
export function makeRdpWorkerTopology(rdp: RdpDriver, watcherActor: string): WorkerTopology {
  const workers = new Map<string, WorkerInfo>();
  const ee = rdp as unknown as EventEmitter;
  const handlers = new Set<(w: WorkerInfo) => void>();
  const availableEvent = `${watcherActor}.target-available-form`;
  const destroyedEvent = `${watcherActor}.target-destroyed-form`;

  ee.on(availableEvent, (payload: TargetAvailablePayload) => {
    const t = payload?.target;
    if (!t || t.targetType !== 'worker') return;
    const realmId = t.actor;
    if (!realmId) return;
    const wd = t.workerDescriptor ?? {};
    const type: 'worker' | 'service-worker' = wd.type === 'service' ? 'service-worker' : 'worker';
    const origin = wd.url ?? '';
    const info: WorkerInfo = { realmId, type, origin };
    workers.set(realmId, info);
    for (const cb of handlers) {
      try { cb(info); } catch { /* swallow handler errors */ }
    }
  });

  ee.on(destroyedEvent, (payload: TargetAvailablePayload) => {
    const realmId = payload?.target?.actor;
    if (realmId) workers.delete(realmId);
  });

  return {
    async listWorkers() {
      return Array.from(workers.values());
    },
    onWorkerAvailable(cb) {
      handlers.add(cb);
      return () => { handlers.delete(cb); };
    },
  };
}
