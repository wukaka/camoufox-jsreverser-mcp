/**
 * wsObserver — BiDi-side WebSocket observability (M2.09)
 *
 * DATA SOURCES:
 *   1. BiDi network.beforeRequestSent: detects WebSocket handshakes (Upgrade: websocket header).
 *      The BiDi request id becomes the wsid for the connection entry.
 *   2. ChannelDispatcher 'ws' channel: receives frame samples shipped by the preload hook
 *      installed via installFrameHook(). The hook tags frames with the WebSocket URL because
 *      the page cannot know the BiDi request id. Correlation is by URL (best-effort; see
 *      KNOWN LIMITATIONS below).
 *
 * KNOWN LIMITATIONS (v1):
 *   - Two simultaneous connections to the same URL on the same page → ambiguous correlation;
 *     the most recently registered entry wins. M3 RDP fills this gap with true frame events.
 *   - Binary frame payloads are serialized as '[binary:N]' or '[binary]' by the preload hook;
 *     full bytes require M3 RDP.
 *   - No close detection: BiDi does not expose WebSocket close cleanly.
 *   - The preload hook can only observe frames from the moment it is injected; frames sent
 *     before injection are missed.
 */

import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { WsTable, WsEntry } from '../session/caches.js';
import { ChannelDispatcher } from '../session/dispatcher.js';
import { WsObserver, WsConnectionInfo, WsFrame } from './types.js';

export interface WsObserverDeps {
  bidi: BidiDriver;
  table: WsTable;
  dispatcher: ChannelDispatcher;
  /** The global emit function name used by the preload hook, e.g. '__mcp_emit'. */
  emitName: string;
}

interface BidiHeader { name: string; value: { type: 'string' | 'base64'; value: string } }
interface BidiRequestData { request: string; url: string; headers?: BidiHeader[] }

function isWebSocketHandshake(headers: BidiHeader[] | undefined): boolean {
  if (!headers) return false;
  for (const h of headers) {
    if (h.name.toLowerCase() === 'upgrade' && (h.value?.value ?? '').toLowerCase() === 'websocket') return true;
    // Also detect HTTP/2 :protocol pseudo-header (RFC 8441)
    if (h.name.toLowerCase() === ':protocol' && (h.value?.value ?? '').toLowerCase() === 'websocket') return true;
  }
  return false;
}

/**
 * Renders a preload script that wraps WebSocket.prototype to ship frame samples
 * to the dispatcher via window[emitName]. The hook tags each frame with the
 * WebSocket URL as `wsid` — this is the best key the page context can supply.
 *
 * The observer correlates incoming samples to BiDi-registered entries by URL.
 * See KNOWN LIMITATIONS above.
 */
function renderFrameHook(emitName: string): string {
  return `(function(){
    var __emit = window[${JSON.stringify(emitName)}];
    if (typeof __emit !== 'function') return;
    var _OrigWS = window.WebSocket;
    if (!_OrigWS) return;
    function WrappedWS(url, protocols) {
      var ws = protocols !== undefined ? new _OrigWS(url, protocols) : new _OrigWS(url);
      var __wsTag = String(url);
      var __origSend = ws.send.bind(ws);
      ws.send = function(data) {
        try {
          __emit({ channel: 'ws', wsid: __wsTag, dir: 'out',
            data: typeof data === 'string' ? data : '[binary:' + (data && data.byteLength || 'n/a') + ']',
            ts: Date.now() });
        } catch(e) {}
        return __origSend(data);
      };
      ws.addEventListener('message', function(ev) {
        try {
          __emit({ channel: 'ws', wsid: __wsTag, dir: 'in',
            data: typeof ev.data === 'string' ? ev.data : '[binary]',
            ts: Date.now() });
        } catch(e) {}
      });
      return ws;
    }
    WrappedWS.prototype = WebSocket.prototype;
    WrappedWS.CONNECTING = _OrigWS.CONNECTING;
    WrappedWS.OPEN = _OrigWS.OPEN;
    WrappedWS.CLOSING = _OrigWS.CLOSING;
    WrappedWS.CLOSED = _OrigWS.CLOSED;
    try { window.WebSocket = WrappedWS; } catch(e) {}
  })();`;
}

export function makeWsObserver(deps: WsObserverDeps): WsObserver {
  const { bidi, table, dispatcher } = deps;

  // 1. Detect handshakes from BiDi network events.
  bidi.on('network.beforeRequestSent', (params: unknown) => {
    const p = params as { request?: BidiRequestData };
    const req = p?.request;
    if (!req || !isWebSocketHandshake(req.headers)) return;
    if (table.get('page', req.request)) return; // dedupe
    const entry: WsEntry = {
      targetId: 'page',
      wsid: req.request,
      url: req.url,
      frames: [],
    };
    table.put(entry);
  });

  // 2. Route ws-channel samples to matching connection entries.
  //
  // Strategy: first try to find the entry directly by wsid (for test scenarios
  // and future RDP integration where the BiDi request id is known). If not
  // found by wsid, fall back to URL correlation (the preload hook tags frames
  // with the WebSocket URL). URL correlation is best-effort — see KNOWN LIMITATIONS.
  dispatcher.on('ws', (payload) => {
    const wsidTag = payload['wsid'];
    if (typeof wsidTag !== 'string') return;
    const dir = payload['dir'];
    const data = payload['data'];
    const ts = typeof payload['ts'] === 'number' ? payload['ts'] : Date.now();
    if (dir !== 'in' && dir !== 'out') return;

    // Try direct wsid match first (request id passed through).
    let target: WsEntry | undefined = table.list().find(e => e.wsid === wsidTag);

    // Fallback: URL match (the hook ships the URL as wsid).
    if (!target) {
      const candidates = table.list().filter(e => e.url === wsidTag);
      target = candidates[candidates.length - 1]; // most recent for same URL
    }

    if (!target) return; // drop samples for unknown connections

    target.frames.push({ ts, dir: dir as 'in' | 'out', data, source: 'preload-hook' });
  });

  return {
    listConnections(filter) {
      let entries = table.list();
      if (filter?.targetId) entries = entries.filter(e => e.targetId === filter.targetId);
      if (filter?.urlSubstring) {
        const s = filter.urlSubstring;
        entries = entries.filter(e => e.url.includes(s));
      }
      return entries.map((e): WsConnectionInfo => ({
        targetId: e.targetId,
        wsid: e.wsid,
        url: e.url,
        frameCount: e.frames.length,
      }));
    },

    getFrames(wsid, opts) {
      // Find by wsid across any targetId (page or worker).
      const entry = table.list().find(e => e.wsid === wsid);
      if (!entry) return [];
      let frames = entry.frames as WsFrame[];
      if (opts?.dir) frames = frames.filter(f => f.dir === opts.dir);
      if (opts?.since !== undefined) {
        const since = opts.since;
        frames = frames.filter(f => f.ts >= since);
      }
      if (opts?.limit !== undefined) frames = frames.slice(0, opts.limit);
      return frames;
    },

    installFrameHook() {
      return renderFrameHook(deps.emitName);
    },
  };
}
