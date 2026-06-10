import type { CryptoRule } from '../../capabilities/types.js';

export const aes: CryptoRule = {
  name: 'AES',
  detect(source: string): boolean {
    return /\bAES\b|CryptoJS\.AES|aes(?:Encrypt|Decrypt|CBC|ECB|CTR|GCM)|SubBytes|MixColumns|KeyExpansion|0x63.*0x7c.*0x77|sbox\s*=\s*\[/i.test(source);
  },
};
