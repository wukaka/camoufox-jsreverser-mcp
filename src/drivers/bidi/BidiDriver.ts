import { EventEmitter } from 'node:events';
import { BidiIncoming, BidiRequest, SocketLike } from './protocol.js';
import { DriverDisconnectedError, DriverProtocolError, DriverTimeoutError } from '../errors.js';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

export interface BidiDriverOpts {
  socket: SocketLike;
  timeoutMs?: number;
}

export class BidiDriver extends EventEmitter {
  private socket: SocketLike;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private closed = false;
  private timeoutMs: number;

  constructor(opts: BidiDriverOpts) {
    super();
    this.socket = opts.socket;
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.socket.on('message', (raw: { data: string } | string) => {
      const data = typeof raw === 'string' ? raw : raw.data;
      this.onMessage(data);
    });
    this.socket.on('close', () => this.onClose());
  }

  send<T = unknown>(method: string, params: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new DriverDisconnectedError());
    const id = this.nextId++;
    const req: BidiRequest = { id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new DriverTimeoutError(method));
      }, this.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer, method });
      try {
        this.socket.send(JSON.stringify(req));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new DriverDisconnectedError((e as Error).message));
      }
    });
  }

  close(): void {
    if (!this.closed) this.socket.close();
  }

  private onMessage(raw: string): void {
    let msg: BidiIncoming;
    try { msg = JSON.parse(raw) as BidiIncoming; } catch { return; }
    if (msg.type === 'event') {
      this.emit(msg.method, msg.params);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.type === 'success') p.resolve(msg.result);
    else p.reject(new DriverProtocolError(msg.error, msg, msg.message));
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    const err = new DriverDisconnectedError();
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear();
    this.emit('__closed');
  }
}
