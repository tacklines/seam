import { z } from "zod";
import type {
  PriorityTier,
  WorkItem,
  DelegationLevel,
  SessionConfig,
  CandidateEventsFile,
  RequirementStatus,
} from "../../schema/types.js";

// ---------------------------------------------------------------------------
// Base schema — every domain event carries these fields
// ---------------------------------------------------------------------------

const baseEventSchema = z.object({
  eventId: z.string(),
  sessionCode: z.string(),
  timestamp: z.string(),
  type: z.string(),
});

// ---------------------------------------------------------------------------
// Session Context events
// ---------------------------------------------------------------------------

export const SessionCreatedSchema = baseEventSchema.extend({
  type: z.literal("SessionCreated"),
  creatorName: z.string(),
  creatorId: z.string(),
});
export type SessionCreated = z.infer<typeof SessionCreatedSchema>;

export const ParticipantJoinedSchema = baseEventSchema.extend({
  type: z.literal("ParticipantJoined"),
  participantId: z.string(),
  participantName: z.string(),
  participantType: z.enum(["human", "agent", "service"]),
});
export type ParticipantJoined = z.infer<typeof ParticipantJoinedSchema>;

export const ParticipantLeftSchema = baseEventSchema.extend({
  type: z.literal("ParticipantLeft"),
  participantId: z.string(),
});
export type ParticipantLeft = z.infer<typeof ParticipantLeftSchema>;

export const SessionPausedSchema = baseEventSchema.extend({
  type: z.literal("SessionPaused"),
  reason: z.string().optional(),
});
export type SessionPaused = z.infer<typeof SessionPausedSchema>;

export const SessionResumedSchema = baseEventSchema.extend({
  type: z.literal("SessionResumed"),
});
export type SessionResumed = z.infer<typeof SessionResumedSchema>;

export const SessionClosedSchema = baseEventSchema.extend({
  type: z.literal("SessionClosed"),
  reason: z.string().optional(),
});
export type SessionClosed = z.infer<typeof SessionClosedSchema>;

// ---------------------------------------------------------------------------
// Artifact Context events
// ---------------------------------------------------------------------------

export const ArtifactSubmittedSchema = baseEventSchema.extend({
  type: z.literal("ArtifactSubmitted"),
  artifactId: z.string(),
  participantId: z.string(),
  fileName: z.string(),
  artifactType: z.string(),
  version: z.number(),
});
export type ArtifactSubmitted = z.infer<typeof ArtifactSubmittedSchema>;

export const ArtifactValidationFailedSchema = baseEventSchema.extend({
  type: z.literal("ArtifactValidationFailed"),
  artifactId: z.string(),
  participantId: z.string(),
  fileName: z.string(),
  errors: z.array(z.string()),
});
export type ArtifactValidationFailed = z.infer<typeof ArtifactValidationFailedSchema>;

// ---------------------------------------------------------------------------
// Comparison Context events
// ---------------------------------------------------------------------------

export const ComparisonCompletedSchema = baseEventSchema.extend({
  type: z.literal("ComparisonCompleted"),
  comparisonId: z.string(),
  artifactIds: z.array(z.string()),
  overlapCount: z.number(),
  gapCount: z.number(),
});
export type ComparisonCompleted = z.infer<typeof ComparisonCompletedSchema>;

export const ConflictsDetectedSchema = baseEventSchema.extend({
  type: z.literal("ConflictsDetected"),
  comparisonId: z.string(),
  conflicts: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
    })
  ),
});
export type ConflictsDetected = z.infer<typeof ConflictsDetectedSchema>;

export const GapsIdentifiedSchema = baseEventSchema.extend({
  type: z.literal("GapsIdentified"),
  comparisonId: z.string(),
  gaps: z.array(
    z.object({
      description: z.string(),
    })
  ),
});
export type GapsIdentified = z.infer<typeof GapsIdentifiedSchema>;

// ---------------------------------------------------------------------------
// Agreement Context events
// ---------------------------------------------------------------------------

export const ResolutionRecordedSchema = baseEventSchema.extend({
  type: z.literal("ResolutionRecorded"),
  overlapLabel: z.string(),
  resolution: z.string(),
  chosenApproach: z.string(),
  resolvedBy: z.array(z.string()),
});
export type ResolutionRecorded = z.infer<typeof ResolutionRecordedSchema>;

export const OwnershipAssignedSchema = baseEventSchema.extend({
  type: z.literal("OwnershipAssigned"),
  aggregate: z.string(),
  ownerRole: z.string(),
  assignedBy: z.string(),
});
export type OwnershipAssigned = z.infer<typeof OwnershipAssignedSchema>;

export const ItemFlaggedSchema = baseEventSchema.extend({
  type: z.literal("ItemFlagged"),
  description: z.string(),
  flaggedBy: z.string(),
  relatedOverlap: z.string().optional(),
});
export type ItemFlagged = z.infer<typeof ItemFlaggedSchema>;

// ---------------------------------------------------------------------------
// Contract Context events
// ---------------------------------------------------------------------------

