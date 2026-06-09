import { describe, it, expect, vi } from 'vitest';
import { ChannelDispatcher } from '../../../src/session/dispatcher.js';

describe('ChannelDispatcher', () => {
  it('routes payload by channel field', () => {
    const d = new ChannelDispatcher();
    const onHook = vi.fn();
    const onWs = vi.fn();
    d.on('hook', onHook);
    d.on('ws', onWs);
    d.dispatch({ channel: 'hook', x: 1 });
    d.dispatch({ channel: 'ws', y: 2 });
    expect(onHook).toHaveBeenCalledWith({ channel: 'hook', x: 1 });
    expect(onWs).toHaveBeenCalledWith({ channel: 'ws', y: 2 });
  });

  it('drops payloads with unknown / missing channel silently', () => {
    const d = new ChannelDispatcher();
    expect(() => d.dispatch({ x: 1 })).not.toThrow();
    expect(() => d.dispatch({ channel: 'mystery' })).not.toThrow();
  });
});
