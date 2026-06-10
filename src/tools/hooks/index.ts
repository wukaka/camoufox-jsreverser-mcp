import { create_hook } from './create_hook.js';
import { inject_hook } from './inject_hook.js';
import { get_hook_data } from './get_hook_data.js';
import { list_hooks } from './list_hooks.js';
import { remove_hook } from './remove_hook.js';
import { hook_function } from './hook_function.js';
import { unhook_function } from './unhook_function.js';
import { trace_function } from './trace_function.js';

export const hooksTools = [
  create_hook,
  inject_hook,
  get_hook_data,
  list_hooks,
  remove_hook,
  hook_function,
  unhook_function,
  trace_function,
];
