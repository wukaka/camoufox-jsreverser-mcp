import { inject_stealth } from './inject_stealth.js';
import { inject_stealth_hook } from './inject_stealth_hook.js';
import { inject_stealth_to_workers } from './inject_stealth_to_workers.js';
import { list_stealth_features } from './list_stealth_features.js';
import { list_stealth_presets } from './list_stealth_presets.js';
import { inject_preload_script } from './inject_preload_script.js';
import { set_user_agent } from './set_user_agent.js';

export const stealthTools = [
  inject_stealth,
  inject_stealth_hook,
  inject_stealth_to_workers,
  list_stealth_features,
  list_stealth_presets,
  inject_preload_script,
  set_user_agent,
];
