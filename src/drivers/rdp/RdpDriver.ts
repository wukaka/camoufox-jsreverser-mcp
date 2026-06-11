import { EventEmitter } from 'node:events';
import { encodeFrame, FrameDecoder } from './framing.js';
import { DriverDisconnectedError, DriverProtocolError, DriverTimeoutError } from '../errors.js';

interface TcpLike {
  write(b: Buffer): boolean;
  end(): void;
  on(ev: 'data' | 'close' | 'error', cb: (...args: any[]) => void): void;
}

export interface RdpDriverOpts { socket: TcpLike; timeoutMs?: number }

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/** One entry in the per-actor send queue (waiting its turn). */
interface QueuedRequest {
  actor: string;
  encoded: Buffer;
  pending: Pending;
}

export class RdpDriver extends EventEmitter {
  private socket: TcpLike;
  private decoder = new FrameDecoder();
  // live pending response for each actor (at most 1 outstanding per actor)
  private activePending = new Map<string, Pending>();
  // queued-but-not-yet-sent requests per actor
  private sendQueue = new Map<string, QueuedRequest[]>();
  // whether an actor currently has an outstanding request
  private busy = new Set<string>();
  private timeoutMs: number;
  private connected = false;
  private closed = false;
  /** First frame from the server is a greeting (`{from:'root', applicationType:...}`).
   *  We must consume it before issuing any request, otherwise it would race the first
   *  call and be mis-attributed as that call's reply (Mozilla RDP has no per-message id;
   *  responses are matched by FIFO order per `from` actor). */
  private greeting: Record<string, unknown> | null = null;
  private greetingWaiters: Array<(g: Record<string, unknown>) => void> = [];

  constructor(opts: RdpDriverOpts) {
    super();
    this.socket = opts.socket;
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.decoder.on('frame', (f) => this.onFrame(f as { from?: string; [k: string]: unknown }));
    this.socket.on('data', (b) => this.decoder.feed(b as Buffer));
    this.socket.on('close', () => this.onClose());
    this.socket.on('error', () => this.onClose());
  }

  markConnected(): void { this.connected = true; }
  isConnected(): boolean { return this.connected && !this.closed; }

  /** Resolve when the server greeting arrives. Marks the driver connected as a side
   *  effect so callers can `await rdp.awaitGreeting()` and immediately `rdp.call(...)`. */
  awaitGreeting(timeoutMs = 5_000): Promise<Record<string, unknown>> {
    if (this.greeting) return Promise.resolve(this.greeting);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.greetingWaiters.indexOf(resolveOnce);
        if (idx >= 0) this.greetingWaiters.splice(idx, 1);
        reject(new DriverTimeoutError('rdp greeting'));
      }, timeoutMs);
      const resolveOnce = (g: Record<string, unknown>): void => {
        clearTimeout(timer);
        this.connected = true;
        resolve(g);
      };
      this.greetingWaiters.push(resolveOnce);
    });
  }

  call<T = unknown>(actor: string, request: object): Promise<T> {
    if (this.closed) return Promise.reject(new DriverDisconnectedError());
    return new Promise<T>((resolve, reject) => {
      const encoded = encodeFrame({ to: actor, ...request });
      const typeLabel = (request as { type?: string }).type ?? 'unknown';

      const pending: Pending = {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer: undefined as unknown as NodeJS.Timeout,
      };

      if (this.busy.has(actor)) {
        // Queue behind the in-flight request
        const queue = this.sendQueue.get(actor) ?? [];
        queue.push({ actor, encoded, pending });
        this.sendQueue.set(actor, queue);
        // Start timeout immediately so the caller sees it
        pending.timer = setTimeout(() => {
          this.removeQueued(actor, pending);
          reject(new DriverTimeoutError(`${actor}:${typeLabel}`));
        }, this.timeoutMs);
      } else {
        // Actor is idle — send immediately and register as active
        this.busy.add(actor);
        pending.timer = setTimeout(() => {
          this.activePending.delete(actor);
          this.busy.delete(actor);
          reject(new DriverTimeoutError(`${actor}:${typeLabel}`));
          this.drainQueue(actor);
        }, this.timeoutMs);
        this.activePending.set(actor, pending);
        try {
          this.socket.write(encoded);
        } catch (e) {
          clearTimeout(pending.timer);
          this.activePending.delete(actor);
          this.busy.delete(actor);
          reject(new DriverDisconnectedError((e as Error).message));
        }
      }
    });
  }

  close(): void {
    if (!this.closed) this.socket.end();
  }

  private removeQueued(actor: string, pending: Pending): void {
    const queue = this.sendQueue.get(actor);
    if (!queue) return;
    const idx = queue.findIndex(q => q.pending === pending);
    if (idx >= 0) queue.splice(idx, 1);
    if (queue.length === 0) this.sendQueue.delete(actor);
  }

  private drainQueue(actor: string): void {
    const queue = this.sendQueue.get(actor);
    if (!queue || queue.length === 0) {
      this.busy.delete(actor);
      return;
    }
    const next = queue.shift()!;
    if (queue.length === 0) this.sendQueue.delete(actor);
    clearTimeout(next.pending.timer);
    const typeLabel = 'queued';
    const pending = next.pending;
    pending.timer = setTimeout(() => {
      this.activePending.delete(actor);
      this.busy.delete(actor);
      pending.reject(new DriverTimeoutError(`${actor}:${typeLabel}`));
      this.drainQueue(actor);
    }, this.timeoutMs);
    this.activePending.set(actor, pending);
    try {
      this.socket.write(next.encoded);
    } catch (e) {
      clearTimeout(pending.timer);
      this.activePending.delete(actor);
      this.busy.delete(actor);
      pending.reject(new DriverDisconnectedError((e as Error).message));
    }
  }

  private onFrame(frame: { from?: string; error?: string; message?: string; type?: string; applicationType?: string; [k: string]: unknown }): void {
    const from = frame.from;
    if (!from) return;
    // First-ever frame is always the server greeting (`from='root'`, no in-flight
    // request, has `applicationType`). Capture it and notify any awaitGreeting()
    // listeners — DO NOT match it to any pending call.
    if (!this.greeting && from === 'root' && frame.applicationType !== undefined) {
      this.greeting = frame as Record<string, unknown>;
      const waiters = this.greetingWaiters.splice(0);
      for (const w of waiters) w(this.greeting);
      return;
    }
    const pending = this.activePending.get(from);
    // Replies have NO `type` field; notifications carry one.
    if (pending && !frame.type) {
      this.activePending.delete(from);
      clearTimeout(pending.timer);
      if (frame.error) {
        pending.reject(new DriverProtocolError(frame.error, frame, frame.message));
      } else {
        pending.resolve(frame);
      }
      this.drainQueue(from);
      return;
    }
    // Notification
    const evtName = frame.type ? `${from}.${frame.type}` : `from:${from}`;
    this.emit(evtName, frame);
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    const err = new DriverDisconnectedError();
    for (const [, pending] of this.activePending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.activePending.clear();
    for (const [, queue] of this.sendQueue) {
      for (const { pending } of queue) {
        clearTimeout(pending.timer);
        pending.reject(err);
      }
    }
    this.sendQueue.clear();
    this.busy.clear();
    this.emit('__closed');
  }
}
