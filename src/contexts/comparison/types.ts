/**
 * Abstract artifact shape for comparison — decoupled from LoadedFile.
 * Any artifact source (YAML files, API submissions, etc.) must adapt to this shape.
 */
export interface ComparableArtifact {
  role: string;
  events: ComparableEvent[];
  assumptions: ComparableAssumption[];
}

export interface ComparableEvent {
  name: string;
  aggregate: string;
}

export interface ComparableAssumption {
  id: string;
  type: string;
  statement: string;
  affectsEvents: string[];
}
