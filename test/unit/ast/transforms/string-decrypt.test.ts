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
    expect(r.code).toMatch(/arr\[5\]/);
  });

  it('handles arr["3"] numeric string property access', () => {
    const source = `var arr = ['zero','one','two','three']; var x = arr["3"];`;
    const r = stringDecrypt(source);
    expect(r.code).toMatch(/"three"/);
    expect(r.changed).toBe(true);
  });

  describe('rotation IIFE', () => {
    it('applies a single push/shift rotation', () => {
      const source = `
        var arr = ['a','b','c','d'];
        (function(a, c){ while(c--){ a.push(a.shift()); } }(arr, 1));
        var x = arr[0];
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"b"/);
      expect(r.changed).toBe(true);
      expect(r.code).not.toMatch(/a\.push/);
    });

    it('leaves a no-op IIFE in place', () => {
      const source = `
        var arr = ['a','b'];
        (function(a){ }(arr));
        var x = arr[0];
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"a"/);
    });
  });

  describe('decoder functions', () => {
    it('replaces direct decoder calls dec(N)', () => {
      const source = `
        var arr = ['alpha','beta','gamma'];
        function dec(i){ return arr[i]; }
        var x = dec(1);
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"beta"/);
      expect(r.changed).toBe(true);
    });

    it('handles arr[i - offset] decoder', () => {
      const source = `
        var arr = ['x','y','z','w'];
        function dec(i){ return arr[i - 100]; }
        var v = dec(102);
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"z"/);
      expect(r.changed).toBe(true);
    });

    it('handles parseInt hex string decoder', () => {
      const source = `
        var arr = ['a','b','c','d','e','f'];
        function dec(i){ return arr[parseInt(i, 16)]; }
        var v = dec('0x3');
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"d"/);
      expect(r.changed).toBe(true);
    });

    it('handles unary plus on numeric arg', () => {
      const source = `
        var arr = ['p','q','r'];
        function dec(i){ return arr[+i]; }
        var v = dec(2);
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"r"/);
      expect(r.changed).toBe(true);
    });

    it('handles self-offset reassignment inside body', () => {
      const source = `
        var arr = ['a','b','c'];
        function dec(i){ i = i - 10; return arr[i]; }
        var v = dec(11);
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"b"/);
      expect(r.changed).toBe(true);
    });

    it('handles hex numeric literal call sites', () => {
      const source = `
        var arr = ['a','b','c','d','e','f'];
        function dec(i){ return arr[i]; }
        var v = dec(0x4);
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"e"/);
      expect(r.changed).toBe(true);
    });
  });

  describe('combined rotation + decoder', () => {
    it('rotation then decoder call resolves the rotated string', () => {
      const source = `
        var arr = ['a','b','c','d'];
        (function(a, c){ while(c--){ a.push(a.shift()); } }(arr, 2));
        function dec(i){ return arr[i]; }
        var v = dec(0);
      `;
      const r = stringDecrypt(source);
      expect(r.code).toMatch(/"c"/);
      expect(r.changed).toBe(true);
    });
  });
});
