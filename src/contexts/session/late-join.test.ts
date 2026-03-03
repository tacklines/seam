import { describe, it, expect } from "vitest";
import { buildLateJoinPayload } from "./late-join.js";
import { DomainEvent } from "./domain-events.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeEvent(
  type: DomainEvent["type"],
  timestamp: string,
  overrides: Partial<DomainEvent> = {}
): DomainEvent {
  const base = {
    eventId: `evt-${timestamp}`,
    sessionCode: "ABC123",
    timestamp,
    type,
  };

  if (type === "SessionCreated") {
    return { ...base, type, creatorName: "Alice", creatorId: "user-1", ...overrides } as DomainEvent;
  }
  if (type === "ParticipantJoined") {
    return {
      ...base,
      type,
      participantId: "p-1",
      participantName: "Bob",
      participantType: "human",
      ...overrides,
    } as DomainEvent;
  }
  if (type === "SessionClosed") {
    return { ...base, type, reason: "Done", ...overrides } as DomainEvent;
  }
  // ArtifactSubmitted
  return {
    ...base,
    type: "ArtifactSubmitted",
    artifactId: "art-1",
    participantId: "p-1",
    fileName: "file.yaml",
    artifactType: "candidate-events",
    version: 1,
    ...overrides,
  } as DomainEvent;
}

const T1 = "2026-02-28T10:00:00.000Z";
const T2 = "2026-02-28T10:01:00.000Z";
const T3 = "2026-02-28T10:02:00.000Z";
const T4 = "2026-02-28T10:03:00.000Z";
const T5 = "2026-02-28T10:04:00.000Z";

function makeEvents(): DomainEvent[] {
  return [
    makeEvent("SessionCreated", T1, { eventId: "evt-1" }),
    makeEvent("ParticipantJoined", T2, { eventId: "evt-2" }),
    makeEvent("ArtifactSubmitted", T3, { eventId: "evt-3" }),
    makeEvent("ParticipantJoined", T4, { eventId: "evt-4", participantId: "p-2", participantName: "Carol" }),
    makeEvent("SessionClosed", T5, { eventId: "evt-5" }),
  ];
}

// ---------------------------------------------------------------------------
// No options — returns all events
// ---------------------------------------------------------------------------

describe("Given a full event array and no options", () => {
  it("When buildLateJoinPayload is called, Then it returns all events", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events);
    expect(result.events).toHaveLength(5);
    expect(result.totalCount).toBe(5);
    expect(result.truncated).toBe(false);
  });

  it("When buildLateJoinPayload is called with undefined options, Then it returns all events", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, undefined);
    expect(result.events).toHaveLength(5);
    expect(result.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// since filter
// ---------------------------------------------------------------------------

describe("Given a since option", () => {
  it("When since matches the first event's timestamp, Then it returns the 4 subsequent events", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { since: T1 });
    expect(result.events).toHaveLength(4);
    expect(result.totalCount).toBe(4);
    expect(result.truncated).toBe(false);
    expect(result.events[0].timestamp).toBe(T2);
  });

  it("When since is before all events, Then it returns all events", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { since: "2026-02-28T09:00:00.000Z" });
    expect(result.events).toHaveLength(5);
    expect(result.truncated).toBe(false);
  });

  it("When since is after all events, Then it returns an empty array", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { since: "2026-02-28T12:00:00.000Z" });
    expect(result.events).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("When since equals the last event's timestamp, Then it returns an empty array (strict greater-than)", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { since: T5 });
    expect(result.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// maxEvents truncation
// ---------------------------------------------------------------------------

describe("Given a maxEvents option", () => {
  it("When maxEvents is less than the total count, Then it returns the most recent N events and truncated is true", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { maxEvents: 3 });
    expect(result.events).toHaveLength(3);
    expect(result.totalCount).toBe(5);
    expect(result.truncated).toBe(true);
    // should be the 3 most recent
    expect(result.events.map((e) => e.timestamp)).toEqual([T3, T4, T5]);
  });

  it("When maxEvents equals the total count, Then truncated is false", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { maxEvents: 5 });
    expect(result.events).toHaveLength(5);
    expect(result.truncated).toBe(false);
  });

  it("When maxEvents exceeds the total count, Then all events are returned and truncated is false", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { maxEvents: 100 });
    expect(result.events).toHaveLength(5);
    expect(result.truncated).toBe(false);
  });

  it("When maxEvents is 1, Then only the single most recent event is returned", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { maxEvents: 1 });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].timestamp).toBe(T5);
    expect(result.truncated).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// since + maxEvents combined
// ---------------------------------------------------------------------------

describe("Given both since and maxEvents options", () => {
  it("When since filters first and maxEvents truncates the result, Then truncated is true", () => {
    // after T1, we have 4 events; limit to 2 most recent
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { since: T1, maxEvents: 2 });
    expect(result.events).toHaveLength(2);
    expect(result.totalCount).toBe(4);
    expect(result.truncated).toBe(true);
    expect(result.events.map((e) => e.timestamp)).toEqual([T4, T5]);
  });

  it("When since produces fewer events than maxEvents, Then truncated is false", () => {
    // after T3, we have 2 events; limit is 5 — no truncation
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { since: T3, maxEvents: 5 });
    expect(result.events).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  it("When since filters out all events, Then truncated is false regardless of maxEvents", () => {
    const events = makeEvents();
    const result = buildLateJoinPayload(events, { since: "2026-02-28T12:00:00.000Z", maxEvents: 3 });
    expect(result.events).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Empty events array
// ---------------------------------------------------------------------------

describe("Given an empty events array", () => {
  it("When called with no options, Then it returns empty payload without truncation", () => {
    const result = buildLateJoinPayload([]);
    expect(result.events).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("When called with since, Then it returns empty payload without truncation", () => {
    const result = buildLateJoinPayload([], { since: T1 });
    expect(result.events).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });

  it("When called with maxEvents, Then it returns empty payload without truncation", () => {
    const result = buildLateJoinPayload([], { maxEvents: 10 });
    expect(result.events).toHaveLength(0);
    expect(result.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Input array is not mutated
// ---------------------------------------------------------------------------

describe("Given an input events array", () => {
  it("When buildLateJoinPayload is called, Then the original array is not mutated", () => {
    const events = makeEvents();
    const originalLength = events.length;
    buildLateJoinPayload(events, { maxEvents: 2 });
    expect(events).toHaveLength(originalLength);
  });
});
