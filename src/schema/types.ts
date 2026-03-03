/** Types matching candidate-events.schema.json */

export type Confidence = 'CONFIRMED' | 'LIKELY' | 'POSSIBLE';

// ---------------------------------------------------------------------------
// Participant — canonical shared type used by both server and client
// ---------------------------------------------------------------------------

/** The role a participant plays in a session */
export type ParticipantType = 'human' | 'agent' | 'service';

/** A participant in a session, shared between server and client representations */
export interface Participant {
  id: string;
  name: string;
  joinedAt: string;
  type?: ParticipantType;
  capabilities?: string[];
}

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

/** Session-level configuration — shared across all participants, stored in session state.
 * Changing a setting emits a `SessionConfigured` domain event that all participants receive.
 * See: docs/experience-design.md § Settings, configure_session MCP tool */

/** Configuration for the Comparison phase */
export interface ComparisonConfig {
  /**
   * How strictly event names and field names are compared.
   * `semantic` treats `amountCents` and `amount_cents` as equivalent.
   * `exact` requires byte-for-byte equality.
   * Default: `'semantic'`
   */
  sensitivity: 'semantic' | 'exact';
  /**
   * When true, overlaps and conflicts are detected automatically as artifacts arrive.
   * Default: `true`
   */
  autoDetectConflicts: boolean;
  /**
   * When true, resolution suggestions are generated for detected conflicts.
   * Default: `true`
   */
  suggestResolutions: boolean;
}

/** Configuration for the Contracts (Build) phase */
export interface ContractsConfig {
  /**
   * How non-compliant artifacts are handled.
   * `strict` — block submission; `warn` — surface warnings; `relaxed` — log only.
   * Default: `'warn'`
   */
  strictness: 'strict' | 'warn' | 'relaxed';
  /**
   * When and how participants are notified of contract drift.
   * `immediate` — toast on every drift event; `batched` — digest at end of session;
   * `silent` — no notification, drift is visible only in the Contract tab.
   * Default: `'immediate'`
   */
  driftNotifications: 'immediate' | 'batched' | 'silent';
}

/** Scoring weights and tier defaults for the Rank (Priority) phase */
export interface RankingWeights {
  /** Weight applied to the event's confidence score. Default: `1` */
  confidence: number;
  /** Weight applied to implementation complexity estimate. Default: `1` */
  complexity: number;
  /** Weight applied to how many other events reference this one. Default: `1` */
  references: number;
}

/** Configuration for the Rank (Priority View) phase */
export interface RankingConfig {
  /**
   * Numeric multipliers used when computing composite priority scores.
   * All weights default to `1` (equal weighting).
   */
  weights: RankingWeights;
  /**
   * The MoSCoW tier assigned to newly discovered events before voting.
   * Default: `'Should Have'`
   */
  defaultTier: string;
}

/** Configuration for agent delegation autonomy */
export interface DelegationConfig {
  /**
   * How much autonomy agents have when proposing actions.
   * `assisted` — agent proposes, human must approve (default);
   * `semi_autonomous` — agent acts, human can undo;
   * `autonomous` — agent acts without approval.
   * Default: `'assisted'`
   */
  level: 'assisted' | 'semi_autonomous' | 'autonomous';
  /**
   * How long (in seconds) a pending approval request remains active before it
   * auto-expires. Default: `86400` (24 hours).
   */
  approvalExpiry: number;
}

/** Configuration for in-app notification behaviour */
export interface NotificationsConfig {
  /**
   * How long (in milliseconds) toast notifications remain visible before
   * auto-dismissing. Default: `6000` (6 seconds, matching drift-alert spec).
   */
  toastDuration: number;
  /**
   * Domain event names that should never trigger a toast notification.
   * Useful for high-frequency events that would otherwise flood the UI.
   * Default: `[]` (all events may produce toasts).
   */
  silentEvents: string[];
}

/**
 * Top-level per-session configuration object.
 * Stored in session state and shared across all participants.
 * Consumed by the `configure_session` and `get_session_config` MCP tools.
 */
export interface SessionConfig {
  /** Comparison phase settings */
  comparison: ComparisonConfig;
  /** Contract enforcement settings */
  contracts: ContractsConfig;
  /** Priority scoring and tier settings */
  ranking: RankingConfig;
  /** Agent autonomy and approval settings */
  delegation: DelegationConfig;
  /** Toast and notification settings */
  notifications: NotificationsConfig;
}

/**
 * Sane defaults for every SessionConfig field.
 * The app works correctly without any configuration — these values are applied
 * when a session is created and no explicit config is provided.
 */
export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  comparison: {
    sensitivity: 'semantic',
    autoDetectConflicts: true,
    suggestResolutions: true,
  },
  contracts: {
    strictness: 'warn',
    driftNotifications: 'immediate',
  },
  ranking: {
    weights: {
      confidence: 1,
      complexity: 1,
      references: 1,
    },
    defaultTier: 'Should Have',
  },
  delegation: {
    level: 'assisted',
    approvalExpiry: 86400,
  },
  notifications: {
    toastDuration: 6000,
    silentEvents: [],
  },
} as const satisfies SessionConfig;

