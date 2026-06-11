import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { startFixtureServer, type FixtureServer } from './server.js';

describe('fixture server', () => {
  let s: FixtureServer;
  beforeAll(async () => { s = await startFixtureServer(); });
  afterAll(async () => { await s.close(); });

  it('serves all fixture pages', async () => {
    for (const page of [
      'fixture-sig',
      'fixture-xhr-pause',
      'fixture-ws',
      'probe-webdriver',
      'obfuscated-aes',
    ]) {
      const res = await fetch(`${s.url}/${page}.html`);
      expect(res.status, page).toBe(200);
      const body = await res.text();
      expect(body, page).toContain(`<title>${page}`);
    }
  });

  it('serves /strict-csp with CSP header', async () => {
    const res = await fetch(`${s.url}/strict-csp`);
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toMatch(/default-src 'self'/);
  });

  it('serves the external sign.js script', async () => {
    const res = await fetch(`${s.url}/sign.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('computeSig');
  });

  it('/api/secret echoes x-sig header (POST + GET)', async () => {
    const post = await fetch(`${s.url}/api/secret`, {
      method: 'POST',
      headers: { 'x-sig': 'abc', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(await post.json()).toEqual({ ok: false, sig: 'abc' });

    const get = await fetch(`${s.url}/api/secret`, { headers: { 'x-sig': 'EXPECTED_SIG' } });
    expect(await get.json()).toEqual({ ok: true, sig: 'EXPECTED_SIG' });
  });

  it('echo WebSocket greets and echoes frames', async () => {
    const ws = new WebSocket(s.wsUrl);
    const greeting = await new Promise<string>((resolve, reject) => {
      ws.once('error', reject);
      ws.once('message', (m) => resolve(m.toString()));
    });
    expect(greeting).toBe('hello');

    const echoed = await new Promise<string>((resolve) => {
      ws.once('message', (m) => resolve(m.toString()));
      ws.send('ping');
    });
    expect(echoed).toBe('echo:ping');
    ws.close();
  });
});
