import type { AppState } from '../state/app-state.js';
import type { Overlap } from './comparison.js';

/**
 * Derive data needed for the agreements tab.
 * Returns all overlaps (for resolution-recorder instances), unique aggregate
 * names across all files (for ownership-grid rows), and unique role names
 * across all files (for ownership-grid columns).
 * Pure derivation — no side effects.
 */
export function deriveAgreementsData(
  files: AppState['files'],
  overlaps: Overlap[],
): {
  overlaps: Overlap[];
  aggregates: string[];
  roles: string[];
} {
  const aggregateSet = new Set<string>();
  const roleSet = new Set<string>();
  for (const file of files) {
    roleSet.add(file.role);
    for (const ev of file.data.domain_events) {
      aggregateSet.add(ev.aggregate);
    }
  }
  return {
    overlaps,
    aggregates: [...aggregateSet],
    roles: [...roleSet],
  };
}
