import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { makeLogSink } from '../../../src/capabilities/logSink.js';
import { ConsoleRing } from '../../../src/session/caches.js';

describe('logSink', () => {
  it('pushes log.entryAdded payloads into ConsoleRing', () => {
    const bidi = new EventEmitter();
    const ring = new ConsoleRing();
    makeLogSink(bidi as any, ring);
    bidi.emit('log.entryAdded', { type: 'console', level: 'info', text: 'hello', timestamp: 1 });
    bidi.emit('log.entryAdded', { type: 'console', level: 'warn', text: 'oh', timestamp: 2 });
    expect(ring.list()).toHaveLength(2);
    expect((ring.list()[0] as any).text).toBe('hello');
  });

  it('respects ConsoleRing capacity (FIFO drop)', () => {
    const bidi = new EventEmitter();
    const ring = new ConsoleRing(2);
    makeLogSink(bidi as any, ring);
    bidi.emit('log.entryAdded', { text: 'a' });
    bidi.emit('log.entryAdded', { text: 'b' });
    bidi.emit('log.entryAdded', { text: 'c' });
    expect(ring.list().map(e => (e as any).text)).toEqual(['b', 'c']);
  });

  it('returns an object (LogSink interface)', () => {
    const bidi = new EventEmitter();
    const ring = new ConsoleRing();
    const sink = makeLogSink(bidi as any, ring);
    expect(typeof sink).toBe('object');
    expect(sink).not.toBeNull();
  });

  it('ignores events emitted before makeLogSink is called', () => {
    const bidi = new EventEmitter();
    const ring = new ConsoleRing();
    // emit before subscription — should NOT be in ring
    bidi.emit('log.entryAdded', { text: 'pre-subscribe' });
    makeLogSink(bidi as any, ring);
    expect(ring.list()).toHaveLength(0);
  });

  it('accumulates entries across multiple emits up to capacity', () => {
    const bidi = new EventEmitter();
    const ring = new ConsoleRing(100);
    makeLogSink(bidi as any, ring);
    for (let i = 0; i < 10; i++) {
      bidi.emit('log.entryAdded', { text: `msg-${i}`, level: 'debug', timestamp: i });
    }
    expect(ring.list()).toHaveLength(10);
    expect((ring.list()[9] as any).text).toBe('msg-9');
  });
});
