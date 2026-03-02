import type { BoundaryAssumption, LoadedFile } from '../schema/types.js';

export interface MatchedEvent {
  eventName: string;
  role: string;
  matchReason: string;
}

export interface AssumptionMatch {
  assumption: BoundaryAssumption;
  assumptionRole: string;
  matched: boolean;
  matchedEvents: MatchedEvent[];
}

/**
 * Tokenize a string for keyword matching.
 * Splits on non-alphanumeric characters and lower-cases all tokens.
 * Also splits camelCase / PascalCase into constituent words.
 */
function tokenize(text: string): string[] {
  // Insert space before uppercase letters to handle camelCase/PascalCase
  const spaced = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2); // skip very short tokens
}

/**
 * Cross-references assumptions from each file against events defined by OTHER roles.
 *
 * Matching rules:
 * 1. Direct event match: assumption.affects_events contains an event name defined by another role → MATCHED
 * 2. Keyword match: tokens from assumption.statement overlap with event names or payload field names
 *    from other roles — catches natural-language descriptions referencing domain concepts.
 */
export function matchAssumptions(files: LoadedFile[]): AssumptionMatch[] {
  if (files.length === 0) return [];

  // Build a lookup: role → set of event names and payload field names (all lower-cased)
  const eventNamesByRole = new Map<string, Set<string>>();
  const payloadTokensByRole = new Map<string, Set<string>>();

  for (const file of files) {
    const eventNames = new Set<string>();
    const payloadTokens = new Set<string>();
    for (const event of file.data.domain_events) {
      eventNames.add(event.name.toLowerCase());
      for (const token of tokenize(event.name)) {
        payloadTokens.add(token);
      }
      for (const field of event.payload) {
        for (const token of tokenize(field.field)) {
          payloadTokens.add(token);
        }
      }
    }
    eventNamesByRole.set(file.role, eventNames);
    payloadTokensByRole.set(file.role, payloadTokens);
  }

  // Build a lookup: event name (lower-cased) → { role, original name }
  const eventByName = new Map<string, { role: string; name: string }[]>();
  for (const file of files) {
    for (const event of file.data.domain_events) {
      const key = event.name.toLowerCase();
      const list = eventByName.get(key) ?? [];
      list.push({ role: file.role, name: event.name });
      eventByName.set(key, list);
    }
  }

  const results: AssumptionMatch[] = [];

  for (const file of files) {
    for (const assumption of file.data.boundary_assumptions) {
      const matchedEvents: MatchedEvent[] = [];

      // --- Rule 1: Direct event name match in affects_events ---
      for (const affectedEvent of assumption.affects_events) {
        const key = affectedEvent.toLowerCase();
        const entries = eventByName.get(key) ?? [];
        for (const entry of entries) {
          if (entry.role !== file.role) {
            matchedEvents.push({
              eventName: entry.name,
              role: entry.role,
              matchReason: `Event '${entry.name}' referenced in affects_events is defined by role '${entry.role}'`,
            });
          }
        }
      }

      // --- Rule 2: Keyword match against other roles' event names and payload fields ---
      const statementTokens = new Set(tokenize(assumption.statement));
      for (const otherFile of files) {
        if (otherFile.role === file.role) continue;

        const otherTokens = payloadTokensByRole.get(otherFile.role) ?? new Set();
        const overlap = [...statementTokens].filter((t) => otherTokens.has(t));

        if (overlap.length > 0) {
          // Find which specific events/fields contributed the overlap tokens
          for (const event of otherFile.data.domain_events) {
            const eventTokens = new Set([
              ...tokenize(event.name),
              ...event.payload.flatMap((f) => tokenize(f.field)),
            ]);
            const eventOverlap = [...statementTokens].filter((t) => eventTokens.has(t));
            if (eventOverlap.length > 0) {
              // Avoid duplicating a match already found via Rule 1
              const alreadyMatched = matchedEvents.some(
                (m) => m.eventName === event.name && m.role === otherFile.role
              );
              if (!alreadyMatched) {
                matchedEvents.push({
                  eventName: event.name,
                  role: otherFile.role,
                  matchReason: `Assumption mentions '${eventOverlap.join(', ')}' — found in event '${event.name}' from role '${otherFile.role}'`,
                });
              }
            }
          }
        }
      }

      results.push({
        assumption,
        assumptionRole: file.role,
        matched: matchedEvents.length > 0,
        matchedEvents,
      });
    }
  }

  return results;
}
