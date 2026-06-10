import { describe, it, expect } from 'vitest';
import { sha1 } from '../../../../src/ast/rules/sha1.js';

describe('rule: SHA1', () => {
  it('detects SHA1 keyword', () => {
    expect(sha1.detect('var h = SHA1(data);')).toBe(true);
  });
  it('detects SHA-1 keyword', () => {
    expect(sha1.detect('algo = "SHA-1"')).toBe(true);
  });
  it('detects magic constant 0x67452301', () => {
    expect(sha1.detect('var H0 = 0x67452301;')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(sha1.detect('var x = 1;')).toBe(false);
  });
});
