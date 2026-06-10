import { describe, it, expect } from 'vitest';
import { hmac } from '../../../../src/ast/rules/hmac.js';

describe('rule: HMAC', () => {
  it('detects HMAC keyword', () => {
    expect(hmac.detect('var mac = HMAC(key, msg);')).toBe(true);
  });
  it('detects CryptoJS.HmacSHA256', () => {
    expect(hmac.detect('CryptoJS.HmacSHA256(msg, key)')).toBe(true);
  });
  it('detects ipad/opad constants', () => {
    expect(hmac.detect('var ipad = 0x36363636, opad = 0x5c5c5c5c;')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(hmac.detect('var x = 1;')).toBe(false);
  });
});
