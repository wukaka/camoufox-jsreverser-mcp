import { describe, it, expect, vi } from 'vitest';
import { makeScriptHost } from '../../../src/capabilities/scriptHost.js';

describe('scriptHost', () => {
  it('listRealms without contextId calls script.getRealms with empty params', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({
      realms: [{ realm: 'r1', origin: 'https://a', type: 'window' }],
    }) };
    const sh = makeScriptHost(bidi as any);
    const out = await sh.listRealms();
    expect(bidi.send).toHaveBeenCalledWith('script.getRealms', {});
    expect(out).toEqual([{ realmId: 'r1', origin: 'https://a', type: 'window' }]);
  });

  it('listRealms with contextId scopes the call', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({ realms: [] }) };
    const sh = makeScriptHost(bidi as any);
    await sh.listRealms('ctx1');
    expect(bidi.send).toHaveBeenCalledWith('script.getRealms', { context: 'ctx1' });
  });

  it('evaluate (success) returns result wrapped in { result }', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({ type: 'success', result: { value: 2 } }) };
    const sh = makeScriptHost(bidi as any);
    const r = await sh.evaluate('r1', '1+1', { awaitPromise: true });
    expect(bidi.send).toHaveBeenCalledWith('script.evaluate', {
      expression: '1+1', target: { realm: 'r1' }, awaitPromise: true,
    });
    expect(r).toEqual({ result: { value: 2 } });
  });

  it('evaluate (exception) returns exceptionDetails', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({ type: 'exception', exceptionDetails: { text: 'boom' } }) };
    const sh = makeScriptHost(bidi as any);
    const r = await sh.evaluate('r1', 'x()', {});
    expect(r.exceptionDetails).toEqual({ text: 'boom' });
    expect(r.result).toBeUndefined();
  });

  it('evaluate default awaitPromise is false', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({ type: 'success', result: { value: 1 } }) };
    const sh = makeScriptHost(bidi as any);
    await sh.evaluate('r1', '1');
    expect(bidi.send).toHaveBeenCalledWith('script.evaluate', {
      expression: '1', target: { realm: 'r1' }, awaitPromise: false,
    });
  });

  it('callFunction passes functionDeclaration + args', async () => {
    const bidi = { send: vi.fn().mockResolvedValue({ type: 'success', result: { value: 'ok' } }) };
    const sh = makeScriptHost(bidi as any);
    await sh.callFunction('r1', '(a, b) => a + b', [{ value: 1 }, { value: 2 }], { awaitPromise: true });
    expect(bidi.send).toHaveBeenCalledWith('script.callFunction', {
      functionDeclaration: '(a, b) => a + b',
      target: { realm: 'r1' },
      arguments: [{ value: 1 }, { value: 2 }],
      awaitPromise: true,
    });
  });
});
