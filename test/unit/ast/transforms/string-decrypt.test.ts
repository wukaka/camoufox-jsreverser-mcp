import { describe, it, expect } from 'vitest';
import { stringDecrypt } from '../../../../src/ast/transforms/string-decrypt.js';

describe('string-decrypt', () => {
  it('replaces array index access with string literal', () => {
    const source = `var _0x = ['hello','world']; var x = _0x[0];`;
    const r = stringDecrypt(source);
    expect(r.code).toMatch(/"hello"/);
    expect(r.changed).toBe(true);
  });

  it('replaces multiple references to same array', () => {
    const source = `var arr = ['foo','bar','baz']; var a = arr[1]; var b = arr[2];`;
    const r = stringDecrypt(source);
    expect(r.code).toMatch(/"bar"/);
    expect(r.code).toMatch(/"baz"/);
    expect(r.changed).toBe(true);
  });

  it('returns changed=false if no static string array found', () => {
    const r = stringDecrypt('var x = someFunc[0];');
    expect(r.changed).toBe(false);
  });

  it('does not replace out-of-bounds index', () => {
    const source = `var arr = ['a','b']; var x = arr[5];`;
    const r = stringDecrypt(source);
    // arr[5] should remain unchanged (out of bounds)
    expect(r.code).toMatch(/arr\[5\]/);
  });
});
