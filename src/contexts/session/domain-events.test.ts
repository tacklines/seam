import { describe, it, expect } from "vitest";
import {
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
  DomainEventSchema,
  DOMAIN_EVENT_TYPES,
} from "./domain-events.ts";

// ---------------------------------------------------------------------------
// Shared base fields used in every test event
// ---------------------------------------------------------------------------

const base = {
  eventId: "evt-001",
  sessionCode: "ABC123",
  timestamp: "2026-02-28T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Session Context events
// ---------------------------------------------------------------------------

describe("SessionCreated", () => {
  it("validates with correct data", () => {
    const result = SessionCreatedSchema.safeParse({
      ...base,
      type: "SessionCreated",
      creatorName: "Alice",
      creatorId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("fails when creatorName is missing", () => {
    const result = SessionCreatedSchema.safeParse({
      ...base,
      type: "SessionCreated",
      creatorId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("ParticipantJoined", () => {
  it("validates with correct data", () => {
    const result = ParticipantJoinedSchema.safeParse({
      ...base,
      type: "ParticipantJoined",
      participantId: "p-1",
      participantName: "Bob",
      participantType: "human",
    });
    expect(result.success).toBe(true);
  });

  it("validates agent and service participant types", () => {
    for (const participantType of ["agent", "service"] as const) {
      const result = ParticipantJoinedSchema.safeParse({
        ...base,
        type: "ParticipantJoined",
        participantId: "p-2",
        participantName: "Robot",
        participantType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("fails with invalid participantType", () => {
    const result = ParticipantJoinedSchema.safeParse({
      ...base,
      type: "ParticipantJoined",
      participantId: "p-3",
      participantName: "Unknown",
      participantType: "robot",
    });
    expect(result.success).toBe(false);
  });

  it("fails when participantId is missing", () => {
    const result = ParticipantJoinedSchema.safeParse({
      ...base,
      type: "ParticipantJoined",
      participantName: "Bob",
      participantType: "human",
    });
    expect(result.success).toBe(false);
  });
});

describe("ParticipantLeft", () => {
  it("validates with correct data", () => {
    const result = ParticipantLeftSchema.safeParse({
      ...base,
      type: "ParticipantLeft",
      participantId: "p-1",
    });
    expect(result.success).toBe(true);
  });

  it("fails when participantId is missing", () => {
    const result = ParticipantLeftSchema.safeParse({
      ...base,
      type: "ParticipantLeft",
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionPaused", () => {
  it("validates with optional reason", () => {
    const withReason = SessionPausedSchema.safeParse({
      ...base,
      type: "SessionPaused",
      reason: "Break time",
    });
    expect(withReason.success).toBe(true);

    const withoutReason = SessionPausedSchema.safeParse({
      ...base,
      type: "SessionPaused",
    });
    expect(withoutReason.success).toBe(true);
  });
});

describe("SessionResumed", () => {
  it("validates with no extra fields", () => {
    const result = SessionResumedSchema.safeParse({
      ...base,
      type: "SessionResumed",
    });
    expect(result.success).toBe(true);
  });
});

describe("SessionClosed", () => {
  it("validates with optional reason", () => {
    const withReason = SessionClosedSchema.safeParse({
      ...base,
      type: "SessionClosed",
      reason: "Work done",
    });
    expect(withReason.success).toBe(true);

    const withoutReason = SessionClosedSchema.safeParse({
      ...base,
      type: "SessionClosed",
    });
    expect(withoutReason.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Artifact Context events
// ---------------------------------------------------------------------------

describe("ArtifactSubmitted", () => {
  it("validates with correct data", () => {
    const result = ArtifactSubmittedSchema.safeParse({
      ...base,
      type: "ArtifactSubmitted",
      artifactId: "art-1",
      participantId: "p-1",
      fileName: "storm.yaml",
      artifactType: "candidate-events",
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it("fails when version is missing", () => {
    const result = ArtifactSubmittedSchema.safeParse({
      ...base,
      type: "ArtifactSubmitted",
      artifactId: "art-1",
      participantId: "p-1",
      fileName: "storm.yaml",
      artifactType: "candidate-events",
    });
    expect(result.success).toBe(false);
  });
});

describe("ArtifactValidationFailed", () => {
  it("validates with correct data", () => {
    const result = ArtifactValidationFailedSchema.safeParse({
      ...base,
      type: "ArtifactValidationFailed",
      artifactId: "art-2",
      participantId: "p-1",
      fileName: "bad.yaml",
      errors: ["missing required field 'role'"],
    });
    expect(result.success).toBe(true);
  });

  it("fails when errors array is missing", () => {
    const result = ArtifactValidationFailedSchema.safeParse({
      ...base,
      type: "ArtifactValidationFailed",
      artifactId: "art-2",
      participantId: "p-1",
      fileName: "bad.yaml",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Comparison Context events
// ---------------------------------------------------------------------------

describe("ComparisonCompleted", () => {
  it("validates with correct data", () => {
    const result = ComparisonCompletedSchema.safeParse({
      ...base,
      type: "ComparisonCompleted",
      comparisonId: "cmp-1",
      artifactIds: ["art-1", "art-2"],
      overlapCount: 5,
      gapCount: 2,
    });
    expect(result.success).toBe(true);
  });

  it("fails when overlapCount is missing", () => {
    const result = ComparisonCompletedSchema.safeParse({
      ...base,
      type: "ComparisonCompleted",
      comparisonId: "cmp-1",
      artifactIds: ["art-1"],
      gapCount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("ConflictsDetected", () => {
  it("validates with correct data", () => {
    const result = ConflictsDetectedSchema.safeParse({
      ...base,
      type: "ConflictsDetected",
      comparisonId: "cmp-1",
      conflicts: [{ label: "OrderPlaced", description: "Different owners" }],
    });
    expect(result.success).toBe(true);
  });

  it("fails when conflicts is missing", () => {
    const result = ConflictsDetectedSchema.safeParse({
      ...base,
      type: "ConflictsDetected",
      comparisonId: "cmp-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("GapsIdentified", () => {
  it("validates with correct data", () => {
    const result = GapsIdentifiedSchema.safeParse({
      ...base,
      type: "GapsIdentified",
      comparisonId: "cmp-1",
      gaps: [{ description: "No error handling for payment failure" }],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Agreement Context events
// ---------------------------------------------------------------------------

describe("ResolutionRecorded", () => {
  it("validates with correct data", () => {
    const result = ResolutionRecordedSchema.safeParse({
      ...base,
      type: "ResolutionRecorded",
      overlapLabel: "OrderPlaced",
      resolution: "Use shared OrderPlaced event",
      chosenApproach: "merge",
      resolvedBy: ["Alice", "Bob"],
    });
    expect(result.success).toBe(true);
  });

  it("fails when resolvedBy is missing", () => {
    const result = ResolutionRecordedSchema.safeParse({
      ...base,
      type: "ResolutionRecorded",
      overlapLabel: "OrderPlaced",
      resolution: "merge",
      chosenApproach: "merge",
    });
    expect(result.success).toBe(false);
  });
});

describe("OwnershipAssigned", () => {
  it("validates with correct data", () => {
    const result = OwnershipAssignedSchema.safeParse({
      ...base,
      type: "OwnershipAssigned",
      aggregate: "Order",
      ownerRole: "backend",
      assignedBy: "Alice",
    });
    expect(result.success).toBe(true);
  });
});

describe("ItemFlagged", () => {
  it("validates with optional relatedOverlap", () => {
    const withRelated = ItemFlaggedSchema.safeParse({
      ...base,
      type: "ItemFlagged",
      description: "Unclear ownership boundary",
      flaggedBy: "Bob",
      relatedOverlap: "OrderPlaced",
    });
    expect(withRelated.success).toBe(true);

    const withoutRelated = ItemFlaggedSchema.safeParse({
      ...base,
      type: "ItemFlagged",
      description: "Unclear ownership boundary",
      flaggedBy: "Bob",
    });
    expect(withoutRelated.success).toBe(true);
  });

  it("fails when flaggedBy is missing", () => {
    const result = ItemFlaggedSchema.safeParse({
      ...base,
      type: "ItemFlagged",
      description: "Something unclear",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract Context events
// ---------------------------------------------------------------------------

describe("ContractGenerated", () => {
  it("validates with correct data", () => {
    const result = ContractGeneratedSchema.safeParse({
      ...base,
      type: "ContractGenerated",
      contractId: "ctr-1",
      version: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe("ComplianceCheckCompleted", () => {
  it("validates passing check", () => {
    const result = ComplianceCheckCompletedSchema.safeParse({
      ...base,
      type: "ComplianceCheckCompleted",
      contractId: "ctr-1",
      passed: true,
      failures: [],
    });
    expect(result.success).toBe(true);
  });

  it("validates failing check with failures", () => {
    const result = ComplianceCheckCompletedSchema.safeParse({
      ...base,
      type: "ComplianceCheckCompleted",
      contractId: "ctr-1",
      passed: false,
      failures: ["Missing OrderShipped event"],
    });
    expect(result.success).toBe(true);
  });

  it("fails when passed field is missing", () => {
    const result = ComplianceCheckCompletedSchema.safeParse({
      ...base,
      type: "ComplianceCheckCompleted",
      contractId: "ctr-1",
      failures: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("DriftDetected", () => {
  it("validates with correct data", () => {
    const result = DriftDetectedSchema.safeParse({
      ...base,
      type: "DriftDetected",
      contractId: "ctr-1",
      driftDescription: "OrderPlaced payload changed",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Priority Context events (Phase III — Rank)
// ---------------------------------------------------------------------------

describe("PrioritySet", () => {
  it("validates with a valid tier", () => {
    const result = PrioritySetSchema.safeParse({
      ...base,
      type: "PrioritySet",
      eventName: "OrderPlaced",
      tier: "must_have",
      participantId: "p-1",
    });
    expect(result.success).toBe(true);
  });

  it("fails with an invalid tier value", () => {
    const result = PrioritySetSchema.safeParse({
      ...base,
      type: "PrioritySet",
      eventName: "OrderPlaced",
      tier: "nice_to_have",
      participantId: "p-1",
    });
    expect(result.success).toBe(false);
  });

  it("fails when eventName is missing", () => {
    const result = PrioritySetSchema.safeParse({
      ...base,
      type: "PrioritySet",
      tier: "must_have",
      participantId: "p-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("VoteCast", () => {
  it("validates an upvote", () => {
    const result = VoteCastSchema.safeParse({
      ...base,
      type: "VoteCast",
      participantId: "p-1",
      eventName: "OrderPlaced",
      direction: "up",
    });
    expect(result.success).toBe(true);
  });

  it("validates a downvote", () => {
    const result = VoteCastSchema.safeParse({
      ...base,
      type: "VoteCast",
      participantId: "p-1",
      eventName: "OrderPlaced",
      direction: "down",
    });
    expect(result.success).toBe(true);
  });

  it("fails with an invalid direction", () => {
    const result = VoteCastSchema.safeParse({
      ...base,
      type: "VoteCast",
      participantId: "p-1",
      eventName: "OrderPlaced",
      direction: "sideways",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Decomposition Context events (Phase IV — Slice)
// ---------------------------------------------------------------------------

const sampleWorkItem = {
  id: "wi-1",
  title: "Build order placement API",
  description: "REST endpoint for placing orders",
  acceptanceCriteria: ["Returns 201 on success", "Validates required fields"],
  complexity: "M" as const,
  linkedEvents: ["OrderPlaced"],
  dependencies: [],
};

describe("WorkItemCreated", () => {
  it("validates with a complete work item", () => {
    const result = WorkItemCreatedSchema.safeParse({
      ...base,
      type: "WorkItemCreated",
      aggregate: "Order",
      workItem: sampleWorkItem,
    });
    expect(result.success).toBe(true);
  });

  it("fails when workItem is missing", () => {
    const result = WorkItemCreatedSchema.safeParse({
      ...base,
      type: "WorkItemCreated",
      aggregate: "Order",
    });
    expect(result.success).toBe(false);
  });

  it("fails with an invalid complexity value", () => {
    const result = WorkItemCreatedSchema.safeParse({
      ...base,
      type: "WorkItemCreated",
      aggregate: "Order",
      workItem: { ...sampleWorkItem, complexity: "XXL" },
    });
    expect(result.success).toBe(false);
  });
});

describe("DependencySet", () => {
  it("validates with correct data", () => {
    const result = DependencySetSchema.safeParse({
      ...base,
      type: "DependencySet",
      fromItemId: "wi-1",
      toItemId: "wi-2",
    });
    expect(result.success).toBe(true);
  });

  it("fails when toItemId is missing", () => {
    const result = DependencySetSchema.safeParse({
      ...base,
      type: "DependencySet",
      fromItemId: "wi-1",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Draft Context events (Phase V — Agree / authoring)
// ---------------------------------------------------------------------------

const sampleCandidateEventsFile = {
  metadata: {
    role: "backend",
    scope: "Order",
    goal: "Handle order lifecycle",
    generated_at: "2026-02-28T00:00:00.000Z",
    event_count: 1,
    assumption_count: 0,
  },
  domain_events: [
    {
      name: "OrderPlaced",
      aggregate: "Order",
      trigger: "Customer submits order form",
      payload: [{ field: "orderId", type: "string" }],
      integration: { direction: "outbound" as const },
      confidence: "CONFIRMED" as const,
    },
  ],
  boundary_assumptions: [],
};

describe("DraftCreated", () => {
  it("validates with correct data", () => {
    const result = DraftCreatedSchema.safeParse({
      ...base,
      type: "DraftCreated",
      participantId: "p-1",
      draftId: "draft-1",
      content: sampleCandidateEventsFile,
    });
    expect(result.success).toBe(true);
  });

  it("fails when draftId is missing", () => {
    const result = DraftCreatedSchema.safeParse({
      ...base,
      type: "DraftCreated",
      participantId: "p-1",
      content: sampleCandidateEventsFile,
    });
    expect(result.success).toBe(false);
  });
});

describe("DraftPublished", () => {
  it("validates with correct data", () => {
    const result = DraftPublishedSchema.safeParse({
      ...base,
      type: "DraftPublished",
      draftId: "draft-1",
    });
    expect(result.success).toBe(true);
  });

  it("fails when draftId is missing", () => {
    const result = DraftPublishedSchema.safeParse({
      ...base,
      type: "DraftPublished",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Delegation Context events (Phase VI/VII — Build / Ship)
// ---------------------------------------------------------------------------

describe("DelegationChanged", () => {
  it("validates all valid levels", () => {
    for (const level of ["assisted", "semi_autonomous", "autonomous"] as const) {
      const result = DelegationChangedSchema.safeParse({
        ...base,
        type: "DelegationChanged",
        level,
        changedBy: "p-1",
      });
      expect(result.success).toBe(true);
    }
  });

  it("fails with an invalid level", () => {
    const result = DelegationChangedSchema.safeParse({
      ...base,
      type: "DelegationChanged",
      level: "fully_automatic",
      changedBy: "p-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionConfigured", () => {
  it("validates with a partial config delta", () => {
    const result = SessionConfiguredSchema.safeParse({
      ...base,
      type: "SessionConfigured",
      configDelta: { comparison: { sensitivity: "exact" } },
      changedBy: "p-1",
    });
    expect(result.success).toBe(true);
  });

  it("fails when changedBy is missing", () => {
    const result = SessionConfiguredSchema.safeParse({
      ...base,
      type: "SessionConfigured",
      configDelta: {},
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Approval Context events (agent delegation approval loop)
// ---------------------------------------------------------------------------

describe("ApprovalRequested", () => {
  it("validates with required fields and optional reasoning", () => {
    const withReasoning = ApprovalRequestedSchema.safeParse({
      ...base,
      type: "ApprovalRequested",
      agentId: "agent-1",
      action: "Publish draft artifact",
      reasoning: "All conflicts have been resolved",
      expiresAt: "2026-03-01T00:00:00.000Z",
    });
    expect(withReasoning.success).toBe(true);

    const withoutReasoning = ApprovalRequestedSchema.safeParse({
      ...base,
      type: "ApprovalRequested",
      agentId: "agent-1",
      action: "Publish draft artifact",
      expiresAt: "2026-03-01T00:00:00.000Z",
    });
    expect(withoutReasoning.success).toBe(true);
  });

  it("fails when expiresAt is missing", () => {
    const result = ApprovalRequestedSchema.safeParse({
      ...base,
      type: "ApprovalRequested",
      agentId: "agent-1",
      action: "Publish draft artifact",
    });
    expect(result.success).toBe(false);
  });
});

describe("ApprovalDecided", () => {
  it("validates an approved decision", () => {
    const result = ApprovalDecidedSchema.safeParse({
      ...base,
      type: "ApprovalDecided",
      approvalId: "appr-1",
      decision: "approved",
      decidedBy: "p-1",
    });
    expect(result.success).toBe(true);
  });

  it("validates a rejected decision", () => {
    const result = ApprovalDecidedSchema.safeParse({
      ...base,
      type: "ApprovalDecided",
      approvalId: "appr-1",
      decision: "rejected",
      decidedBy: "p-1",
    });
    expect(result.success).toBe(true);
  });

  it("fails with an invalid decision value", () => {
    const result = ApprovalDecidedSchema.safeParse({
      ...base,
      type: "ApprovalDecided",
      approvalId: "appr-1",
      decision: "maybe",
      decidedBy: "p-1",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

describe("DomainEventSchema discriminated union", () => {
  it("correctly identifies SessionCreated", () => {
    const result = DomainEventSchema.safeParse({
      ...base,
      type: "SessionCreated",
      creatorName: "Alice",
      creatorId: "user-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("SessionCreated");
    }
  });

  it("correctly identifies DriftDetected", () => {
    const result = DomainEventSchema.safeParse({
      ...base,
      type: "DriftDetected",
      contractId: "ctr-1",
      driftDescription: "Schema changed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("DriftDetected");
    }
  });

  it("rejects an unknown type field", () => {
    const result = DomainEventSchema.safeParse({
      ...base,
      type: "UnknownEvent",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing type field", () => {
    const result = DomainEventSchema.safeParse({
      ...base,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DOMAIN_EVENT_TYPES array
// ---------------------------------------------------------------------------

describe("DOMAIN_EVENT_TYPES", () => {
  const expectedTypes = [
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
  ];

  it("contains all 31 event types", () => {
    expect(DOMAIN_EVENT_TYPES).toHaveLength(31);
  });

  it("contains every expected type", () => {
    for (const t of expectedTypes) {
      expect(DOMAIN_EVENT_TYPES).toContain(t);
    }
  });

  it("has no duplicate types", () => {
    const unique = new Set(DOMAIN_EVENT_TYPES);
    expect(unique.size).toBe(DOMAIN_EVENT_TYPES.length);
  });
});
