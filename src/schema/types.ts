/** Types matching candidate-events.schema.json */

export type Confidence = 'CONFIRMED' | 'LIKELY' | 'POSSIBLE';

/** Protocol through which an artifact was submitted */
export type SubmissionProtocol = 'web' | 'mcp' | 'a2a';

/** Session lifecycle state machine */
export type SessionStatus = 'active' | 'paused' | 'closed';
export type SessionTransitionAction = 'pause' | 'resume' | 'close';
export type Direction = 'inbound' | 'outbound' | 'internal';
export type AssumptionType = 'ownership' | 'contract' | 'ordering' | 'existence';

export interface PayloadField {
  field: string;
  type: string;
}

export interface Integration {
  direction: Direction;
  channel?: string;
}

export interface DomainEvent {
  name: string;
  aggregate: string;
  trigger: string;
  payload: PayloadField[];
  state_change?: string;
  integration: Integration;
  sources?: string[];
  confidence: Confidence;
  notes?: string;
}

export interface BoundaryAssumption {
  id: string;
  type: AssumptionType;
  statement: string;
  affects_events: string[];
  confidence: Confidence;
  verify_with: string;
}

export interface CandidateEventsMetadata {
  role: string;
  scope: string;
  goal: string;
  generated_at: string;
  event_count: number;
  assumption_count: number;
}

export interface CandidateEventsFile {
  metadata: CandidateEventsMetadata;
  domain_events: DomainEvent[];
  boundary_assumptions: BoundaryAssumption[];
}

/** A loaded file with its parsed data and source info */
export interface LoadedFile {
  filename: string;
  role: string;
  data: CandidateEventsFile;
}

/** Jam session artifacts — outcomes from collaborative resolution */

export interface OwnershipAssignment {
  aggregate: string;
  ownerRole: string;
  assignedBy: string;
  assignedAt: string;
}

export interface ConflictResolution {
  overlapLabel: string;
  resolution: string;
  chosenApproach: string;
  resolvedBy: string[];
  resolvedAt: string;
}

export interface UnresolvedItem {
  id: string;
  description: string;
  relatedOverlap?: string;
  flaggedBy: string;
  flaggedAt: string;
}

/** Contract artifacts — output from /formalize */

export interface EventContract {
  eventName: string;
  aggregate: string;
  version: string;
  schema: Record<string, unknown>;
  owner: string;
  consumers: string[];
  producedBy: string;
}

export interface BoundaryContract {
  boundaryName: string;
  aggregates: string[];
  events: string[];
  owner: string;
  externalDependencies: string[];
}

export interface ContractBundle {
  generatedAt: string;
  sourceJamCode?: string;
  eventContracts: EventContract[];
  boundaryContracts: BoundaryContract[];
}

/** Integration report — output from /integrate */

export type IntegrationCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface IntegrationCheck {
  name: string;
  status: IntegrationCheckStatus;
  message: string;
  details?: string;
}

export interface IntegrationReport {
  generatedAt: string;
  sourceContracts: string[];
  checks: IntegrationCheck[];
  overallStatus: IntegrationCheckStatus;
  summary: string;
}

export interface JamArtifacts {
  startedAt: string;
  ownershipMap: OwnershipAssignment[];
  resolutions: ConflictResolution[];
  unresolved: UnresolvedItem[];
}
