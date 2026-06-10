import type { CryptoRule } from '../../capabilities/types.js';
import { aes } from './aes.js';
import { rc4 } from './rc4.js';
import { md5 } from './md5.js';
import { sha1 } from './sha1.js';
import { sha256 } from './sha256.js';
import { base64 } from './base64.js';
import { hmac } from './hmac.js';
import { rsa } from './rsa.js';
import { sm3 } from './sm3.js';
import { sm4 } from './sm4.js';

export const CRYPTO_RULES: CryptoRule[] = [aes, rc4, md5, sha1, sha256, base64, hmac, rsa, sm3, sm4];
