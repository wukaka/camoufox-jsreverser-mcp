import { BidiDriver } from '../drivers/bidi/BidiDriver.js';
import { ConsoleRing } from '../session/caches.js';
import { LogSink } from './types.js';

export function makeLogSink(bidi: BidiDriver, ring: ConsoleRing): LogSink {
  bidi.on('log.entryAdded', (entry: unknown) => {
    ring.push(entry);
  });
  return {};
}
