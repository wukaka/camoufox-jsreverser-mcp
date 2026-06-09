export class DriverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class DriverProtocolError extends DriverError {
  constructor(public code: string, public payload: unknown, message?: string) {
    super(message ?? `protocol error: ${code}`);
  }
}

export class DriverDisconnectedError extends DriverError {
  constructor(message = 'driver disconnected') {
    super(message);
  }
}

export class DriverTimeoutError extends DriverError {
  constructor(public method: string) {
    super(`timeout: ${method}`);
  }
}
