import { understand_code } from './understand_code.js';
import { summarize_code } from './summarize_code.js';
import { deobfuscate_code } from './deobfuscate_code.js';
import { detect_crypto } from './detect_crypto.js';
import { analyze_target } from './analyze_target.js';
import { risk_panel } from './risk_panel.js';

export const aiAstTools = [
  understand_code,
  summarize_code,
  deobfuscate_code,
  detect_crypto,
  analyze_target,
  risk_panel,
];
