export interface Subscription { events: string[]; contexts?: string[] }

export class SubscriptionRegistry {
  private subs: Subscription[] = [];

  add(s: Subscription): void { this.subs.push(s); }

  remove(events: string[], contexts?: string[]): void {
    this.subs = this.subs.filter(
      s => !(arraysEqual(s.events, events) && arraysEqual(s.contexts ?? [], contexts ?? [])),
    );
  }

  list(): readonly Subscription[] { return [...this.subs]; }

  clear(): void { this.subs = []; }
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
