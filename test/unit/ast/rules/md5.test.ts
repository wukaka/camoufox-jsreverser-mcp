import { describe, it, expect } from 'vitest';
import { md5 } from '../../../../src/ast/rules/md5.js';

describe('rule: MD5', () => {
  it('detects MD5 keyword', () => {
    expect(md5.detect('var h = MD5(input);')).toBe(true);
  });
  it('detects magic constant 0xd76aa478', () => {
    expect(md5.detect('var K = 0xd76aa478;')).toBe(true);
  });
  it('detects CryptoJS.MD5', () => {
    expect(md5.detect('CryptoJS.MD5(msg).toString()')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(md5.detect('var x = "hello";')).toBe(false);
  });
});
