import { describe, it, expect } from 'vitest';
import { DriverError, DriverProtocolError, DriverDisconnectedError } from '../../../src/drivers/errors.js';
import { CapabilityError, CapabilityUnavailableError, NotPausedError } from '../../../src/capabilities/errors.js';
import { SessionError, ResourceNotFoundError } from '../../../src/session/errors.js';

describe('error classes', () => {
  it('DriverProtocolError carries original payload', () => {
    const e = new DriverProtocolError('noScript', { from: 'thread1' });
    expect(e).toBeInstanceOf(DriverError);
    expect(e.code).toBe('noScript');
    expect(e.payload).toEqual({ from: 'thread1' });
  });

  it('NotPausedError is a CapabilityError', () => {
    const e = new NotPausedError();
    expect(e).toBeInstanceOf(CapabilityError);
  });

  it('ResourceNotFoundError carries kind + id', () => {
    const e = new ResourceNotFoundError('hookId', 'abc');
    expect(e).toBeInstanceOf(SessionError);
    expect(e.kind).toBe('hookId');
    expect(e.id).toBe('abc');
  });
});
