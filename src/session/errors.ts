export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ResourceNotFoundError extends SessionError {
  constructor(public kind: string, public id: string) {
    super(`resource not found: ${kind}=${id}`);
  }
}

export class ScriptNotCollectedYetError extends SessionError {
  constructor(public hint: string) {
    super(`script not collected: ${hint}`);
  }
}

export class BrowserNotReadyError extends SessionError {
  constructor(message = 'browser not ready') {
    super(message);
  }
}
