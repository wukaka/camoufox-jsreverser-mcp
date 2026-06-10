import type { CryptoSignatures, CryptoMatch } from './types.js';
import { CRYPTO_RULES } from '../ast/rules/index.js';

export function makeCryptoSignatures(): CryptoSignatures {
  return {
    detect(source: string): CryptoMatch[] {
      return CRYPTO_RULES
        .filter(rule => rule.detect(source))
        .map(rule => ({ name: rule.name, confidence: 'high' as const }));
    },

    listRules(): string[] {
      return CRYPTO_RULES.map(r => r.name);
    },
  };
}
