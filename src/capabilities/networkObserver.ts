import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { RequestPool, RequestEntry } from '../session/caches.js';
import { NetworkObserver } from './types.js';

function upsert(pool: RequestPool, requestId: string, patch: Partial<RequestEntry>): void {
  const existing = pool.get(requestId);
  const next: RequestEntry = existing
    ? { ...existing, ...patch }
    : { requestId, req: undefined, ...patch };
  pool.put(next);
}

export function makeNetworkObserver(bidi: BidiDriver, pool: RequestPool): NetworkObserver {
  // -- event subscriptions: write into pool --
  bidi.on('network.beforeRequestSent', (params: any) => {
    const requestId = params?.request?.request;
    if (!requestId) return;
    upsert(pool, requestId, { req: params.request, initiator: params.initiator });
  });

  bidi.on('network.responseStarted', (params: any) => {
    const requestId = params?.request?.request;
    if (!requestId) return;
    upsert(pool, requestId, { res: params.response });
  });

  bidi.on('network.responseCompleted', (params: any) => {
    const requestId = params?.request?.request;
    if (!requestId) return;
    upsert(pool, requestId, { res: params.response });
  });

  bidi.on('network.fetchError', (params: any) => {
    const requestId = params?.request?.request;
    if (!requestId) return;
    upsert(pool, requestId, { res: { error: params.errorText } as unknown });
  });

  bidi.on('network.authRequired', (params: any) => {
    const requestId = params?.request?.request;
    if (!requestId) return;
    upsert(pool, requestId, { res: { authRequired: true, challenge: params.response } as unknown });
  });

  // -- commands --
  return {
    async addIntercept(params) {
      const r = await bidi.send('network.addIntercept', params) as { intercept: string };
      return r.intercept;
    },
    async removeIntercept(interceptId) {
      await bidi.send('network.removeIntercept', { intercept: interceptId });
    },
    async continueRequest(params) {
      await bidi.send('network.continueRequest', params);
    },
    async continueResponse(params) {
      await bidi.send('network.continueResponse', params);
    },
    async continueWithAuth(params) {
      await bidi.send('network.continueWithAuth', params);
    },
    async provideResponse(params) {
      await bidi.send('network.provideResponse', params);
    },
    async failRequest(params) {
      await bidi.send('network.failRequest', params);
    },
    async setCacheBehavior(params) {
      await bidi.send('network.setCacheBehavior', params);
    },
    async setExtraHeaders(params) {
      await bidi.send('network.setExtraHeaders', params);
    },
    async addDataCollector(params) {
      const r = await bidi.send('network.addDataCollector', params) as { collector: string };
      return r.collector;
    },
    async disownData(params) {
      await bidi.send('network.disownData', params);
    },
    async removeDataCollector(collectorId) {
      await bidi.send('network.removeDataCollector', { collector: collectorId });
    },
    async getData(params) {
      const r = await bidi.send('network.getData', params) as { bytes: { type: 'string' | 'base64'; value: string } };
      return r;
    },
  };
}
