export class CapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class CapabilityUnavailableError extends CapabilityError {
  constructor(public capability: string, public hint?: string) {
    super(`capability unavailable: ${capability}`);
  }
}

export class NotPausedError extends CapabilityError {
  constructor() {
    super('thread not paused');
  }
}

export class PauseContextLostError extends CapabilityError {
  constructor() {
    super('pause actor invalidated');
  }
}

export class BreakpointUnresolvedError extends CapabilityError {
  constructor(public reason: 'noScript' | 'noCodeAtLineColumn', public extra?: unknown) {
    super(`breakpoint unresolved: ${reason}`);
  }
}

export class TargetNotFoundError extends CapabilityError {
  constructor(public kind: string, public id: string) {
    super(`target not found: ${kind}=${id}`);
  }
}

export class WorkerNotAttachedError extends CapabilityError {
  constructor(public workerId: string) {
    super(`worker not attached: ${workerId}`);
  }
}

export class PrefsActorUnavailableError extends CapabilityError {
  constructor() {
    super('RDP PreferenceActor unavailable');
  }
}

export class LlmNotConfiguredError extends CapabilityError {
  constructor() {
    super('LLM provider not configured');
  }
}

export class LlmFailedError extends CapabilityError {
  constructor(public cause: unknown) {
    super('LLM call failed');
  }
}

export class AstParseFailedError extends CapabilityError {
  constructor(public details: unknown) {
    super('AST parse failed');
  }
}
