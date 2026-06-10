import type { CryptoRule } from '../../capabilities/types.js';

export const sm3: CryptoRule = {
  name: 'SM3',
  detect(source: string): boolean {
    return /\bSM3\b|sm3\s*\(|0x79cc4519|0x7a879d8a|T1\s*=\s*0x79cc4519|sm3Hash/i.test(source);
  },
};
