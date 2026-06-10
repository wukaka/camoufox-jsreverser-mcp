import { describe, it, expect } from 'vitest';
import { makeInitiatorTracer } from '../../../src/capabilities/initiatorTracer.js';

describe('initiatorTracer', () => {
  it('normalizes BiDi initiator with stackTrace to {scriptUrl, line, column}', () => {
    const it = makeInitiatorTracer();
    const r = it.normalize({
      type: 'script',
      stackTrace: {
        callFrames: [
          { url: 'https://a/lib.js', lineNumber: 12, columnNumber: 5, functionName: 'doIt' },
          { url: 'https://a/main.js', lineNumber: 200, columnNumber: 1 },
        ],
      },
    });
    expect(r.type).toBe('script');
    expect(r.stack).toHaveLength(2);
    expect(r.stack[0]).toEqual({ scriptUrl: 'https://a/lib.js', line: 12, column: 5, functionName: 'doIt' });
    expect(r.stack[1]?.functionName).toBeUndefined();
  });

  it('handles missing stackTrace by returning empty stack', () => {
    const it = makeInitiatorTracer();
    const r = it.normalize({ type: 'parser', url: 'https://a' });
    expect(r.type).toBe('parser');
    expect(r.stack).toEqual([]);
  });

  it('treats null / undefined initiator as type=other with empty stack', () => {
    const it = makeInitiatorTracer();
    expect(it.normalize(null)).toEqual({ type: 'other', stack: [] });
    expect(it.normalize(undefined)).toEqual({ type: 'other', stack: [] });
  });

  it('unknown type falls back to "other"', () => {
    const it = makeInitiatorTracer();
    const r = it.normalize({ type: 'something-new' });
    expect(r.type).toBe('other');
  });
});
