import { z } from "zod";

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
// Configuration Context events
// ---------------------------------------------------------------------------

export const SessionConfiguredSchema = baseEventSchema.extend({
  type: z.literal("SessionConfigured"),
  configDelta: z.record(z.string(), z.unknown()),
  configuredBy: z.string(),
});
export type SessionConfigured = z.infer<typeof SessionConfiguredSchema>;

// ---------------------------------------------------------------------------
// Discriminated union — all 18 domain events
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
  SessionConfiguredSchema,
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
  "SessionConfigured",
] as const;
