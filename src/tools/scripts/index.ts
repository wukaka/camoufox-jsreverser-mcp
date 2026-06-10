import { list_scripts } from './list_scripts.js';
import { get_script_source } from './get_script_source.js';
import { find_in_script } from './find_in_script.js';
import { search_in_scripts } from './search_in_scripts.js';
import { search_in_sources } from './search_in_sources.js';

export const scriptsTools = [
  list_scripts,
  get_script_source,
  find_in_script,
  search_in_scripts,
  search_in_sources,
];
