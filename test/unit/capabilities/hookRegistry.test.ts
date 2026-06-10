import { describe, it, expect, vi } from 'vitest';
import { makeHookRegistry } from '../../../src/capabilities/hookRegistry.js';
import { HookTable } from '../../../src/session/caches.js';
import { ChannelDispatcher } from '../../../src/session/dispatcher.js';
import type { PreloadInjector, WorkerTopology } from '../../../src/capabilities/types.js';

function fakePreload(): PreloadInjector & { add: ReturnType<typeof vi.fn>; addToWorker: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } {
  return {
    add: vi.fn().mockResolvedValue('preload-1'),
    addToWorker: vi.fn().mockResolvedValue({ injectedAt: 'post-start' }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeWorkers(): WorkerTopology {
  return { listWorkers: vi.fn().mockResolvedValue([
    { realmId: 'wkr-1', type: 'worker', origin: 'https://a' },
    { realmId: 'wkr-2', type: 'service-worker', origin: 'https://a' },
  ])};
}

describe('hookRegistry', () => {
  it('create() returns hookId + scriptPreview embedding emit name', () => {
    const inj = fakePreload();
    const reg = makeHookRegistry({
      table: new HookTable(),
      dispatcher: new ChannelDispatcher(),
      preload: inj,
      workers: fakeWorkers(),
      emitName: '__mcp_emit_abc',
    });
    const { hookId, scriptPreview } = reg.create({
      name: 'fetch-hook',
      targetExpr: 'window.fetch',
      capture: ['args', 'return'],
    });
    expect(hookId).toMatch(/^hook-[a-z0-9]+$/);
    expect(scriptPreview).toContain('__mcp_emit_abc');
    expect(scriptPreview).toContain('window.fetch');
    expect(scriptPreview).toContain(hookId);
  });

  it('inject(target=page) calls preloadInjector.add and records preloadId', async () => {
    const inj = fakePreload();
    const table = new HookTable();
    const reg = makeHookRegistry({
      table, dispatcher: new ChannelDispatcher(), preload: inj,
      workers: fakeWorkers(), emitName: '__mcp_emit_abc',
    });
    const { hookId } = reg.create({ name: 'h', targetExpr: 'x', capture: ['args'] });
    const r = await reg.inject(hookId, { target: 'page' });
    expect(r.warnings).toEqual([]);
    expect(inj.add).toHaveBeenCalledTimes(1);
    expect(table.get(hookId)?.preloadId).toBe('preload-1');
  });

  it('inject(target=worker:<id>) calls addToWorker and records the realm', async () => {
    const inj = fakePreload();
    const table = new HookTable();
    const reg = makeHookRegistry({
      table, dispatcher: new ChannelDispatcher(), preload: inj,
      workers: fakeWorkers(), emitName: '__mcp_emit_abc',
    });
    const { hookId } = reg.create({ name: 'h', targetExpr: 'x', capture: ['args'] });
    const r = await reg.inject(hookId, { target: 'worker:wkr-1' });
    expect(inj.addToWorker).toHaveBeenCalledWith(expect.any(String), 'wkr-1');
    expect(table.get(hookId)?.workerInjections).toContain('wkr-1');
    expect(r.warnings).toContain('worker_injection_delayed');
  });

  it('inject(target=all-workers) iterates listWorkers and injects to each', async () => {
    const inj = fakePreload();
    const table = new HookTable();
    const workers = fakeWorkers();
    const reg = makeHookRegistry({
      table, dispatcher: new ChannelDispatcher(), preload: inj,
      workers, emitName: '__mcp_emit_abc',
    });
    const { hookId } = reg.create({ name: 'h', targetExpr: 'x', capture: ['args'] });
    await reg.inject(hookId, { target: 'all-workers' });
    expect(inj.addToWorker).toHaveBeenCalledTimes(2);
    expect(table.get(hookId)?.workerInjections.sort()).toEqual(['wkr-1', 'wkr-2']);
  });

  it('dispatcher hook channel routes samples into the table', () => {
    const inj = fakePreload();
    const table = new HookTable();
    const dispatcher = new ChannelDispatcher();
    const reg = makeHookRegistry({
      table, dispatcher, preload: inj,
      workers: fakeWorkers(), emitName: '__mcp_emit_abc',
    });
    const { hookId } = reg.create({ name: 'h', targetExpr: 'x', capture: ['args'] });
    dispatcher.dispatch({ channel: 'hook', hookId, ts: 1, args: ['a'] });
    dispatcher.dispatch({ channel: 'hook', hookId, ts: 2, args: ['b'] });
    const samples = reg.read(hookId);
    expect(samples).toHaveLength(2);
    expect((samples[0] as any).args).toEqual(['a']);
  });

  it('read with limit/since filters', () => {
    const inj = fakePreload();
    const table = new HookTable();
    const dispatcher = new ChannelDispatcher();
    const reg = makeHookRegistry({
      table, dispatcher, preload: inj,
      workers: fakeWorkers(), emitName: '__mcp_emit_abc',
    });
    const { hookId } = reg.create({ name: 'h', targetExpr: 'x', capture: ['args'] });
    dispatcher.dispatch({ channel: 'hook', hookId, ts: 1 });
    dispatcher.dispatch({ channel: 'hook', hookId, ts: 5 });
    dispatcher.dispatch({ channel: 'hook', hookId, ts: 10 });
    expect(reg.read(hookId, { since: 4 })).toHaveLength(2);
    expect(reg.read(hookId, { limit: 1 })).toHaveLength(1);
  });

  it('remove() calls preloadInjector.remove and deletes entry', async () => {
    const inj = fakePreload();
    const table = new HookTable();
    const reg = makeHookRegistry({
      table, dispatcher: new ChannelDispatcher(), preload: inj,
      workers: fakeWorkers(), emitName: '__mcp_emit_abc',
    });
    const { hookId } = reg.create({ name: 'h', targetExpr: 'x', capture: ['args'] });
    await reg.inject(hookId, { target: 'page' });
    await reg.remove(hookId);
    expect(inj.remove).toHaveBeenCalledWith('preload-1');
    expect(table.get(hookId)).toBeUndefined();
  });

  it('list() reports sampleCount and injected status', async () => {
    const inj = fakePreload();
    const table = new HookTable();
    const dispatcher = new ChannelDispatcher();
    const reg = makeHookRegistry({
      table, dispatcher, preload: inj,
      workers: fakeWorkers(), emitName: '__mcp_emit_abc',
    });
    const { hookId } = reg.create({ name: 'h1', targetExpr: 'window.fetch', capture: ['args'] });
    await reg.inject(hookId, { target: 'page' });
    dispatcher.dispatch({ channel: 'hook', hookId, ts: 1 });
    const list = reg.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      hookId, name: 'h1', targetExpr: 'window.fetch', sampleCount: 1, injected: true,
    });
  });
});
