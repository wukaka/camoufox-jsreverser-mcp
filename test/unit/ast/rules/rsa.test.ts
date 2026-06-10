import { describe, it, expect } from 'vitest';
import { rsa } from '../../../../src/ast/rules/rsa.js';

describe('rule: RSA', () => {
  it('detects RSA keyword', () => {
    expect(rsa.detect('var enc = RSA.encrypt(data, pubKey);')).toBe(true);
  });
  it('detects modPow', () => {
    expect(rsa.detect('result = base.modPow(exp, mod);')).toBe(true);
  });
  it('detects BigInteger', () => {
    expect(rsa.detect('var n = new BigInteger(modulus, 16);')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(rsa.detect('var x = 1;')).toBe(false);
  });
});
