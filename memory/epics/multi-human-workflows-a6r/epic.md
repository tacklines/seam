# Epic: Re-architect platform from prototype to vision

**Epic ID**: multi-human-workflows-a6r
**Created**: 2026-02-28
**Source**: /blossom
**Goal**: Re-architect the multi-human-workflows project from its current Event Storming prototype into the full platform described in docs/open-collaborative-sessions.docx. The vision: a protocol-native collaboration platform with six bounded contexts (Session, Artifact, Comparison, Agreement, Contract, Protocol Gateway), event sourcing, CQRS projections, multi-schema artifact support, A2A protocol, full provenance chains, auth/security, observability (OTel), and i18n. The current codebase is a successful spike — keep learnings, rebuild architecture. Follow the doc's 4-phase roadmap: Phase 1 (Walking Skeleton), Phase 2 (Core Value), Phase 3 (Formalization), Phase 4 (Intelligence).

## Spike Findings

1. **Create target directory structure for 6 bounded contexts** — Current flat src/ structure doesn't reveal domain. Need src/{session,artifact,comparison,agreement,contract,gateway}/ with index.ts barrels.
   - source: src/ top-level
   - confidence: CONFIRMED
   - priority: P0
   - depends-on: none
   - agent: general-purpose

2. **Define domain event catalog — typed events with validators** — No domain events exist. Need SessionCreated, ParticipantJoined, ArtifactSubmitted, ComparisonCompleted, ConflictsDetected, ResolutionRecorded, ContractGenerated, ComplianceCheckCompleted, DriftDetected as TypeScript discriminated union.
   - source: src/schema/ (no domain-events.ts exists)
   - confidence: CONFIRMED
   - priority: P0
   - depends-on: a6r.14
   - agent: schema-evolve

3. **Build EventStore — append-only event log with replay and projections** — Current persistence is mutable JSON snapshots. Need append-only log with subscribe/replay.
   - source: src/lib/session-persistence.ts
   - confidence: CONFIRMED
   - priority: P0
   - depends-on: a6r.6
   - agent: general-purpose

4. **Refactor SessionStore to emit domain events instead of mutating state** — SessionStore directly mutates Session objects. Each mutation method must emit a domain event instead.
   - source: src/lib/session-store.ts
   - confidence: CONFIRMED
   - priority: P0
   - depends-on: a6r.7
   - agent: general-purpose

5. **Replace ad-hoc SSE with domain event streaming** — SSE pushes ad-hoc event shapes. Replace with domain event shapes from catalog.
   - source: src/server/http.ts:47-54
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: a6r.8
   - agent: general-purpose

6. **Define CQRS projection interfaces and implementations** — No projections exist. Need SessionDashboard, ArtifactTimeline, ConflictTracker, ProvenanceGraph, ProtocolState.
   - source: (new: src/session/projections/)
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: a6r.7
   - agent: general-purpose

7. **Add temporal query and late-join event replay capabilities** — No temporal queries. Need events-at-time queries and replay for participants joining mid-session.
   - source: src/lib/session-store.ts (no temporal support)
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: a6r.7
   - agent: general-purpose

8. **Rebuild frontend components for domain-feature architecture** — 13 Lit components in flat structure need reorganization by domain feature.
   - source: src/components/ (15 files, flat)
   - confidence: CONFIRMED
   - priority: P0
   - depends-on: a6r.31, a6r.20
   - agent: lit-component

9. **Remove explicit persistSessions() calls — persistence via event subscription** — 7 explicit persistSessions() calls in http.ts. Replace with event-based persistence. Also absorbs "move persistence I/O out of lib/".
   - source: src/server/http.ts:78,103,147,162,192,220,251
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: a6r.8
   - agent: general-purpose

10. **Extract Agreement Context from SessionStore** — jam_resolve, jam_assign, jam_flag, jam_export all live in SessionStore. Extract to separate AgreementService.
    - source: src/lib/session-store.ts
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.8
    - agent: general-purpose

11. **Build Protocol Gateway Anti-Corruption Layer** — MCP and HTTP both call SessionStore directly. Need single gateway layer.
    - source: src/server/mcp.ts, src/server/http.ts
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.15, a6r.14
    - agent: general-purpose

