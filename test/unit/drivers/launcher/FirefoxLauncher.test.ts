import { describe, it, expect, vi, afterEach } from 'vitest';
import { FirefoxLauncher } from '../../../../src/drivers/launcher/FirefoxLauncher.js';
import { EventEmitter } from 'node:events';

interface FakeProc extends EventEmitter { stderr: EventEmitter; pid: number; kill: (s: string) => void }
function fakeProcess(): FakeProc {
  const p = new EventEmitter() as FakeProc;
  p.stderr = new EventEmitter();
  p.pid = 12345;
  p.kill = vi.fn();
  return p;
}

describe('FirefoxLauncher.launch', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('parses BiDi + RDP endpoints from stderr', async () => {
    const proc = fakeProcess();
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/ff-profile-x'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      firefoxPath: '/usr/bin/firefox',
    });
    const p = launcher.launch({});
    queueMicrotask(() => {
      proc.stderr.emit('data', Buffer.from(
        'Remote Debugging Server listening on port 6000\n' +
        'WebDriver BiDi listening on ws://127.0.0.1:9222/session/abc\n',
      ));
    });
    const endpoints = await p;
    expect(endpoints.bidiUrl).toBe('ws://127.0.0.1:9222/session/abc');
    expect(endpoints.rdpPort).toBe(6000);
    expect(endpoints.profileDir).toBe('/tmp/ff-profile-x');
  });

  it('rejects on stderr timeout', async () => {
    const proc = fakeProcess();
    vi.useFakeTimers();
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/x'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      firefoxPath: '/usr/bin/firefox',
      startupTimeoutMs: 1000,
    });
    const p = launcher.launch({});
    vi.advanceTimersByTime(1100);
    await expect(p).rejects.toThrow(/timeout/i);
  });

  it('writes user.js into the temp profile', async () => {
    const proc = fakeProcess();
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/ff-profile-y'),
      writeFile,
      rm: vi.fn().mockResolvedValue(undefined),
      firefoxPath: '/usr/bin/firefox',
    });
    const p = launcher.launch({});
    queueMicrotask(() => {
      proc.stderr.emit('data', Buffer.from(
        'Remote Debugging Server listening on port 6000\n' +
        'WebDriver BiDi listening on ws://127.0.0.1:9222/session/abc\n',
      ));
    });
    await p;
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/ff-profile-y'),
      expect.stringContaining('user_pref("devtools.debugger.remote-enabled", true)'),
    );
  });
});

describe('FirefoxLauncher.attach', () => {
  it('returns supplied endpoints with no profile/proc', () => {
    const launcher = new FirefoxLauncher({
      spawn: vi.fn(), mkdtemp: vi.fn(), writeFile: vi.fn(), rm: vi.fn(), firefoxPath: '',
    });
    const e = launcher.attach({ bidiUrl: 'ws://x', rdpPort: 6000 });
    expect(e).toEqual({ bidiUrl: 'ws://x', rdpPort: 6000, profileDir: null });
  });
});

describe('FirefoxLauncher.shutdown', () => {
  it('kills proc and removes profile dir', async () => {
    const proc = fakeProcess();
    const rm = vi.fn().mockResolvedValue(undefined);
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/ff-z'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm,
      firefoxPath: '/usr/bin/firefox',
    });
    const p = launcher.launch({});
    queueMicrotask(() => proc.stderr.emit('data', Buffer.from(
      'WebDriver BiDi listening on ws://127.0.0.1:9222/session/x\n' +
      'Remote Debugging Server listening on port 6000\n',
    )));
    await p;
    await launcher.shutdown({ sigtermTimeoutMs: 1 });
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(rm).toHaveBeenCalledWith('/tmp/ff-z', { recursive: true, force: true });
  });

  it('shutdown without prior launch is a no-op', async () => {
    const rm = vi.fn().mockResolvedValue(undefined);
    const launcher = new FirefoxLauncher({
      spawn: vi.fn(), mkdtemp: vi.fn(), writeFile: vi.fn(), rm, firefoxPath: '',
    });
    await launcher.shutdown();
    expect(rm).not.toHaveBeenCalled();
  });
});
