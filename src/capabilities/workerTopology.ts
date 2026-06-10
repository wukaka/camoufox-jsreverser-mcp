import { ScriptHost, WorkerTopology, WorkerInfo } from './types.js';

/**
 * M2 implementation derives workers from scriptHost.listRealms() filtered by type.
 * M3 augments this with RDP target-watcher to also surface detached/pre-attach workers.
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
  };
}
