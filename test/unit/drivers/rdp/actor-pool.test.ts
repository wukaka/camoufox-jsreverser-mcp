import { describe, it, expect } from 'vitest';
import { ActorFifo } from '../../../../src/drivers/rdp/actor-pool.js';

describe('ActorFifo', () => {
  it('runs requests serially per actor', async () => {
    const fifo = new ActorFifo();
    const order: number[] = [];
    const a = fifo.run('act1', async () => { order.push(1); await new Promise(r => setTimeout(r, 30)); order.push(2); return 'a'; });
    const b = fifo.run('act1', async () => { order.push(3); return 'b'; });
    expect(await a).toBe('a');
    expect(await b).toBe('b');
    expect(order).toEqual([1, 2, 3]);
  });

  it('runs different actors in parallel', async () => {
    const fifo = new ActorFifo();
    const t0 = Date.now();
    await Promise.all([
      fifo.run('a1', async () => new Promise(r => setTimeout(r, 50))),
      fifo.run('a2', async () => new Promise(r => setTimeout(r, 50))),
    ]);
    expect(Date.now() - t0).toBeLessThan(90);
  });
});
