import { get_dom_structure } from './get_dom_structure.js';
import { query_dom } from './query_dom.js';
import { find_clickable_elements } from './find_clickable_elements.js';
import { click_element } from './click_element.js';
import { type_text } from './type_text.js';
import { wait_for_element } from './wait_for_element.js';

export const domTools = [
  get_dom_structure,
  query_dom,
  find_clickable_elements,
  click_element,
  type_text,
  wait_for_element,
];
