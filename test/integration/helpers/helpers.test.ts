import { describe, it, expect } from 'vitest';
import { allocateFreePort, resolveFirefoxPath, resolveGeckodriverPath, DEFAULT_FIREFOX_PATHS, launchTestFirefox } from './firefox.js';
import { connectMcpStdio, callTool } from './mcp-client.js';

describe('helpers: firefox', () => {
  it('allocateFreePort returns a positive port number', async () => {
    const p = await allocateFreePort();
    expect(p).toBeGreaterThan(1024);
    expect(p).toBeLessThan(65536);
  });

  it('DEFAULT_FIREFOX_PATHS is a non-empty list', () => {
    expect(DEFAULT_FIREFOX_PATHS.length).toBeGreaterThan(0);
  });

  it('resolveFirefoxPath returns null or an absolute path', async () => {
    const p = await resolveFirefoxPath();
    if (p !== null) expect(p.startsWith('/')).toBe(true);
  });

  it('resolveGeckodriverPath returns null or an absolute path', async () => {
    const p = await resolveGeckodriverPath();
    if (p !== null) expect(p.startsWith('/')).toBe(true);
  });

  // Live Firefox smoke: spins up a real browser via launchTestFirefox.
  // Skipped automatically when Firefox or geckodriver is missing.
  // Bare Firefox --remote-debugging-port serves CDP, not WebDriver BiDi; geckodriver
  // is the supported BiDi front-end and is required for L2/L3 tests.
  it('launchTestFirefox brings up a ready Session', async () => {
    const ff = await launchTestFirefox({ stealth: 'off' });
    if (!ff) {
      console.warn('[skip] Firefox or geckodriver not detected; install geckodriver, or set FIREFOX_PATH / GECKODRIVER_PATH');
      return;
    }
    try {
      expect(ff.session.isReady()).toBe(true);
    } finally {
      await ff.shutdown();
    }
  }, 60_000);
});

describe('helpers: mcp-client', () => {
  it('exports connectMcpStdio + callTool', () => {
    // Full stdio handshake exercised in M6.06 e2e suites; here we just verify
    // the helper module is importable and exposes the expected shape.
    expect(typeof connectMcpStdio).toBe('function');
    expect(typeof callTool).toBe('function');
  });
});
