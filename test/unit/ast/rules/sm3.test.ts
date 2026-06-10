import { describe, it, expect } from 'vitest';
import { sm3 } from '../../../../src/ast/rules/sm3.js';

describe('rule: SM3', () => {
  it('detects SM3 keyword', () => {
    expect(sm3.detect('var h = SM3(data);')).toBe(true);
  });
  it('detects SM3 magic constant 0x79cc4519', () => {
    expect(sm3.detect('var T1 = 0x79cc4519;')).toBe(true);
  });
  it('detects sm3Hash function', () => {
    expect(sm3.detect('function sm3Hash(msg) {}')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(sm3.detect('var x = 1;')).toBe(false);
  });
});
