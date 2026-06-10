import type { CryptoRule } from '../../capabilities/types.js';

export const md5: CryptoRule = {
  name: 'MD5',
  detect(source: string): boolean {
    return /\bMD5\b|CryptoJS\.MD5|md5\s*\(|0xd76aa478|0xe8c7b756|0x242070db|cmn\s*\(q,\s*a,\s*b/i.test(source);
  },
};
