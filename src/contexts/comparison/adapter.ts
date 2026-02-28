import type { LoadedFile } from '../../schema/types.js';
import type { ComparableArtifact } from './types.js';

export function toComparableArtifact(file: LoadedFile): ComparableArtifact {
  return {
    role: file.role,
    events: file.data.domain_events.map(e => ({
      name: e.name,
      aggregate: e.aggregate,
    })),
    assumptions: file.data.boundary_assumptions.map(a => ({
      id: a.id,
      type: a.type,
      statement: a.statement,
      affectsEvents: a.affects_events,
    })),
  };
}
