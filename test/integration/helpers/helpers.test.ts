import { describe, it, expect } from 'vitest';
import {
  allocateFreePort,
  resolveCamoufoxPath,
  resolveGeckodriverPath,
  DEFAULT_CAMOUFOX_PATHS,
  DEFAULT_GECKODRIVER_PATHS,
  launchTestFirefox,
} from './firefox.js';
import { connectMcpStdio, callTool } from './mcp-client.js';

describe('helpers: firefox', () => {
  it('allocateFreePort returns a positive port number', async () => {
    const p = await allocateFreePort();
    expect(p).toBeGreaterThan(1024);
    expect(p).toBeLessThan(65536);
  });

  it('DEFAULT_CAMOUFOX_PATHS / DEFAULT_GECKODRIVER_PATHS are non-empty', () => {
    expect(DEFAULT_CAMOUFOX_PATHS.length).toBeGreaterThan(0);
    expect(DEFAULT_GECKODRIVER_PATHS.length).toBeGreaterThan(0);
  });

  it('resolveCamoufoxPath returns null or an absolute path', async () => {
    const p = await resolveCamoufoxPath();
    if (p !== null) expect(p.startsWith('/')).toBe(true);
  });

  it('resolveGeckodriverPath returns null or an absolute path', async () => {
    const p = await resolveGeckodriverPath();
    if (p !== null) expect(p.startsWith('/')).toBe(true);
  });

  // Live smoke: requires Camoufox + geckodriver. Skipped when either is missing.
  it('launchTestFirefox brings up a ready Session', async () => {
    const ff = await launchTestFirefox({ stealth: 'off' });
    if (!ff) {
      console.warn('[skip] Camoufox or geckodriver not detected; install both, or set CAMOUFOX_PATH / GECKODRIVER_PATH');
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
    expect(typeof connectMcpStdio).toBe('function');
    expect(typeof callTool).toBe('function');
  });
});