12. **Add explicit Session state machine (Active/Paused/Closed)** — No state machine. Sessions have no lifecycle states.
    - source: src/lib/session-store.ts
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.8
    - agent: general-purpose

13. **Add Artifact versioning and provenance tracking** — Artifacts are mutable. Need immutable versions with provenance chains.
    - source: src/lib/session-store.ts (submitYaml mutates)
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.6
    - agent: general-purpose

14. **Create Contract Context service** — No contract formalization. Need diffing, compliance, drift detection.
    - source: (new: src/contract/)
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.15, a6r.18
    - agent: general-purpose

15. **Decouple Comparison Context from LoadedFile shape** — comparison.ts tightly coupled to LoadedFile. Need adapter layer.
    - source: src/lib/comparison.ts
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.14
    - agent: general-purpose

16. **Rename MCP tools to verb_noun domain language pattern** — 14/17 tools violate naming convention.
    - source: src/server/mcp.ts
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.16
    - agent: general-purpose

17. **Add missing MCP tools: compare_artifacts, check_compliance, send_message** — 3+ tools missing from current implementation.
    - source: src/server/mcp.ts
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.16
    - agent: general-purpose

18. **Replace SSE with WebSocket for real-time domain event streaming** — SSE is half-duplex. Need full-duplex WebSocket.
    - source: src/server/http.ts:270-313
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.9
    - agent: general-purpose

19. **Implement auth model** — No auth exists. Need OAuth2 for humans, bearer for agents, mTLS for A2A.
    - source: (new: src/gateway/auth/)
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.16
    - agent: general-purpose

20. **Implement A2A Agent Card and task protocol** — No A2A support. Need Agent Card + task protocol for cross-org collaboration.
    - source: (new: src/gateway/a2a/)
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.25
    - agent: general-purpose

21. **Enforce idempotency across all protocol operations** — No idempotency keys. Need content-hash derived keys.
    - source: src/server/mcp.ts, src/server/http.ts
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.16
    - agent: general-purpose

22. **Build agreement-capture UI** — No resolution recorder, ownership grid, or flag manager components.
    - source: (new: src/components/agreement/)
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.15, a6r.12
    - agent: lit-component

23. **Externalize all hardcoded UI strings — i18n infrastructure** — 40+ hardcoded strings across components.
    - source: src/components/ (all files)
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.12
    - agent: lit-component

24. **Add keyboard navigation, ARIA labels, and aria-live regions** — Only 5/15 components have any a11y attributes.
    - source: src/components/ (all files)
    - confidence: CONFIRMED
    - priority: P1
    - depends-on: a6r.12
    - agent: lit-component

25. **Extract business logic from components into Lit reactive controllers** — Business logic mixed into render methods.
    - source: src/components/ (all files)
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.34
    - agent: lit-component

26. **Build contract-viewer UI** — No contract display, diffing, or provenance explorer components.
    - source: (new: src/components/contract/)
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.19, a6r.12
    - agent: lit-component

27. **Build participant-registry component** — No persistent sidebar showing participants, capabilities, status.
    - source: (new: src/components/session/)
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.12
    - agent: lit-component

28. **Lift session state from SessionLobby to app-level store** — Session state scoped to SessionLobby component, not accessible app-wide.
    - source: src/components/session-lobby.ts, src/state/app-state.ts
    - confidence: CONFIRMED
    - priority: P2
    - depends-on: a6r.8
    - agent: lit-component

## Priority Order

1. a6r.14 — Create target directory structure (P0)
2. a6r.6 — Define domain event catalog (P0)
3. a6r.7 — Build EventStore (P0)
4. a6r.8 — Refactor SessionStore to emit events (P0)
5. a6r.20 — Decouple Comparison from LoadedFile (P1)
6. a6r.10 — CQRS projection interfaces (P1)
7. a6r.9 — Replace ad-hoc SSE with domain events (P1)
8. a6r.13 — Remove persistSessions() calls (P1)
9. a6r.15 — Extract Agreement Context (P1)
10. a6r.34 — Lift session state to app store (P2)
11. a6r.18 — Artifact versioning + provenance (P2)
12. a6r.17 — Session state machine (P2)
13. a6r.16 — Protocol Gateway ACL (P1)
14. a6r.31 — Extract controllers (P2)
15. a6r.24 — WebSocket (P1)
16. a6r.19 — Contract Context service (P2)
17. a6r.12 — Rebuild frontend components (P0)
18. a6r.22 — Rename MCP tools (P1)
19. a6r.23 — Missing MCP tools (P1)
20. a6r.25 — Auth model (P1)
21. a6r.27 — Idempotency (P1)
22. a6r.11 — Temporal queries (P2)
23. a6r.28 — Agreement UI (P1)
24. a6r.30 — Accessibility (P1)
25. a6r.29 — i18n (P2)
26. a6r.26 — A2A protocol (P2)
27. a6r.32 — Contract viewer UI (P2)
28. a6r.33 — Participant registry (P2)

