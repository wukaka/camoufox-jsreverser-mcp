import { set_breakpoint } from './set_breakpoint.js';
import { set_breakpoint_on_text } from './set_breakpoint_on_text.js';
import { remove_breakpoint } from './remove_breakpoint.js';
import { list_breakpoints } from './list_breakpoints.js';
import { pause } from './pause.js';
import { resume } from './resume.js';
import { step_over } from './step_over.js';
import { step_into } from './step_into.js';
import { step_out } from './step_out.js';
import { get_paused_info } from './get_paused_info.js';
import { evaluate_on_callframe } from './evaluate_on_callframe.js';
import { inspect_object } from './inspect_object.js';

export const debuggerTools = [
  set_breakpoint, set_breakpoint_on_text, remove_breakpoint, list_breakpoints,
  pause, resume, step_over, step_into, step_out,
  get_paused_info, evaluate_on_callframe, inspect_object,
];
