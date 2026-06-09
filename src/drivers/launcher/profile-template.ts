export interface PrefEntry { key: string; value: string | number | boolean }

export const REQUIRED_PREFS: PrefEntry[] = [
  { key: 'devtools.debugger.remote-enabled', value: true },
  { key: 'devtools.debugger.prompt-connection', value: false },
  { key: 'devtools.chrome.enabled', value: true },
  { key: 'remote.enabled', value: true },
  { key: 'remote.active-protocols', value: 3 }, // 1=marionette, 2=bidi, 3=both
  { key: 'dom.webdriver.enabled', value: false }, // stealth: hide navigator.webdriver
  { key: 'datareporting.healthreport.uploadEnabled', value: false },
  { key: 'datareporting.policy.dataSubmissionEnabled', value: false },
  { key: 'browser.shell.checkDefaultBrowser', value: false },
  { key: 'browser.startup.homepage_override.mstone', value: 'ignore' },
  { key: 'browser.tabs.warnOnClose', value: false },
  { key: 'browser.warnOnQuit', value: false },
  { key: 'app.update.auto', value: false },
  { key: 'app.update.enabled', value: false },
];

export function renderPrefsJs(extra: PrefEntry[] = []): string {
  const all = [...REQUIRED_PREFS, ...extra];
  return all.map(({ key, value }) => {
    const v = typeof value === 'string' ? JSON.stringify(value) : String(value);
    return `user_pref(${JSON.stringify(key)}, ${v});`;
  }).join('\n') + '\n';
}