## Task IDs

| BD ID | Title | Priority | Status | Assigned Agent |
|-------|-------|----------|--------|----------------|
| a6r.14 | Create target directory structure | P0 | open | general-purpose |
| a6r.6 | Define domain event catalog | P0 | open | schema-evolve |
| a6r.7 | Build EventStore | P0 | open | general-purpose |
| a6r.8 | Refactor SessionStore to emit events | P0 | open | general-purpose |
| a6r.12 | Rebuild frontend components | P0 | open | lit-component |
| a6r.9 | Replace ad-hoc SSE with domain events | P1 | open | general-purpose |
| a6r.10 | CQRS projection interfaces | P1 | open | general-purpose |
| a6r.13 | Remove persistSessions() calls | P1 | open | general-purpose |
| a6r.15 | Extract Agreement Context | P1 | open | general-purpose |
| a6r.16 | Protocol Gateway ACL | P1 | open | general-purpose |
| a6r.20 | Decouple Comparison from LoadedFile | P1 | open | general-purpose |
| a6r.22 | Rename MCP tools | P1 | open | general-purpose |
| a6r.23 | Missing MCP tools | P1 | open | general-purpose |
| a6r.24 | WebSocket | P1 | open | general-purpose |
| a6r.25 | Auth model | P1 | open | general-purpose |
| a6r.27 | Idempotency | P1 | open | general-purpose |
| a6r.28 | Agreement UI | P1 | open | lit-component |
| a6r.30 | Accessibility | P1 | open | lit-component |
| a6r.11 | Temporal queries | P2 | open | general-purpose |
| a6r.17 | Session state machine | P2 | open | general-purpose |
| a6r.18 | Artifact versioning + provenance | P2 | open | general-purpose |
| a6r.19 | Contract Context service | P2 | open | general-purpose |
| a6r.26 | A2A Agent Card | P2 | open | general-purpose |
| a6r.29 | i18n infrastructure | P2 | open | lit-component |
| a6r.31 | Extract reactive controllers | P2 | open | lit-component |
| a6r.32 | Contract viewer UI | P2 | open | lit-component |
| a6r.33 | Participant registry | P2 | open | lit-component |
| a6r.34 | Lift session state to app store | P2 | open | lit-component |

## Critical Path

a6r.14 → a6r.6 → a6r.7 → a6r.8 → a6r.15 → a6r.16 → a6r.25 → a6r.26

Secondary critical path (frontend):
a6r.14 → a6r.6 → a6r.7 → a6r.8 → a6r.34 → a6r.31 → a6r.12 → a6r.28/29/30/32/33

## Parallel Opportunities

- **Wave 1**: a6r.14 (directory structure) is the only starter — do first
- **Wave 2**: a6r.6 (events) + a6r.20 (comparison decoupling) can run in parallel
- **Wave 3**: a6r.7 (EventStore) + a6r.18 (artifact versioning) can run in parallel
- **Wave 4**: a6r.8 (refactor SessionStore) + a6r.10 (projections) + a6r.11 (temporal) can run in parallel
- **Wave 5**: a6r.9 + a6r.13 + a6r.15 + a6r.17 + a6r.34 — 5 tasks in parallel
- **Wave 6**: a6r.16 + a6r.19 + a6r.24 + a6r.31 — 4 tasks in parallel
- **Wave 7**: a6r.12 + a6r.22 + a6r.23 + a6r.25 + a6r.27 — 5 tasks in parallel
- **Wave 8**: a6r.26 + a6r.28 + a6r.29 + a6r.30 + a6r.32 + a6r.33 — 6 tasks in parallel
