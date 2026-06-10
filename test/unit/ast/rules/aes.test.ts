import { describe, it, expect } from 'vitest';
import { aes } from '../../../../src/ast/rules/aes.js';

describe('rule: AES', () => {
  it('detects CryptoJS.AES', () => {
    expect(aes.detect('var x = CryptoJS.AES.encrypt(data, key);')).toBe(true);
  });
  it('detects AES keyword', () => {
    expect(aes.detect('function AES(key) {}')).toBe(true);
  });
  it('detects S-box constant', () => {
    expect(aes.detect('var sbox = [0x63, 0x7c, 0x77, 0x7b];')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(aes.detect('var x = 1 + 2;')).toBe(false);
  });
});