export const ContractGeneratedSchema = baseEventSchema.extend({
  type: z.literal("ContractGenerated"),
  contractId: z.string(),
  version: z.number(),
});
export type ContractGenerated = z.infer<typeof ContractGeneratedSchema>;

export const ComplianceCheckCompletedSchema = baseEventSchema.extend({
  type: z.literal("ComplianceCheckCompleted"),
  contractId: z.string(),
  passed: z.boolean(),
  failures: z.array(z.string()),
});
export type ComplianceCheckCompleted = z.infer<typeof ComplianceCheckCompletedSchema>;

export const DriftDetectedSchema = baseEventSchema.extend({
  type: z.literal("DriftDetected"),
  contractId: z.string(),
  driftDescription: z.string(),
});
export type DriftDetected = z.infer<typeof DriftDetectedSchema>;

// ---------------------------------------------------------------------------
// Priority Context events (Phase III — Rank)
// ---------------------------------------------------------------------------

export const PrioritySetSchema = baseEventSchema.extend({
  type: z.literal("PrioritySet"),
  eventName: z.string(),
  tier: z.enum(["must_have", "should_have", "could_have", "wont_have"]) satisfies z.ZodType<PriorityTier>,
  participantId: z.string(),
});
export type PrioritySet = z.infer<typeof PrioritySetSchema>;

export const VoteCastSchema = baseEventSchema.extend({
  type: z.literal("VoteCast"),
  participantId: z.string(),
  eventName: z.string(),
  direction: z.enum(["up", "down"]),
});
export type VoteCast = z.infer<typeof VoteCastSchema>;

// ---------------------------------------------------------------------------
// Decomposition Context events (Phase IV — Slice)
// ---------------------------------------------------------------------------

const WorkItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  complexity: z.enum(["S", "M", "L", "XL"]),
  linkedEvents: z.array(z.string()),
  dependencies: z.array(z.string()),
}) satisfies z.ZodType<WorkItem>;

export const WorkItemCreatedSchema = baseEventSchema.extend({
  type: z.literal("WorkItemCreated"),
  aggregate: z.string(),
  workItem: WorkItemSchema,
});
export type WorkItemCreated = z.infer<typeof WorkItemCreatedSchema>;

export const DependencySetSchema = baseEventSchema.extend({
  type: z.literal("DependencySet"),
  fromItemId: z.string(),
  toItemId: z.string(),
});
export type DependencySet = z.infer<typeof DependencySetSchema>;

// ---------------------------------------------------------------------------
// Draft Context events (Phase V — Agree / authoring)
// ---------------------------------------------------------------------------

const CandidateEventsFileSchema: z.ZodType<CandidateEventsFile> = z.object({
  metadata: z.object({
    role: z.string(),
    scope: z.string(),
    goal: z.string(),
    generated_at: z.string(),
    event_count: z.number(),
    assumption_count: z.number(),
  }),
  domain_events: z.array(
    z.object({
      name: z.string(),
      aggregate: z.string(),
      trigger: z.string(),
      payload: z.array(z.object({ field: z.string(), type: z.string() })),
      state_change: z.string().optional(),
      integration: z.object({
        direction: z.enum(["inbound", "outbound", "internal"]),
        channel: z.string().optional(),
      }),
      sources: z.array(z.string()).optional(),
      confidence: z.enum(["CONFIRMED", "LIKELY", "POSSIBLE"]),
      notes: z.string().optional(),
    })
  ),
  boundary_assumptions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["ownership", "contract", "ordering", "existence"]),
      statement: z.string(),
      affects_events: z.array(z.string()),
      confidence: z.enum(["CONFIRMED", "LIKELY", "POSSIBLE"]),
      verify_with: z.string(),
    })
  ),
});

export const DraftCreatedSchema = baseEventSchema.extend({
  type: z.literal("DraftCreated"),
  participantId: z.string(),
  draftId: z.string(),
  content: CandidateEventsFileSchema,
});
export type DraftCreated = z.infer<typeof DraftCreatedSchema>;

export const DraftPublishedSchema = baseEventSchema.extend({
  type: z.literal("DraftPublished"),
  draftId: z.string(),
});
export type DraftPublished = z.infer<typeof DraftPublishedSchema>;

// ---------------------------------------------------------------------------
// Delegation Context events (Phase VI/VII — Build / Ship)
// ---------------------------------------------------------------------------

export const DelegationChangedSchema = baseEventSchema.extend({
  type: z.literal("DelegationChanged"),
  level: z.enum(["assisted", "semi_autonomous", "autonomous"]) satisfies z.ZodType<DelegationLevel>,
  changedBy: z.string(),
});
export type DelegationChanged = z.infer<typeof DelegationChangedSchema>;

// Partial<SessionConfig> is represented as a permissive record at runtime;
// the TypeScript type is enforced at call sites via the exported TS type.
export const SessionConfiguredSchema = baseEventSchema.extend({
  type: z.literal("SessionConfigured"),
  configDelta: z.record(z.string(), z.unknown()),
  changedBy: z.string(),
});
export type SessionConfigured = Omit<z.infer<typeof SessionConfiguredSchema>, "configDelta"> & {
  configDelta: Partial<SessionConfig>;
};

