import type { CryptoRule } from '../../capabilities/types.js';

export const base64: CryptoRule = {
  name: 'Base64',
  detect(source: string): boolean {
    return /\bbtoa\b|\batob\b|base64(?:Encode|Decode|encode|decode)|ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\+\//.test(source);
  },
};
