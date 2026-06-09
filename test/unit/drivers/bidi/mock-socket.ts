import { EventEmitter } from 'node:events';
import { SocketLike } from '../../../../src/drivers/bidi/protocol.js';

export class MockSocket extends EventEmitter implements SocketLike {
  sent: string[] = [];
  readyState = 1; // OPEN
  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; this.emit('close'); }
  // helpers
  receive(payload: unknown): void { this.emit('message', { data: JSON.stringify(payload) }); }
}
