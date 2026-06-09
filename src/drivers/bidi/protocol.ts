export interface BidiRequest { id: number; method: string; params: unknown }
export type BidiResponse =
  | { type: 'success'; id: number; result: unknown }
  | { type: 'error'; id: number; error: string; message?: string };
export interface BidiEvent { type: 'event'; method: string; params: unknown }
export type BidiIncoming = BidiResponse | BidiEvent;

export interface SocketLike {
  send(data: string): void;
  close(): void;
  readyState: number;
  on(ev: 'message' | 'close' | 'error', cb: (...args: any[]) => void): void;
}
