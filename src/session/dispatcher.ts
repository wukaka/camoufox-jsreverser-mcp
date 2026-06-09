type Handler = (payload: Record<string, unknown>) => void;

export class ChannelDispatcher {
  private handlers = new Map<string, Handler[]>();
  on(channel: string, h: Handler): void {
    const list = this.handlers.get(channel) ?? [];
    list.push(h);
    this.handlers.set(channel, list);
  }
  dispatch(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const ch = typeof p.channel === 'string' ? p.channel : null;
    if (!ch) return;
    const list = this.handlers.get(ch);
    if (!list) return;
    for (const h of list) { try { h(p); } catch { /* swallow */ } }
  }
}
