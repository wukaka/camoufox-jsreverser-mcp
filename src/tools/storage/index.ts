import { get_storage } from './get_storage.js';
import { save_session_state } from './save_session_state.js';
import { restore_session_state } from './restore_session_state.js';
import { dump_session_state } from './dump_session_state.js';
import { load_session_state } from './load_session_state.js';
import { list_session_states } from './list_session_states.js';
import { delete_session_state } from './delete_session_state.js';

export const storageTools = [
  get_storage,
  save_session_state,
  restore_session_state,
  dump_session_state,
  load_session_state,
  list_session_states,
  delete_session_state,
];
