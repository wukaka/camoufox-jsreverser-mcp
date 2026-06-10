export interface ScriptEntry { id: string; url: string; source: string; hash: string }
export interface RequestEntry { requestId: string; req: unknown; res?: unknown; initiator?: unknown; bodyRef?: string }
export interface HookEntry { hookId: string; def: unknown; preloadId?: string; workerInjections: string[]; samples: unknown[] }
export interface WsEntry { targetId: string; wsid: string; url: string; frames: Array<{ ts: number; dir: 'in'|'out'; data: unknown; source: 'rdp'|'preload-hook' }> }

export class ScriptCache {
  private byId = new Map<string, ScriptEntry>();
  put(e: ScriptEntry): void { this.byId.set(e.id, e); }
  get(id: string): ScriptEntry | undefined { return this.byId.get(id); }
  list(): ScriptEntry[] { return [...this.byId.values()]; }
  size(): number { return this.byId.size; }
}

export class RequestPool {
  private byId = new Map<string, RequestEntry>();
  put(e: RequestEntry): void { this.byId.set(e.requestId, e); }
  get(id: string): RequestEntry | undefined { return this.byId.get(id); }
  list(): RequestEntry[] { return [...this.byId.values()]; }
}

export class HookTable {
  private byId = new Map<string, HookEntry>();
  put(e: HookEntry): void { this.byId.set(e.hookId, e); }
  get(id: string): HookEntry | undefined { return this.byId.get(id); }
  list(): HookEntry[] { return [...this.byId.values()]; }
  delete(id: string): boolean { return this.byId.delete(id); }
}

export class WsTable {
  private byKey = new Map<string, WsEntry>();
  put(e: WsEntry): void { this.byKey.set(`${e.targetId}:${e.wsid}`, e); }
  get(targetId: string, wsid: string): WsEntry | undefined { return this.byKey.get(`${targetId}:${wsid}`); }
  list(): WsEntry[] { return [...this.byKey.values()]; }
  delete(targetId: string, wsid: string): boolean { return this.byKey.delete(`${targetId}:${wsid}`); }
}

export class ConsoleRing {
  constructor(public capacity = 5000) {}
  private buf: unknown[] = [];
  push(msg: unknown): void {
    this.buf.push(msg);
    if (this.buf.length > this.capacity) this.buf.shift();
  }
  list(limit?: number): unknown[] { return limit ? this.buf.slice(-limit) : [...this.buf]; }
}
