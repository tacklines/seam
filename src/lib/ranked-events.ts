import type { AppState } from '../state/app-state.js';
import type { RankedEvent } from '../components/visualization/priority-view.js';
import type { EventPriority } from '../schema/types.js';

export type { RankedEvent };

/**
 * Derive RankedEvent[] from loaded files for the priority-view component.
 * Deduplicates by event name (first occurrence wins), computes crossRefs,
 * compositeScore, and tier.
 * Pure derivation — no side effects.
 */
export function deriveRankedEvents(
  files: AppState['files'],
  tierOverrides: Map<string, string>,
): RankedEvent[] {
  if (files.length === 0) return [];

  // Build: eventName -> first occurrence data + crossRef count
  const eventMap = new Map<string, { event: AppState['files'][number]['data']['domain_events'][number]; crossRefs: number }>();

  for (const file of files) {
    for (const ev of file.data.domain_events) {
      const existing = eventMap.get(ev.name);
      if (existing) {
        existing.crossRefs += 1;
      } else {
        eventMap.set(ev.name, { event: ev, crossRefs: 1 });
      }
    }
  }

  const confidenceWeight: Record<string, number> = { CONFIRMED: 3, LIKELY: 2, POSSIBLE: 1 };
  const directionWeight: Record<string, number> = { outbound: 2, inbound: 1.5, internal: 1 };

  // Max possible raw score: confidenceWeight=3, directionWeight=2, crossRefs=files.length
  // rawMax = 3 * 2 * (1 + files.length * 0.5)
  const maxCrossRefs = files.length;
  const rawMax = 3 * 2 * (1 + maxCrossRefs * 0.5);

  const ranked: RankedEvent[] = [];

  for (const [name, { event, crossRefs }] of eventMap) {
    const cw = confidenceWeight[event.confidence] ?? 1;
    const dw = directionWeight[event.integration?.direction ?? 'internal'] ?? 1;
    const cappedCrossRefs = Math.min(crossRefs, maxCrossRefs);
    const raw = cw * dw * (1 + cappedCrossRefs * 0.5);
    const compositeScore = Math.round((raw / rawMax) * 100 * 10) / 10;

    let tier: RankedEvent['tier'];
    if (compositeScore >= 60) {
      tier = 'must_have';
    } else if (compositeScore >= 30) {
      tier = 'should_have';
    } else {
      tier = 'could_have';
    }

    // Apply user's manual tier override if present
    const overrideTier = tierOverrides.get(name);
    if (overrideTier) {
      tier = overrideTier as RankedEvent['tier'];
    }

    ranked.push({
      name,
      aggregate: event.aggregate,
      confidence: event.confidence,
      direction: event.integration?.direction ?? 'internal',
      crossRefs,
      compositeScore,
      tier,
    });
  }

  return ranked.sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Derive EventPriority[] from ranked events for the comparison-view progress bar.
 * Maps RankedEvent tier (snake_case) to EventPriority tier.
 * Pure derivation — no side effects.
 */
export function deriveComparisonPriorities(
  files: AppState['files'],
  tierOverrides: Map<string, string>,
): EventPriority[] {
  return deriveRankedEvents(files, tierOverrides).map((ev) => ({
    eventName: ev.name,
    participantId: 'local',
    tier: ev.tier,
    setAt: new Date().toISOString(),
  }));
}
