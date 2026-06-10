import type { CryptoRule } from '../../capabilities/types.js';

export const sha1: CryptoRule = {
  name: 'SHA1',
  detect(source: string): boolean {
    return /\bSHA1\b|\bSHA-1\b|CryptoJS\.SHA1|sha1\s*\(|0x67452301|0xefcdab89|0x98badcfe|0x10325476|0xc3d2e1f0/i.test(source);
  },
};
