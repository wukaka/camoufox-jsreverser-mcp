import { describe, it, expect } from 'vitest';
import { sha256 } from '../../../../src/ast/rules/sha256.js';

describe('rule: SHA256', () => {
  it('detects SHA256 keyword', () => {
    expect(sha256.detect('var h = SHA256(data);')).toBe(true);
  });
  it('detects SHA-256 keyword', () => {
    expect(sha256.detect('algo = "SHA-256"')).toBe(true);
  });
  it('detects magic constant 0x6a09e667', () => {
    expect(sha256.detect('var H0 = 0x6a09e667;')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(sha256.detect('var x = 1;')).toBe(false);
  });
});
