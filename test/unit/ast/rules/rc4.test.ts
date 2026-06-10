import { describe, it, expect } from 'vitest';
import { rc4 } from '../../../../src/ast/rules/rc4.js';

describe('rule: RC4', () => {
  it('detects RC4 keyword', () => {
    expect(rc4.detect('function RC4(key, data) {}')).toBe(true);
  });
  it('detects arcfour alias', () => {
    expect(rc4.detect('var cipher = arcfour(key);')).toBe(true);
  });
  it('detects KSA pattern', () => {
    expect(rc4.detect('// KSA initialization')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(rc4.detect('var x = 1 + 2;')).toBe(false);
  });
});
