import type { CryptoRule } from '../../capabilities/types.js';

export const rc4: CryptoRule = {
  name: 'RC4',
  detect(source: string): boolean {
    return /\bRC4\b|arcfour|rc4(?:Encrypt|Decrypt|Init)|KSA|PRGA|\bS\[i\]\s*=\s*i\b/i.test(source);
  },
};
