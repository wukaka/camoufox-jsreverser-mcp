import { describe, it, expect } from 'vitest';
import { base64 } from '../../../../src/ast/rules/base64.js';

describe('rule: Base64', () => {
  it('detects btoa', () => {
    expect(base64.detect('var s = btoa(data);')).toBe(true);
  });
  it('detects atob', () => {
    expect(base64.detect('var d = atob(encoded);')).toBe(true);
  });
  it('detects base64Encode function name', () => {
    expect(base64.detect('function base64Encode(str) {}')).toBe(true);
  });
  it('detects alphabet string', () => {
    expect(base64.detect('var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";')).toBe(true);
  });
  it('returns false for unrelated code', () => {
    expect(base64.detect('var x = 1;')).toBe(false);
  });
});
