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

function mockFetch(impl: (url: string, init: any) => any): typeof fetch {
  return ((url: string, init: any) => {
    const out = impl(url, init);
    return Promise.resolve(out);
  }) as unknown as typeof fetch;
}

describe('FirefoxLauncher.launch (geckodriver-fronted)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('spawns geckodriver, POSTs /session, returns webSocketUrl + sessionId', async () => {
    const proc = fakeProcess();
    const spawn = vi.fn().mockReturnValue(proc);
    const ports: number[] = [];
    const freePort = vi.fn().mockImplementation(async () => {
      const p = 60000 + ports.length;
      ports.push(p);
      return p;
    });

    let postedTo = '';
    let postedBody = '';
    const fetchImpl = mockFetch((url, init) => {
      postedTo = url;
      postedBody = init?.body ?? '';
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          value: {
            sessionId: 'sess-123',
            capabilities: { webSocketUrl: 'ws://127.0.0.1:9001/session/sess-123' },
          },
        }),
      };
    });

    const launcher = new FirefoxLauncher({
      spawn,
      mkdtemp: vi.fn().mockResolvedValue('/tmp/cam-profile-x'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      camoufoxPath: '/cam/binary',
      geckodriverPath: '/usr/local/bin/geckodriver',
      freePort,
      fetch: fetchImpl,
    });

    const p = launcher.launch({ userAgentOverride: 'Mozilla/5.0 spoofed' });
    // Emit both banners so the launcher proceeds: "Listening on" gates POST /session,
    // and "Read port:" supplies the RDP port reported by Marionette after Firefox starts.
    setImmediate(() => {
      proc.stderr.emit('data', Buffer.from('1234\tgeckodriver\tINFO\tListening on 127.0.0.1:60000\n'));
      proc.stderr.emit('data', Buffer.from('Read port: 65001\n'));
    });
    const endpoints = await p;

    expect(spawn).toHaveBeenCalledWith(
      '/usr/local/bin/geckodriver',
      expect.arrayContaining(['--port', '60000', '--binary', '/cam/binary']),
      expect.objectContaining({ stdio: expect.any(Array) }),
    );
    expect(postedTo).toBe('http://127.0.0.1:60000/session');
    const body = JSON.parse(postedBody);
    expect(body.capabilities.alwaysMatch.browserName).toBe('firefox');
    expect(body.capabilities.alwaysMatch.webSocketUrl).toBe(true);

    expect(endpoints.bidiUrl).toBe('ws://127.0.0.1:9001/session/sess-123');
    expect(endpoints.sessionId).toBe('sess-123');
    expect(endpoints.geckodriverPort).toBe(60000);
    expect(endpoints.rdpPort).toBe(65001);
    expect(endpoints.profileDir).toBe('/tmp/cam-profile-x');
  });

  it('writes user.js with the userAgentOverride pref', async () => {
    const proc = fakeProcess();
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/cam-profile-y'),
      writeFile,
      rm: vi.fn().mockResolvedValue(undefined),
      camoufoxPath: '/cam',
      geckodriverPath: '/g',
      freePort: vi.fn().mockResolvedValue(60100),
      fetch: mockFetch(() => ({
        ok: true,
        text: async () => '',
        json: async () => ({ value: { sessionId: 's', capabilities: { webSocketUrl: 'ws://x' } } }),
      })),
    });

    const p = launcher.launch({ userAgentOverride: 'spoofed-UA' });
    setImmediate(() => {
      proc.stderr.emit('data', Buffer.from('Listening on 127.0.0.1:60100\n'));
      proc.stderr.emit('data', Buffer.from('Read port: 65100\n'));
    });
    await p;

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/cam-profile-y'),
      expect.stringContaining('general.useragent.override'),
    );
    const [, content] = writeFile.mock.calls[0]!;
    expect(content as string).toContain('"spoofed-UA"');
  });

  it('rejects when geckodriver never prints the listening banner before timeout', async () => {
    const proc = fakeProcess();
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/cam-x'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      camoufoxPath: '/cam',
      geckodriverPath: '/g',
      freePort: vi.fn().mockResolvedValue(60200),
      fetch: mockFetch(() => ({ ok: true, text: async () => '', json: async () => ({}) })),
      startupTimeoutMs: 50,
    });
    await expect(launcher.launch({})).rejects.toThrow(/geckodriver startup timeout/);
  }, 1000);

  it('rejects when POST /session returns non-ok HTTP', async () => {
    const proc = fakeProcess();
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/cam-y'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      camoufoxPath: '/cam',
      geckodriverPath: '/g',
      freePort: vi.fn().mockResolvedValue(60300),
      fetch: mockFetch(() => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) })),
    });
    const p = launcher.launch({});
    setImmediate(() => proc.stderr.emit('data', Buffer.from('Listening on 127.0.0.1:60300\n')));
    await expect(p).rejects.toThrow(/HTTP 500/);
  });

  it('rejects when /session response lacks webSocketUrl or sessionId', async () => {
    const proc = fakeProcess();
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/cam-z'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      camoufoxPath: '/cam',
      geckodriverPath: '/g',
      freePort: vi.fn().mockResolvedValue(60400),
      fetch: mockFetch(() => ({
        ok: true,
        text: async () => '',
        json: async () => ({ value: { sessionId: 's' } /* webSocketUrl missing */ }),
      })),
    });
    const p = launcher.launch({});
    setImmediate(() => proc.stderr.emit('data', Buffer.from('Listening on 127.0.0.1:60400\n')));
    await expect(p).rejects.toThrow(/missing sessionId or webSocketUrl/);
  });
});

