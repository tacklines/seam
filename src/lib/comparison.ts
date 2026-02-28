import type { LoadedFile } from '../schema/types.js';
import type { ComparableArtifact, ComparableEvent, ComparableAssumption } from '../contexts/comparison/types.js';
import { toComparableArtifact } from '../contexts/comparison/adapter.js';

export type OverlapKind = 'same-name' | 'same-aggregate' | 'assumption-conflict';

export interface Overlap {
  kind: OverlapKind;
  label: string;
  roles: string[];
  details: string;
}

/** Find events that share the same name across different roles */
function findNameOverlaps(artifacts: ComparableArtifact[]): Overlap[] {
  const byName = new Map<string, { role: string; event: ComparableEvent }[]>();
  for (const a of artifacts) {
    for (const e of a.events) {
      const list = byName.get(e.name) ?? [];
      list.push({ role: a.role, event: e });
      byName.set(e.name, list);
    }
  }
  const overlaps: Overlap[] = [];
  for (const [name, entries] of byName) {
    if (entries.length > 1) {
      const roles = [...new Set(entries.map((e) => e.role))];
      if (roles.length > 1) {
        overlaps.push({
          kind: 'same-name',
          label: name,
          roles,
          details: `Event "${name}" appears in roles: ${roles.join(', ')}`,
        });
      }
    }
  }
  return overlaps;
}

/** Find aggregates that appear in multiple roles */
function findAggregateOverlaps(artifacts: ComparableArtifact[]): Overlap[] {
  const byAgg = new Map<string, Set<string>>();
  for (const a of artifacts) {
    for (const e of a.events) {
      const set = byAgg.get(e.aggregate) ?? new Set();
      set.add(a.role);
      byAgg.set(e.aggregate, set);
    }
  }
  const overlaps: Overlap[] = [];
  for (const [agg, roles] of byAgg) {
    if (roles.size > 1) {
      const roleList = [...roles];
      overlaps.push({
        kind: 'same-aggregate',
        label: agg,
        roles: roleList,
        details: `Aggregate "${agg}" claimed by roles: ${roleList.join(', ')}`,
      });
    }
  }
  return overlaps;
}

/** Find boundary assumptions that may conflict across roles */
function findAssumptionConflicts(artifacts: ComparableArtifact[]): Overlap[] {
  const overlaps: Overlap[] = [];
  const allAssumptions: { role: string; assumption: ComparableAssumption }[] = [];
  for (const a of artifacts) {
    for (const assumption of a.assumptions) {
      allAssumptions.push({ role: a.role, assumption });
    }
  }

  // Check for ownership conflicts on the same events
  for (let i = 0; i < allAssumptions.length; i++) {
    for (let j = i + 1; j < allAssumptions.length; j++) {
      const a = allAssumptions[i];
      const b = allAssumptions[j];
      if (a.role === b.role) continue;

      const sharedEvents = a.assumption.affectsEvents.filter((e) =>
        b.assumption.affectsEvents.includes(e)
      );

      if (sharedEvents.length > 0 && a.assumption.type === b.assumption.type) {
        overlaps.push({
          kind: 'assumption-conflict',
          label: `${a.assumption.id} vs ${b.assumption.id}`,
          roles: [a.role, b.role],
          details: `Both assume about ${sharedEvents.join(', ')}: "${a.assumption.statement}" vs "${b.assumption.statement}"`,
        });
      }
    }
  }
  return overlaps;
}

/** Primary API — works with abstract ComparableArtifact shape */
export function compareArtifacts(artifacts: ComparableArtifact[]): Overlap[] {
  if (artifacts.length < 2) return [];
  return [
    ...findNameOverlaps(artifacts),
    ...findAggregateOverlaps(artifacts),
    ...findAssumptionConflicts(artifacts),
  ];
}

/** Backward-compatible wrapper — adapts LoadedFile to ComparableArtifact internally */
export function compareFiles(files: LoadedFile[]): Overlap[] {
  return compareArtifacts(files.map(toComparableArtifact));
}
