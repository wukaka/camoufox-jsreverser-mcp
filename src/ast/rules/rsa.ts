import type { CryptoRule } from '../../capabilities/types.js';

export const rsa: CryptoRule = {
  name: 'RSA',
  detect(source: string): boolean {
    return /\bRSA\b|rsaEncrypt|rsaDecrypt|BigInteger|modPow|modInverse|publicExponent|privateExponent|\bpkcs[18]\b/i.test(source);
  },
};
