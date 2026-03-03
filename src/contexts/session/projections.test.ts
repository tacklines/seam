import { describe, it, expect, beforeEach } from "vitest";
import { EventStore } from "./event-store.js";
import { DomainEvent } from "./domain-events.js";
import {
  SessionDashboardProjection,
  ArtifactTimelineProjection,
  ConflictTrackerProjection,
  AgreementProgressProjection,
  ProtocolStateProjection,
  ProjectionEngine,
} from "./projections.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SESSION = "SESSION-001";

function evt<T extends DomainEvent>(fields: T): T {
  return fields;
}

const sessionCreated = evt<DomainEvent>({
  eventId: "e-01",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:00:00.000Z",
  type: "SessionCreated",
  creatorName: "Alice",
  creatorId: "user-alice",
});

const participantJoined = evt<DomainEvent>({
  eventId: "e-02",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:01:00.000Z",
  type: "ParticipantJoined",
  participantId: "p-bob",
  participantName: "Bob",
  participantType: "human",
});

const participantLeft = evt<DomainEvent>({
  eventId: "e-03",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:05:00.000Z",
  type: "ParticipantLeft",
  participantId: "p-bob",
});

const sessionPaused = evt<DomainEvent>({
  eventId: "e-04",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:10:00.000Z",
  type: "SessionPaused",
  reason: "Break time",
});

const sessionResumed = evt<DomainEvent>({
  eventId: "e-05",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:15:00.000Z",
  type: "SessionResumed",
});

const sessionClosed = evt<DomainEvent>({
  eventId: "e-06",
  sessionCode: SESSION,
  timestamp: "2026-02-28T11:00:00.000Z",
  type: "SessionClosed",
  reason: "All done",
});

const artifactSubmitted = evt<DomainEvent>({
  eventId: "e-10",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:20:00.000Z",
  type: "ArtifactSubmitted",
  artifactId: "art-1",
  participantId: "p-bob",
  fileName: "alice-prep.yaml",
  artifactType: "candidate-events",
  version: 1,
});

const artifactSubmittedV2 = evt<DomainEvent>({
  eventId: "e-11",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:25:00.000Z",
  type: "ArtifactSubmitted",
  artifactId: "art-2",
  participantId: "p-bob",
  fileName: "bob-prep.yaml",
  artifactType: "candidate-events",
  version: 1,
});

const artifactValidationFailed = evt<DomainEvent>({
  eventId: "e-12",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:22:00.000Z",
  type: "ArtifactValidationFailed",
  artifactId: "art-bad",
  participantId: "p-bob",
  fileName: "bad-prep.yaml",
  errors: ["Missing required field: events", "Invalid version"],
});

const comparisonCompleted = evt<DomainEvent>({
  eventId: "e-20",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:30:00.000Z",
  type: "ComparisonCompleted",
  comparisonId: "cmp-1",
  artifactIds: ["art-1", "art-2"],
  overlapCount: 3,
  gapCount: 1,
});

const conflictsDetected = evt<DomainEvent>({
  eventId: "e-21",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:31:00.000Z",
  type: "ConflictsDetected",
  comparisonId: "cmp-1",
  conflicts: [
    { label: "ownership-order", description: "Who owns the Order aggregate?" },
    { label: "payment-flow", description: "Payment flow naming mismatch" },
  ],
});

const resolutionRecorded = evt<DomainEvent>({
  eventId: "e-30",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:40:00.000Z",
  type: "ResolutionRecorded",
  overlapLabel: "ownership-order",
  resolution: "Order belongs to Fulfillment context",
  chosenApproach: "merge",
  resolvedBy: ["Alice", "Bob"],
});

const ownershipAssigned = evt<DomainEvent>({
  eventId: "e-31",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:41:00.000Z",
  type: "OwnershipAssigned",
  aggregate: "Order",
  ownerRole: "fulfillment-team",
  assignedBy: "Alice",
});

