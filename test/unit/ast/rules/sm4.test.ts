import { describe, it, expect } from 'vitest';
import { sm4 } from '../../../../src/ast/rules/sm4.js';

describe('rule: SM4', () => {
  it('detects SM4 keyword', () => {
    expect(sm4.detect('var enc = SM4.encrypt(data, key);')).toBe(true);
  });
  it('detects sm4Encrypt function', () => {
    expect(sm4.detect('function sm4Encrypt(key, plain) {}')).toBe(true);
  });
  it('detects SM4 magic constant 0xd1310ba6', () => {
    expect(sm4.detect('var C = 0xd1310ba6;')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(sm4.detect('var x = 1;')).toBe(false);
  });
});
