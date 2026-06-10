import type { CryptoRule } from '../../capabilities/types.js';

export const hmac: CryptoRule = {
  name: 'HMAC',
  detect(source: string): boolean {
    return /\bHMAC\b|CryptoJS\.HmacSHA|hmac(?:SHA|MD|sign)|ipad.*opad|0x36363636|0x5c5c5c5c/i.test(source);
  },
};
