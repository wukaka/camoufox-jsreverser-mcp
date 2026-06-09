import { describe, it, expect } from 'vitest';
import { encodeFrame, FrameDecoder } from '../../../../src/drivers/rdp/framing.js';

describe('RDP framing', () => {
  it('encodes JSON as length:payload', () => {
    const buf = encodeFrame({ to: 'root', type: 'listTabs' });
    const s = buf.toString('utf8');
    expect(s).toBe('31:{"to":"root","type":"listTabs"}');
  });

  it('decodes a single frame', () => {
    const dec = new FrameDecoder();
    const frames: unknown[] = [];
    dec.on('frame', (f) => frames.push(f));
    dec.feed(Buffer.from('21:{"from":"root","x":1}', 'utf8'));
    expect(frames).toEqual([{ from: 'root', x: 1 }]);
  });

  it('handles split frames', () => {
    const dec = new FrameDecoder();
    const frames: unknown[] = [];
    dec.on('frame', (f) => frames.push(f));
    dec.feed(Buffer.from('21:{"from":"r', 'utf8'));
    dec.feed(Buffer.from('oot","x":1}', 'utf8'));
    expect(frames).toEqual([{ from: 'root', x: 1 }]);
  });

  it('handles concatenated frames', () => {
    const dec = new FrameDecoder();
    const frames: unknown[] = [];
    dec.on('frame', (f) => frames.push(f));
    const a = '21:{"from":"root","x":1}';
    const b = '18:{"from":"a","b":2}';
    dec.feed(Buffer.from(a + b, 'utf8'));
    expect(frames).toEqual([{ from: 'root', x: 1 }, { from: 'a', b: 2 }]);
  });
});