/** Priority tier for ranking domain events — MoSCoW-style classification */
export type PriorityTier = 'must_have' | 'should_have' | 'could_have';

/**
 * Per-participant priority record for a single domain event.
 * Stored in the session and used to compute composite scores.
 */
export interface EventPriority {
  /** Name of the domain event being prioritized */
  eventName: string;
  /** Participant who set this priority */
  participantId: string;
  /** MoSCoW classification tier */
  tier: PriorityTier;
  /** ISO timestamp when this priority was set */
  setAt: string;
}

/** A single upvote or downvote cast by a participant on a domain event */
export interface Vote {
  /** Participant who cast the vote */
  participantId: string;
  /** Event this vote applies to */
  eventName: string;
  /** Direction of the vote */
  direction: 'up' | 'down';
  /** ISO timestamp when this vote was cast */
  castAt: string;
}

/**
 * Computed composite score for a domain event, aggregated across all
 * participant priorities and votes.
 */
export interface CompositeScore {
  /** Name of the domain event */
  eventName: string;
  /**
   * Score computed from tier weights and vote balance:
   * - Tier weights: must_have=3, should_have=2, could_have=1
   * - Averaged across participants then adjusted by net vote (upvotes - downvotes)
   */
  compositeScore: number;
  /** All priorities set for this event */
  priorities: EventPriority[];
  /** All votes cast for this event */
  votes: Vote[];
}

/** Complexity estimate using T-shirt sizing */
export type WorkItemComplexity = 'S' | 'M' | 'L' | 'XL';

/**
 * A vertically-sliced unit of work derived from decomposing an aggregate.
 * Work items are independently deliverable and testable.
 */
export interface WorkItem {
  /** Unique identifier for the work item */
  id: string;
  /** Short, imperative title describing what gets built */
  title: string;
  /** Longer description providing context and rationale */
  description: string;
  /** List of testable acceptance criteria statements */
  acceptanceCriteria: string[];
  /** T-shirt size estimate of implementation effort */
  complexity: WorkItemComplexity;
  /** Names of domain events from the parent aggregate that this work item addresses */
  linkedEvents: string[];
  /** IDs of work items that must complete before this one can start */
  dependencies: string[];
}

/**
 * A directed dependency between two work items.
 * The item identified by `fromId` must complete before the item identified by `toId`.
 * Stored separately from the WorkItem record to allow bidirectional queries.
 */
export interface WorkItemDependency {
  /** ID of the work item that must complete first */
  fromId: string;
  /** ID of the work item that depends on fromId */
  toId: string;
  /** Participant who set this dependency */
  participantId: string;
  /** ISO timestamp when the dependency was recorded */
  setAt: string;
}

/**
 * A computed coverage record showing which work items address a domain event.
 * Produced by DecompositionService.getCoverageMatrix().
 */
export interface CoverageEntry {
  /** Name of the domain event */
  eventName: string;
  /** IDs of work items that list this event in their linkedEvents */
  workItemIds: string[];
  /** True when at least one work item covers this event */
  covered: boolean;
}

/**
 * A draft artifact visible only to the author — a staging area before formal submission.
 * Created via `create_draft`, promoted via `publish_draft` / `submit_artifact`.
 */
export interface Draft {
  /** Unique identifier for the draft */
  id: string;
  /** Participant who authored this draft */
  participantId: string;
  /** The candidate events content being drafted */
  content: CandidateEventsFile;
  /** ISO 8601 timestamp when the draft was created */
  createdAt: string;
  /** ISO 8601 timestamp when the draft was last updated */
  updatedAt: string;
  /** ISO 8601 timestamp when the draft was published, or null if still a draft */
  publishedAt: string | null;
}

/**
 * A plain-language requirement captured during the Spark phase.
 * Requirements are the lowest-friction entry point — users type what the system
 * needs to do, and later derive domain events from them.
 */
export interface Requirement {
  /** Unique identifier for the requirement */
  id: string;
  /** Plain-language description of what the system needs to do */
  text: string;
  /** Participant who authored this requirement */
  participantId: string;
  /** ISO 8601 timestamp when the requirement was created */
  createdAt: string;
}

/**
 * Agent autonomy level for the current session.
 * Controls how much agents can do without explicit human approval.
 */
export type DelegationLevel = 'assisted' | 'semi_autonomous' | 'autonomous';

/**
 * An agent-proposed action awaiting human approval.
 * Used when delegation level is `assisted` or `semi_autonomous`.
 */
export interface PendingApproval {
  /** Unique identifier for this pending approval request */
  id: string;
  /** ID of the agent that proposed the action */
  agentId: string;
  /** Human-readable description of what the agent wants to do */
  action: string;
  /** Optional explanation from the agent for why it wants to take this action */
  reasoning?: string;
  /** ISO 8601 timestamp when this approval request expires (default: 24 hours after creation) */
  expiresAt: string;
}
