import { EventEmitter } from 'node:events';

export class MockSocket extends EventEmitter {
  sent: string[] = [];
  readyState = 1; // OPEN
  send(data: string): void { this.sent.push(data); }
  close(): void { this.readyState = 3; this.emit('close'); }
  // helpers
  receive(payload: unknown): void { this.emit('message', { data: JSON.stringify(payload) }); }
}
