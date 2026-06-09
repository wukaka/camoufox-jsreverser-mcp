import { describe, it, expect } from 'vitest';
import { renderPrefsJs, REQUIRED_PREFS } from '../../../../src/drivers/launcher/profile-template.js';

describe('profile-template', () => {
  it('renders user_pref calls for required prefs', () => {
    const out = renderPrefsJs();
    expect(out).toContain('user_pref("devtools.debugger.remote-enabled", true)');
    expect(out).toContain('user_pref("devtools.debugger.prompt-connection", false)');
    expect(out).toContain('user_pref("remote.enabled", true)');
    expect(out).toContain('user_pref("dom.webdriver.enabled", false)');
  });

  it('REQUIRED_PREFS covers debugging + stealth baselines', () => {
    const keys = REQUIRED_PREFS.map(p => p.key);
    expect(keys).toContain('devtools.debugger.remote-enabled');
    expect(keys).toContain('devtools.debugger.prompt-connection');
    expect(keys).toContain('devtools.chrome.enabled');
    expect(keys).toContain('remote.enabled');
    expect(keys).toContain('remote.active-protocols');
    expect(keys).toContain('dom.webdriver.enabled');
  });

  it('renderPrefsJs accepts extra prefs that get appended', () => {
    const out = renderPrefsJs([{ key: 'foo.bar', value: 'baz' }]);
    expect(out).toContain('user_pref("foo.bar", "baz")');
  });
});
