import { describe, it, expect } from 'vitest';
import { makeCryptoSignatures } from '../../../src/capabilities/cryptoSignatures.js';

describe('cryptoSignatures', () => {
  it('listRules returns 10 rule names', () => {
    const cs = makeCryptoSignatures();
    const names = cs.listRules();
    expect(names).toHaveLength(10);
    expect(names).toContain('AES');
    expect(names).toContain('RC4');
    expect(names).toContain('MD5');
    expect(names).toContain('SHA1');
    expect(names).toContain('SHA256');
    expect(names).toContain('Base64');
    expect(names).toContain('HMAC');
    expect(names).toContain('RSA');
    expect(names).toContain('SM3');
    expect(names).toContain('SM4');
  });

  it('detect returns AES match for CryptoJS.AES source', () => {
    const cs = makeCryptoSignatures();
    const matches = cs.detect('CryptoJS.AES.encrypt(data, key)');
    expect(matches.map(m => m.name)).toContain('AES');
    expect(matches[0].confidence).toBe('high');
  });

  it('detect returns empty array for unrelated code', () => {
    const cs = makeCryptoSignatures();
    expect(cs.detect('var x = 1 + 2;')).toEqual([]);
  });

  it('detect can return multiple matches', () => {
    const cs = makeCryptoSignatures();
    // code that contains both MD5 and Base64 signals
    const src = 'var h = MD5(input); var s = btoa(h);';
    const names = cs.detect(src).map(m => m.name);
    expect(names).toContain('MD5');
    expect(names).toContain('Base64');
  });
});
