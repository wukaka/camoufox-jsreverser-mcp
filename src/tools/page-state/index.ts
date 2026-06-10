import { check_browser_health } from './check_browser_health.js';
import { list_pages } from './list_pages.js';
import { new_page } from './new_page.js';
import { select_page } from './select_page.js';
import { navigate_page } from './navigate_page.js';
import { list_frames } from './list_frames.js';
import { select_frame } from './select_frame.js';
import { take_screenshot } from './take_screenshot.js';
import { get_performance_metrics } from './get_performance_metrics.js';

export const pageStateTools = [
  check_browser_health,
  list_pages,
  new_page,
  select_page,
  navigate_page,
  list_frames,
  select_frame,
  take_screenshot,
  get_performance_metrics,
];
