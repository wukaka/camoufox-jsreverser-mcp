import { list_console_messages } from './list_console_messages.js';
import { get_console_message } from './get_console_message.js';
import { evaluate_script } from './evaluate_script.js';
import { monitor_events } from './monitor_events.js';
import { stop_monitor } from './stop_monitor.js';

export const consoleTools = [
  list_console_messages,
  get_console_message,
  evaluate_script,
  monitor_events,
  stop_monitor,
];
