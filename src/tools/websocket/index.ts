import { list_websocket_connections } from './list_websocket_connections.js';
import { get_websocket_message } from './get_websocket_message.js';
import { get_websocket_messages } from './get_websocket_messages.js';
import { analyze_websocket_messages } from './analyze_websocket_messages.js';

export const websocketTools = [
  list_websocket_connections,
  get_websocket_message,
  get_websocket_messages,
  analyze_websocket_messages,
];
