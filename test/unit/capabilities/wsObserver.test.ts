import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeWsObserver } from '../../../src/capabilities/wsObserver.js';
import { WsTable } from '../../../src/session/caches.js';
import { ChannelDispatcher } from '../../../src/session/dispatcher.js';

function fakeBidi(): EventEmitter & { send: (m: string, p: unknown) => Promise<unknown> } {
  const ee = new EventEmitter() as EventEmitter & { send: (m: string, p: unknown) => Promise<unknown> };
  ee.send = async () => ({});
  return ee;
}

describe('wsObserver', () => {
  it('detects WebSocket handshake via Upgrade header in beforeRequestSent', () => {
    const bidi = fakeBidi();
    const table = new WsTable();
    makeWsObserver({ bidi: bidi as any, table, dispatcher: new ChannelDispatcher(), emitName: '__mcp_emit_x' });
    bidi.emit('network.beforeRequestSent', {
      request: {
        request: 'req-ws-1',
        url: 'wss://chat.example.com/socket',
        headers: [
          { name: 'Connection', value: { type: 'string', value: 'Upgrade' } },
          { name: 'Upgrade', value: { type: 'string', value: 'websocket' } },
        ],
      },
    });
    const list = table.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.wsid).toBe('req-ws-1');
    expect(list[0]?.url).toBe('wss://chat.example.com/socket');
  });

  it('does NOT register non-WebSocket requests', () => {
    const bidi = fakeBidi();
    const table = new WsTable();
    makeWsObserver({ bidi: bidi as any, table, dispatcher: new ChannelDispatcher(), emitName: '__mcp_emit_x' });
    bidi.emit('network.beforeRequestSent', {
      request: {
        request: 'req-2',
        url: 'https://example.com/api',
        headers: [{ name: 'Accept', value: { type: 'string', value: 'application/json' } }],
      },
    });
    expect(table.list()).toHaveLength(0);
  });

  it('routes ws channel samples to the matching connection (source=preload-hook)', () => {
    const bidi = fakeBidi();
    const table = new WsTable();
    const dispatcher = new ChannelDispatcher();
    const obs = makeWsObserver({ bidi: bidi as any, table, dispatcher, emitName: '__mcp_emit_x' });
    // Pre-register a connection
    bidi.emit('network.beforeRequestSent', {
      request: {
        request: 'ws-1',
        url: 'wss://a',
        headers: [{ name: 'Upgrade', value: { type: 'string', value: 'websocket' } }],
      },
    });
    dispatcher.dispatch({ channel: 'ws', wsid: 'ws-1', dir: 'out', data: 'hello', ts: 1 });
    dispatcher.dispatch({ channel: 'ws', wsid: 'ws-1', dir: 'in', data: 'hi', ts: 2 });
    const frames = obs.getFrames('ws-1');
    expect(frames).toHaveLength(2);
    expect(frames[0]?.source).toBe('preload-hook');
    expect(frames[0]?.dir).toBe('out');
    expect(frames[1]?.dir).toBe('in');
  });

  it('drops ws samples for unknown wsid (no entry created)', () => {
    const bidi = fakeBidi();
    const table = new WsTable();
    const dispatcher = new ChannelDispatcher();
    makeWsObserver({ bidi: bidi as any, table, dispatcher, emitName: '__mcp_emit_x' });
    dispatcher.dispatch({ channel: 'ws', wsid: 'unknown', dir: 'out', data: 'x', ts: 1 });
    expect(table.list()).toHaveLength(0);
  });

  it('listConnections filters by urlSubstring', () => {
    const bidi = fakeBidi();
    const table = new WsTable();
    const obs = makeWsObserver({ bidi: bidi as any, table, dispatcher: new ChannelDispatcher(), emitName: '__mcp_emit_x' });
    bidi.emit('network.beforeRequestSent', { request: { request: 'a', url: 'wss://chat.example.com/sock', headers: [{ name: 'Upgrade', value: { type: 'string', value: 'websocket' } }] } });
    bidi.emit('network.beforeRequestSent', { request: { request: 'b', url: 'wss://other.example.com/x', headers: [{ name: 'Upgrade', value: { type: 'string', value: 'websocket' } }] } });
    expect(obs.listConnections()).toHaveLength(2);
    expect(obs.listConnections({ urlSubstring: 'chat' })).toHaveLength(1);
  });

  it('getFrames respects dir/since/limit', () => {
    const bidi = fakeBidi();
    const table = new WsTable();
    const dispatcher = new ChannelDispatcher();
    const obs = makeWsObserver({ bidi: bidi as any, table, dispatcher, emitName: '__mcp_emit_x' });
    bidi.emit('network.beforeRequestSent', { request: { request: 'w', url: 'wss://x', headers: [{ name: 'Upgrade', value: { type: 'string', value: 'websocket' } }] } });
    dispatcher.dispatch({ channel: 'ws', wsid: 'w', dir: 'out', data: 'a', ts: 1 });
    dispatcher.dispatch({ channel: 'ws', wsid: 'w', dir: 'in', data: 'b', ts: 2 });
    dispatcher.dispatch({ channel: 'ws', wsid: 'w', dir: 'out', data: 'c', ts: 3 });
    expect(obs.getFrames('w', { dir: 'out' })).toHaveLength(2);
    expect(obs.getFrames('w', { since: 2 })).toHaveLength(2);
    expect(obs.getFrames('w', { limit: 1 })).toHaveLength(1);
  });

  it('installFrameHook returns a JS string referencing the emit name', () => {
    const bidi = fakeBidi();
    const obs = makeWsObserver({ bidi: bidi as any, table: new WsTable(), dispatcher: new ChannelDispatcher(), emitName: '__mcp_emit_zzz' });
    const src = obs.installFrameHook();
    expect(src).toContain('__mcp_emit_zzz');
    expect(src).toContain('WebSocket.prototype');
    expect(src).toContain('channel:');
  });
});
