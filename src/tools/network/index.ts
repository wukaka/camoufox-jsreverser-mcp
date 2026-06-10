import { list_network_requests } from './list_network_requests.js';
import { get_network_request } from './get_network_request.js';
import { get_request_initiator } from './get_request_initiator.js';
import { break_on_xhr } from './break_on_xhr.js';
import { remove_xhr_breakpoint } from './remove_xhr_breakpoint.js';

export const networkTools = [
  list_network_requests,
  get_network_request,
  get_request_initiator,
  break_on_xhr,
  remove_xhr_breakpoint,
];
