import { DomainEvent, DomainEventSchema } from "./domain-events.js";

// ---------------------------------------------------------------------------
// EventStore — append-only, in-memory event log for domain events
// ---------------------------------------------------------------------------

type Listener = (event: DomainEvent) => void;

export class EventStore {
  private readonly store = new Map<string, DomainEvent[]>();
  private readonly listeners = new Set<Listener>();

  /**
   * Validate and append a domain event to the session's event log.
   * Throws a ZodError if the event fails schema validation.
   */
  append(sessionCode: string, event: DomainEvent): void {
    // Validate with Zod — throws ZodError on failure
    const validated = DomainEventSchema.parse(event);

    if (!this.store.has(sessionCode)) {
      this.store.set(sessionCode, []);
    }
    this.store.get(sessionCode)!.push(validated);

    // Notify listeners — snapshot the set to guard against mid-iteration mutations
    const snapshot = Array.from(this.listeners);
    for (const listener of snapshot) {
      listener(validated);
    }
  }

  /**
   * Return all events for the given session in append order.
   * Returns an empty array if the session has no events.
   */
  getEvents(sessionCode: string): DomainEvent[] {
    return [...(this.store.get(sessionCode) ?? [])];
  }

  /**
   * Return events for the session that occurred strictly after the given
   * ISO timestamp string. Comparison is lexicographic (ISO 8601 sorts correctly).
   */
  getEventsSince(sessionCode: string, afterTimestamp: string): DomainEvent[] {
    return this.getEvents(sessionCode).filter(
      (e) => e.timestamp > afterTimestamp
    );
  }

  /**
   * Subscribe to all future appended events across all sessions.
   * Returns an unsubscribe function.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Replay all events for the given session through a projector function,
   * in the original append order.
   */
  replay(sessionCode: string, projector: (event: DomainEvent) => void): void {
    for (const event of this.getEvents(sessionCode)) {
      projector(event);
    }
  }

  /**
   * List all session codes that have at least one event.
   */
  getSessionCodes(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Remove all events for the given session. Intended for use in tests.
   */
  clear(sessionCode: string): void {
    this.store.delete(sessionCode);
  }
}
