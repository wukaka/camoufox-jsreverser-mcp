import type { CryptoRule } from '../../capabilities/types.js';

export const sha256: CryptoRule = {
  name: 'SHA256',
  detect(source: string): boolean {
    return /\bSHA256\b|\bSHA-256\b|CryptoJS\.SHA256|sha256\s*\(|0x6a09e667|0xbb67ae85|0x3c6ef372|0xa54ff53a|0x9b05688c/i.test(source);
  },
};