const itemFlagged = evt<DomainEvent>({
  eventId: "e-32",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:42:00.000Z",
  type: "ItemFlagged",
  description: "Payment gateway integration unclear",
  flaggedBy: "Bob",
  relatedOverlap: "payment-flow",
});

const unrelatedEvent = evt<DomainEvent>({
  eventId: "e-99",
  sessionCode: SESSION,
  timestamp: "2026-02-28T10:50:00.000Z",
  type: "ContractGenerated",
  contractId: "contract-1",
  version: 1,
});

// ---------------------------------------------------------------------------
// SessionDashboardProjection
// ---------------------------------------------------------------------------

describe("SessionDashboardProjection", () => {
  describe("Given an empty projection", () => {
    it("When reset is called, Then state is empty", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      proj.reset();
      const state = proj.getState();
      expect(state.sessionCode).toBe("");
      expect(state.participants).toEqual([]);
    });
  });

  describe("Given a SessionCreated event", () => {
    it("When applied, Then state reflects session metadata", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      const state = proj.getState();
      expect(state.sessionCode).toBe(SESSION);
      expect(state.creatorName).toBe("Alice");
      expect(state.creatorId).toBe("user-alice");
      expect(state.status).toBe("active");
      expect(state.createdAt).toBe("2026-02-28T10:00:00.000Z");
      expect(state.closedAt).toBeUndefined();
    });
  });

  describe("Given SessionCreated followed by ParticipantJoined", () => {
    it("When applied, Then participant appears in list with correct fields", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      proj.apply(participantJoined);
      const state = proj.getState();
      expect(state.participants).toHaveLength(1);
      expect(state.participants[0]).toMatchObject({
        id: "p-bob",
        name: "Bob",
        type: "human",
        joinedAt: "2026-02-28T10:01:00.000Z",
      });
      expect(state.participants[0].leftAt).toBeUndefined();
    });
  });

  describe("Given a participant who has left", () => {
    it("When ParticipantLeft applied, Then leftAt is stamped", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      proj.apply(participantJoined);
      proj.apply(participantLeft);
      const state = proj.getState();
      expect(state.participants[0].leftAt).toBe("2026-02-28T10:05:00.000Z");
    });
  });

  describe("Given a SessionPaused event", () => {
    it("When applied, Then status becomes paused", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      proj.apply(sessionPaused);
      expect(proj.getState().status).toBe("paused");
    });
  });

  describe("Given a SessionResumed event after paused", () => {
    it("When applied, Then status becomes active again", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      proj.apply(sessionPaused);
      proj.apply(sessionResumed);
      expect(proj.getState().status).toBe("active");
    });
  });

  describe("Given a SessionClosed event", () => {
    it("When applied, Then status is closed and closedAt is set", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      proj.apply(sessionClosed);
      const state = proj.getState();
      expect(state.status).toBe("closed");
      expect(state.closedAt).toBe("2026-02-28T11:00:00.000Z");
    });
  });

  describe("Given events outside its scope", () => {
    it("When applied, Then state is unchanged", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      const before = proj.getState();
      proj.apply(artifactSubmitted);
      proj.apply(comparisonCompleted);
      proj.apply(unrelatedEvent);
      const after = proj.getState();
      expect(after.status).toBe(before.status);
      expect(after.participants).toEqual(before.participants);
    });
  });

  describe("Given getState", () => {
    it("When the caller mutates the returned participants array, Then internal state is unaffected", () => {
      const proj = new SessionDashboardProjection();
      proj.apply(sessionCreated);
      proj.apply(participantJoined);
      const state = proj.getState();
      state.participants.push({ id: "rogue", name: "Rogue", type: "agent", joinedAt: "now" });
      expect(proj.getState().participants).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// ArtifactTimelineProjection
// ---------------------------------------------------------------------------

describe("ArtifactTimelineProjection", () => {
  describe("Given an empty projection", () => {
    it("When reset is called, Then entries are empty", () => {
      const proj = new ArtifactTimelineProjection();
      proj.apply(artifactSubmitted);
      proj.reset();
      expect(proj.getState().entries).toEqual([]);
    });
  });

  describe("Given an ArtifactSubmitted event", () => {
    it("When applied, Then entry appears with correct fields", () => {
      const proj = new ArtifactTimelineProjection();
      proj.apply(artifactSubmitted);
      const { entries } = proj.getState();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        artifactId: "art-1",
        participantId: "p-bob",
        fileName: "alice-prep.yaml",
        type: "candidate-events",
        version: 1,
        timestamp: "2026-02-28T10:20:00.000Z",
      });
      expect(entries[0].validationErrors).toBeUndefined();
    });
  });

  describe("Given an ArtifactValidationFailed event", () => {
    it("When applied, Then entry appears with validationErrors", () => {
      const proj = new ArtifactTimelineProjection();
      proj.apply(artifactValidationFailed);
      const { entries } = proj.getState();
      expect(entries).toHaveLength(1);
      expect(entries[0].validationErrors).toEqual([
        "Missing required field: events",
        "Invalid version",
      ]);
    });
  });

  describe("Given events arriving out of timestamp order", () => {
    it("When applied, Then entries are sorted by timestamp", () => {
      const proj = new ArtifactTimelineProjection();
      // artifactSubmittedV2 has timestamp 10:25, artifactValidationFailed has 10:22
      proj.apply(artifactSubmittedV2);
      proj.apply(artifactValidationFailed);
      const { entries } = proj.getState();
      expect(entries).toHaveLength(2);
      // validation failure (10:22) should come before submit v2 (10:25)
      expect(entries[0].timestamp).toBe("2026-02-28T10:22:00.000Z");
      expect(entries[1].timestamp).toBe("2026-02-28T10:25:00.000Z");
    });
  });

  describe("Given events outside its scope", () => {
    it("When applied, Then entries are unchanged", () => {
      const proj = new ArtifactTimelineProjection();
      proj.apply(artifactSubmitted);
      const before = proj.getState().entries.length;
      proj.apply(sessionCreated);
      proj.apply(comparisonCompleted);
      expect(proj.getState().entries).toHaveLength(before);
    });
  });
});

// ---------------------------------------------------------------------------
// ConflictTrackerProjection
// ---------------------------------------------------------------------------

describe("ConflictTrackerProjection", () => {
  describe("Given an empty projection", () => {
    it("When reset is called, Then comparisons and conflicts are empty", () => {
      const proj = new ConflictTrackerProjection();
      proj.apply(comparisonCompleted);
      proj.reset();
      const state = proj.getState();
      expect(state.comparisons).toEqual([]);
      expect(state.conflicts).toEqual([]);
    });
  });

  describe("Given a ComparisonCompleted event", () => {
    it("When applied, Then comparison entry is recorded", () => {
      const proj = new ConflictTrackerProjection();
      proj.apply(comparisonCompleted);
      const { comparisons } = proj.getState();
      expect(comparisons).toHaveLength(1);
      expect(comparisons[0]).toMatchObject({
        comparisonId: "cmp-1",
        overlapCount: 3,
        gapCount: 1,
      });
    });
  });

  describe("Given a ConflictsDetected event", () => {
    it("When applied, Then conflicts are added with status open", () => {
      const proj = new ConflictTrackerProjection();
      proj.apply(conflictsDetected);
      const { conflicts } = proj.getState();
      expect(conflicts).toHaveLength(2);
      expect(conflicts[0]).toMatchObject({
        label: "ownership-order",
        status: "open",
      });
      expect(conflicts[1]).toMatchObject({
        label: "payment-flow",
        status: "open",
      });
    });
  });

  describe("Given conflicts detected and then a ResolutionRecorded event", () => {
    it("When applied, Then the matching conflict is marked resolved", () => {
      const proj = new ConflictTrackerProjection();
      proj.apply(conflictsDetected);
      proj.apply(resolutionRecorded);
      const { conflicts } = proj.getState();
      const resolved = conflicts.find((c) => c.label === "ownership-order");
      const open = conflicts.find((c) => c.label === "payment-flow");
      expect(resolved?.status).toBe("resolved");
      expect(resolved?.resolution).toBe("Order belongs to Fulfillment context");
      expect(open?.status).toBe("open");
    });
  });

  describe("Given events outside its scope", () => {
    it("When applied, Then state is unchanged", () => {
      const proj = new ConflictTrackerProjection();
      proj.apply(comparisonCompleted);
      const before = proj.getState().comparisons.length;
      proj.apply(sessionCreated);
      proj.apply(artifactSubmitted);
      expect(proj.getState().comparisons).toHaveLength(before);
    });
  });
});

// ---------------------------------------------------------------------------
// AgreementProgressProjection
// ---------------------------------------------------------------------------

describe("AgreementProgressProjection", () => {
  describe("Given an empty projection", () => {
    it("When reset is called, Then all collections are empty", () => {
      const proj = new AgreementProgressProjection();
      proj.apply(resolutionRecorded);
      proj.reset();
      const state = proj.getState();
      expect(state.resolutions).toEqual([]);
      expect(state.ownership.size).toBe(0);
      expect(state.flags).toEqual([]);
    });
  });

  describe("Given a ResolutionRecorded event", () => {
    it("When applied, Then resolution appears in list", () => {
      const proj = new AgreementProgressProjection();
      proj.apply(resolutionRecorded);
      const { resolutions } = proj.getState();
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0]).toMatchObject({
        overlapLabel: "ownership-order",
        resolution: "Order belongs to Fulfillment context",
        chosenApproach: "merge",
        resolvedBy: ["Alice", "Bob"],
      });
    });
  });

  describe("Given an OwnershipAssigned event", () => {
    it("When applied, Then aggregate is in ownership map", () => {
      const proj = new AgreementProgressProjection();
      proj.apply(ownershipAssigned);
      const { ownership } = proj.getState();
      expect(ownership.get("Order")).toBe("fulfillment-team");
    });
  });

  describe("Given multiple OwnershipAssigned events for the same aggregate", () => {
    it("When applied, Then latest assignment wins", () => {
      const proj = new AgreementProgressProjection();
      proj.apply(ownershipAssigned);
      const reassigned = evt<DomainEvent>({
        eventId: "e-33",
        sessionCode: SESSION,
        timestamp: "2026-02-28T10:45:00.000Z",
        type: "OwnershipAssigned",
        aggregate: "Order",
        ownerRole: "ordering-team",
        assignedBy: "Bob",
      });
      proj.apply(reassigned);
      expect(proj.getState().ownership.get("Order")).toBe("ordering-team");
    });
  });

  describe("Given an ItemFlagged event with relatedOverlap", () => {
    it("When applied, Then flag appears with relatedOverlap", () => {
      const proj = new AgreementProgressProjection();
      proj.apply(itemFlagged);
      const { flags } = proj.getState();
      expect(flags).toHaveLength(1);
      expect(flags[0]).toMatchObject({
        description: "Payment gateway integration unclear",
        flaggedBy: "Bob",
        relatedOverlap: "payment-flow",
      });
    });
  });

  describe("Given an ItemFlagged event without relatedOverlap", () => {
    it("When applied, Then flag has no relatedOverlap field", () => {
      const proj = new AgreementProgressProjection();
      const flagNoOverlap = evt<DomainEvent>({
        eventId: "e-40",
        sessionCode: SESSION,
        timestamp: "2026-02-28T10:43:00.000Z",
        type: "ItemFlagged",
        description: "General concern",
        flaggedBy: "Alice",
      });
      proj.apply(flagNoOverlap);
      const { flags } = proj.getState();
      expect(flags[0].relatedOverlap).toBeUndefined();
    });
  });

  describe("Given events outside its scope", () => {
    it("When applied, Then resolutions and flags are unchanged", () => {
      const proj = new AgreementProgressProjection();
      proj.apply(resolutionRecorded);
      const before = proj.getState().resolutions.length;
      proj.apply(sessionCreated);
      proj.apply(artifactSubmitted);
      proj.apply(comparisonCompleted);
      expect(proj.getState().resolutions).toHaveLength(before);
    });
  });

  describe("Given getState", () => {
    it("When ownership Map is mutated by caller, Then internal state is unaffected", () => {
      const proj = new AgreementProgressProjection();
      proj.apply(ownershipAssigned);
      const state = proj.getState();
      state.ownership.set("Rogue", "hacker-team");
      expect(proj.getState().ownership.has("Rogue")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// ProtocolStateProjection
// ---------------------------------------------------------------------------

describe("ProtocolStateProjection", () => {
  describe("Given an empty projection", () => {
    it("When reset is called, Then all counters are zero", () => {
      const proj = new ProtocolStateProjection();
      proj.apply(sessionCreated);
      proj.reset();
      const state = proj.getState();
      expect(state.participantCount).toBe(0);
      expect(state.artifactCount).toBe(0);
      expect(state.conflictCount).toBe(0);
      expect(state.resolvedCount).toBe(0);
      expect(state.flagCount).toBe(0);
      expect(state.lastEventAt).toBe("");
    });
  });

  describe("Given a full event sequence", () => {
    let proj: ProtocolStateProjection;

    beforeEach(() => {
      proj = new ProtocolStateProjection();
      proj.apply(sessionCreated);
      proj.apply(participantJoined);
      proj.apply(artifactSubmitted);
      proj.apply(comparisonCompleted);
      proj.apply(conflictsDetected);
      proj.apply(resolutionRecorded);
      proj.apply(itemFlagged);
    });

    it("Then participantCount is 1", () => {
      expect(proj.getState().participantCount).toBe(1);
    });

    it("Then artifactCount is 1", () => {
      expect(proj.getState().artifactCount).toBe(1);
    });

    it("Then conflictCount equals the number of detected conflicts", () => {
      expect(proj.getState().conflictCount).toBe(2);
    });

    it("Then resolvedCount is 1", () => {
      expect(proj.getState().resolvedCount).toBe(1);
    });

    it("Then flagCount is 1", () => {
      expect(proj.getState().flagCount).toBe(1);
    });

    it("Then lastEventAt matches the last event", () => {
      expect(proj.getState().lastEventAt).toBe("2026-02-28T10:42:00.000Z");
    });

    it("Then phase progresses to agreement", () => {
      expect(proj.getState().phase).toBe("agreement");
    });
  });

  describe("Given ParticipantLeft after ParticipantJoined", () => {
    it("When applied, Then participantCount decrements", () => {
      const proj = new ProtocolStateProjection();
      proj.apply(sessionCreated);
      proj.apply(participantJoined);
      proj.apply(participantLeft);
      expect(proj.getState().participantCount).toBe(0);
    });
  });

  describe("Given phase transitions", () => {
    it("When SessionCreated, Then phase is setup", () => {
      const proj = new ProtocolStateProjection();
      proj.apply(sessionCreated);
      expect(proj.getState().phase).toBe("setup");
    });

    it("When ArtifactSubmitted, Then phase is prep", () => {
      const proj = new ProtocolStateProjection();
      proj.apply(sessionCreated);
      proj.apply(artifactSubmitted);
      expect(proj.getState().phase).toBe("prep");
    });

    it("When ComparisonCompleted, Then phase is comparison", () => {
      const proj = new ProtocolStateProjection();
      proj.apply(sessionCreated);
      proj.apply(comparisonCompleted);
      expect(proj.getState().phase).toBe("comparison");
    });

    it("When ContractGenerated, Then phase is contract", () => {
      const proj = new ProtocolStateProjection();
      proj.apply(sessionCreated);
      proj.apply(unrelatedEvent); // ContractGenerated
      expect(proj.getState().phase).toBe("contract");
    });
  });
});

// ---------------------------------------------------------------------------
// ProjectionEngine
// ---------------------------------------------------------------------------

describe("ProjectionEngine", () => {
  describe("Given an engine with registered projections", () => {
    it("When an event is appended to the store, Then the projection receives it via subscription", () => {
      const store = new EventStore();
      const dashboard = new SessionDashboardProjection();
      const engine = new ProjectionEngine(store, { dashboard });

      store.append(SESSION, sessionCreated);
      store.append(SESSION, participantJoined);

      const state = engine.getProjection<ReturnType<SessionDashboardProjection["getState"]>>("dashboard");
      expect(state?.creatorName).toBe("Alice");
      expect(state?.participants).toHaveLength(1);

      engine.dispose();
    });

    it("When rebuild is called, Then projection state is rebuilt from EventStore", () => {
      const store = new EventStore();
      store.append(SESSION, sessionCreated);
      store.append(SESSION, participantJoined);
      store.append(SESSION, sessionPaused);

      const dashboard = new SessionDashboardProjection();
      const engine = new ProjectionEngine(store, { dashboard });
      engine.rebuild(SESSION);

      const state = engine.getProjection<ReturnType<SessionDashboardProjection["getState"]>>("dashboard");
      expect(state?.status).toBe("paused");
      expect(state?.participants).toHaveLength(1);

      engine.dispose();
    });

    it("When rebuild resets projections, Then prior subscription-applied events are cleared", () => {
      const store = new EventStore();
      // append one event before engine creation
      store.append(SESSION, sessionCreated);

      const dashboard = new SessionDashboardProjection();
      const engine = new ProjectionEngine(store, { dashboard });
      // subscription picks up live events
      store.append(SESSION, participantJoined);

      // now rebuild clears state and replays from store (includes both events)
      engine.rebuild(SESSION);
      const state = engine.getProjection<ReturnType<SessionDashboardProjection["getState"]>>("dashboard");
      expect(state?.participants).toHaveLength(1);

      engine.dispose();
    });

    it("When getProjection is called with an unknown name, Then it returns undefined", () => {
      const store = new EventStore();
      const engine = new ProjectionEngine(store, {});
      expect(engine.getProjection("nonexistent")).toBeUndefined();
      engine.dispose();
    });

    it("When dispose is called, Then new events no longer update projections", () => {
      const store = new EventStore();
      const dashboard = new SessionDashboardProjection();
      const engine = new ProjectionEngine(store, { dashboard });

      store.append(SESSION, sessionCreated);
      engine.dispose();
      store.append(SESSION, participantJoined);

      const state = engine.getProjection<ReturnType<SessionDashboardProjection["getState"]>>("dashboard");
      // participant joined after dispose — should not be in projection
      expect(state?.participants).toHaveLength(0);
    });
  });

  describe("Given multiple projections registered", () => {
    it("When events are appended, Then all projections are updated", () => {
      const store = new EventStore();
      const dashboard = new SessionDashboardProjection();
      const protocol = new ProtocolStateProjection();
      const engine = new ProjectionEngine(store, { dashboard, protocol });

      store.append(SESSION, sessionCreated);
      store.append(SESSION, participantJoined);
      store.append(SESSION, artifactSubmitted);

      const dash = engine.getProjection<ReturnType<SessionDashboardProjection["getState"]>>("dashboard");
      const proto = engine.getProjection<ReturnType<ProtocolStateProjection["getState"]>>("protocol");

      expect(dash?.participants).toHaveLength(1);
      expect(proto?.artifactCount).toBe(1);
      expect(proto?.participantCount).toBe(1);

      engine.dispose();
    });
  });
});
