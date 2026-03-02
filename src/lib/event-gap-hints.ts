import type { DomainEvent } from '../schema/types.js';

export interface EventGapHint {
  id: string;
  name: string;          // suggested event name
  aggregate: string;     // which aggregate it belongs to
  reason: string;        // tooltip text explaining why
  nearEventId?: string;  // place hint near this existing event
}

/**
 * Given loaded events, suggest missing events based on common domain patterns.
 * Detects well-known lifecycle gaps like success-without-failure, request-without-completion, etc.
 */
export function generateEventGapHints(events: DomainEvent[]): EventGapHint[] {
  const hints: EventGapHint[] = [];
  const eventNames = new Set(events.map((e) => e.name));

  // Group events by aggregate for aggregate-level gap detection
  const byAggregate = new Map<string, DomainEvent[]>();
  for (const event of events) {
    if (!byAggregate.has(event.aggregate)) {
      byAggregate.set(event.aggregate, []);
    }
    byAggregate.get(event.aggregate)!.push(event);
  }

  // Pattern 1: XCreated but no XFailed → suggest XFailed
  for (const event of events) {
    const match = event.name.match(/^(.+)(Created)$/);
    if (match) {
      const base = match[1];
      const failedName = `${base}Failed`;
      if (!eventNames.has(failedName)) {
        hints.push({
          id: `hint-${event.aggregate}-${failedName}`,
          name: failedName,
          aggregate: event.aggregate,
          reason: `${event.name} exists but there is no failure path. Consider adding ${failedName} to handle error cases.`,
          nearEventId: `${event.aggregate}::${event.name}`,
        });
      }
    }
  }

  // Pattern 2: XRequested but no XCompleted and no XRejected → suggest both
  for (const event of events) {
    const match = event.name.match(/^(.+)(Requested)$/);
    if (match) {
      const base = match[1];
      const completedName = `${base}Completed`;
      const rejectedName = `${base}Rejected`;
      const hasCompleted = eventNames.has(completedName);
      const hasRejected = eventNames.has(rejectedName);

      if (!hasCompleted) {
        hints.push({
          id: `hint-${event.aggregate}-${completedName}`,
          name: completedName,
          aggregate: event.aggregate,
          reason: `${event.name} exists but ${completedName} is missing. Add it to represent successful completion.`,
          nearEventId: `${event.aggregate}::${event.name}`,
        });
      }

      if (!hasRejected) {
        hints.push({
          id: `hint-${event.aggregate}-${rejectedName}`,
          name: rejectedName,
          aggregate: event.aggregate,
          reason: `${event.name} exists but ${rejectedName} is missing. Add it to handle rejection cases.`,
          nearEventId: `${event.aggregate}::${event.name}`,
        });
      }
    }
  }

  // Pattern 3: XPlaced but no XCancelled → suggest XCancelled
  for (const event of events) {
    const match = event.name.match(/^(.+)(Placed)$/);
    if (match) {
      const base = match[1];
      const cancelledName = `${base}Cancelled`;
      if (!eventNames.has(cancelledName)) {
        hints.push({
          id: `hint-${event.aggregate}-${cancelledName}`,
          name: cancelledName,
          aggregate: event.aggregate,
          reason: `${event.name} exists but there is no cancellation path. Consider adding ${cancelledName}.`,
          nearEventId: `${event.aggregate}::${event.name}`,
        });
      }
    }
  }

  // Pattern 4: Aggregate has command events but no failure event for that aggregate
  // "Command events" are those matching Submitted, Initiated, Started patterns
  const commandSuffixes = ['Submitted', 'Initiated', 'Started'];
  for (const [aggregate, aggEvents] of byAggregate) {
    const commandEvents = aggEvents.filter((e) =>
      commandSuffixes.some((suffix) => e.name.endsWith(suffix))
    );

    // Check if this aggregate has ANY failure events
    const hasFailureEvent = aggEvents.some((e) =>
      e.name.endsWith('Failed') || e.name.endsWith('Rejected') || e.name.endsWith('Cancelled')
    );

    if (commandEvents.length > 0 && !hasFailureEvent) {
      const firstCommand = commandEvents[0];
      const base = commandSuffixes
        .reduce((name, suffix) => name.replace(new RegExp(`${suffix}$`), ''), firstCommand.name);
      const failedName = `${base}Failed`;

      // Only suggest if not already in hints (avoid duplicates from Pattern 1/2)
      const alreadySuggested = hints.some(
        (h) => h.aggregate === aggregate && h.name === failedName
      );
      if (!alreadySuggested && !eventNames.has(failedName)) {
        hints.push({
          id: `hint-${aggregate}-${failedName}-cmd`,
          name: failedName,
          aggregate,
          reason: `The ${aggregate} aggregate has command events (${commandEvents.map((e) => e.name).join(', ')}) but no failure events. Consider adding ${failedName}.`,
          nearEventId: `${aggregate}::${firstCommand.name}`,
        });
      }
    }
  }

  return hints;
}