// ---------------------------------------------------------------------------
// Approval Context events (agent delegation approval loop)
// ---------------------------------------------------------------------------

export const ApprovalRequestedSchema = baseEventSchema.extend({
  type: z.literal("ApprovalRequested"),
  agentId: z.string(),
  action: z.string(),
  reasoning: z.string().optional(),
  expiresAt: z.string(),
});
export type ApprovalRequested = z.infer<typeof ApprovalRequestedSchema>;

export const ApprovalDecidedSchema = baseEventSchema.extend({
  type: z.literal("ApprovalDecided"),
  approvalId: z.string(),
  decision: z.enum(["approved", "rejected"]),
  decidedBy: z.string(),
});
export type ApprovalDecided = z.infer<typeof ApprovalDecidedSchema>;

// ---------------------------------------------------------------------------
// Presence / activity events (real-time collaboration awareness)
// ---------------------------------------------------------------------------

export const ActivityPulsedSchema = baseEventSchema.extend({
  type: z.literal("ActivityPulsed"),
  participantId: z.string(),
  participantName: z.string(),
  action: z.enum(["submitted", "resolved", "voted", "commented"]),
});
export type ActivityPulsed = z.infer<typeof ActivityPulsedSchema>;

// ---------------------------------------------------------------------------
// Requirement Context events (requirements-driven funnel)
// ---------------------------------------------------------------------------

export const RequirementSubmittedSchema = baseEventSchema.extend({
  type: z.literal("RequirementSubmitted"),
  requirementId: z.string(),
  statement: z.string(),
  authorId: z.string(),
  tags: z.array(z.string()).optional(),
});
export type RequirementSubmitted = z.infer<typeof RequirementSubmittedSchema>;

export const EventsDerivedSchema = baseEventSchema.extend({
  type: z.literal("EventsDerived"),
  requirementId: z.string(),
  suggestedEvents: z.array(z.string()),
});
export type EventsDerived = z.infer<typeof EventsDerivedSchema>;

export const DerivedEventsAcceptedSchema = baseEventSchema.extend({
  type: z.literal("DerivedEventsAccepted"),
  requirementId: z.string(),
  acceptedEvents: z.array(z.string()),
  participantId: z.string(),
});
export type DerivedEventsAccepted = z.infer<typeof DerivedEventsAcceptedSchema>;

// ---------------------------------------------------------------------------
// Discriminated union — all 31 domain events
// ---------------------------------------------------------------------------

export const DomainEventSchema = z.discriminatedUnion("type", [
  SessionCreatedSchema,
  ParticipantJoinedSchema,
  ParticipantLeftSchema,
  SessionPausedSchema,
  SessionResumedSchema,
  SessionClosedSchema,
  ArtifactSubmittedSchema,
  ArtifactValidationFailedSchema,
  ComparisonCompletedSchema,
  ConflictsDetectedSchema,
  GapsIdentifiedSchema,
  ResolutionRecordedSchema,
  OwnershipAssignedSchema,
  ItemFlaggedSchema,
  ContractGeneratedSchema,
  ComplianceCheckCompletedSchema,
  DriftDetectedSchema,
  PrioritySetSchema,
  VoteCastSchema,
  WorkItemCreatedSchema,
  DependencySetSchema,
  DraftCreatedSchema,
  DraftPublishedSchema,
  DelegationChangedSchema,
  SessionConfiguredSchema,
  ApprovalRequestedSchema,
  ApprovalDecidedSchema,
  ActivityPulsedSchema,
  RequirementSubmittedSchema,
  EventsDerivedSchema,
  DerivedEventsAcceptedSchema,
]);

export type DomainEvent = z.infer<typeof DomainEventSchema>;

// ---------------------------------------------------------------------------
// DomainEventType — string literal union of all event type names
// ---------------------------------------------------------------------------

export type DomainEventType = DomainEvent["type"];

export const DOMAIN_EVENT_TYPES: readonly DomainEventType[] = [
  "SessionCreated",
  "ParticipantJoined",
  "ParticipantLeft",
  "SessionPaused",
  "SessionResumed",
  "SessionClosed",
  "ArtifactSubmitted",
  "ArtifactValidationFailed",
  "ComparisonCompleted",
  "ConflictsDetected",
  "GapsIdentified",
  "ResolutionRecorded",
  "OwnershipAssigned",
  "ItemFlagged",
  "ContractGenerated",
  "ComplianceCheckCompleted",
  "DriftDetected",
  "PrioritySet",
  "VoteCast",
  "WorkItemCreated",
  "DependencySet",
  "DraftCreated",
  "DraftPublished",
  "DelegationChanged",
  "SessionConfigured",
  "ApprovalRequested",
  "ApprovalDecided",
  "ActivityPulsed",
  "RequirementSubmitted",
  "EventsDerived",
  "DerivedEventsAccepted",
] as const;