describe('FirefoxLauncher.attach', () => {
  it('echoes supplied endpoints with default sessionId/geckodriverPort placeholders', () => {
    const launcher = new FirefoxLauncher({
      spawn: vi.fn(), mkdtemp: vi.fn(), writeFile: vi.fn(), rm: vi.fn(),
      camoufoxPath: '/c', geckodriverPath: '/g',
    });
    const e = launcher.attach({ bidiUrl: 'ws://x', rdpPort: 6000 });
    expect(e).toEqual({
      bidiUrl: 'ws://x', rdpPort: 6000, profileDir: null,
      sessionId: '', geckodriverPort: 0,
    });
  });

  it('propagates sessionId + geckodriverPort when supplied', () => {
    const launcher = new FirefoxLauncher({
      spawn: vi.fn(), mkdtemp: vi.fn(), writeFile: vi.fn(), rm: vi.fn(),
      camoufoxPath: '/c', geckodriverPath: '/g',
    });
    const e = launcher.attach({ bidiUrl: 'ws://x', rdpPort: 6000, sessionId: 'sid', geckodriverPort: 42 });
    expect(e.sessionId).toBe('sid');
    expect(e.geckodriverPort).toBe(42);
  });
});

describe('FirefoxLauncher.shutdown', () => {
  it('DELETEs the WebDriver session, kills proc, and removes profile', async () => {
    const proc = fakeProcess();
    const deleted: string[] = [];
    const fetchImpl = mockFetch((url, init) => {
      if (init?.method === 'DELETE') deleted.push(url);
      return {
        ok: true,
        text: async () => '',
        json: async () => ({ value: { sessionId: 'sess', capabilities: { webSocketUrl: 'ws://x' } } }),
      };
    });
    const rm = vi.fn().mockResolvedValue(undefined);
    const launcher = new FirefoxLauncher({
      spawn: vi.fn().mockReturnValue(proc),
      mkdtemp: vi.fn().mockResolvedValue('/tmp/cam-shut'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rm,
      camoufoxPath: '/c',
      geckodriverPath: '/g',
      freePort: vi.fn().mockResolvedValue(60500),
      fetch: fetchImpl,
    });
    const p = launcher.launch({});
    setImmediate(() => {
      proc.stderr.emit('data', Buffer.from('Listening on 127.0.0.1:60500\n'));
      proc.stderr.emit('data', Buffer.from('Read port: 65500\n'));
    });
    await p;
    await launcher.shutdown({ sigtermTimeoutMs: 1 });

    expect(deleted).toEqual(['http://127.0.0.1:60500/session/sess']);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(rm).toHaveBeenCalledWith('/tmp/cam-shut', { recursive: true, force: true });
  });

  it('shutdown without prior launch is a no-op', async () => {
    const rm = vi.fn().mockResolvedValue(undefined);
    const launcher = new FirefoxLauncher({
      spawn: vi.fn(), mkdtemp: vi.fn(), writeFile: vi.fn(), rm,
      camoufoxPath: '/c', geckodriverPath: '/g',
    });
    await launcher.shutdown();
    expect(rm).not.toHaveBeenCalled();
  });
});
