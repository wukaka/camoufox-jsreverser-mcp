export class ActorFifo {
  private chains = new Map<string, Promise<unknown>>();
  run<T>(actor: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(actor) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.chains.set(actor, next.catch(() => undefined));
    return next;
  }
}
