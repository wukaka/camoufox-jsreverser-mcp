import { EventEmitter } from 'node:events';

export function encodeFrame(obj: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.from(`${payload.length}:`, 'utf8');
  return Buffer.concat([header, payload]);
}

export class FrameDecoder extends EventEmitter {
  private buf: Buffer = Buffer.alloc(0);

  feed(chunk: Buffer): void {
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    while (true) {
      const colonIdx = this.buf.indexOf(0x3a); // ':'
      if (colonIdx < 0) return;
      const header = this.buf.subarray(0, colonIdx).toString('utf8');
      const len = Number(header);
      if (!Number.isFinite(len) || len < 0) {
        this.buf = Buffer.alloc(0); // discard garbage
        return;
      }
      if (this.buf.length < colonIdx + 1 + len) return;
      const payload = this.buf.subarray(colonIdx + 1, colonIdx + 1 + len).toString('utf8');
      this.buf = this.buf.subarray(colonIdx + 1 + len) as Buffer;
      try { this.emit('frame', JSON.parse(payload)); } catch { /* skip malformed payload */ }
    }
  }
}
