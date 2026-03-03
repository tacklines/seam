# Epic: Requirements-Driven Funnel

**Epic ID**: multi-human-workflows-o1q9
**Created**: 2026-03-03
**Source**: /blossom
**Goal**: Design and implement a requirements-driven input funnel where plain-language requirements are the entry point that derives domain events, assumptions, and contracts automatically.

## Design Vision

### The Funnel

```
"We need offline support"           ← anyone can say this (Requirement)
  → platform suggests events        ← rigor emerges automatically (Derivation)
    → participants refine/negotiate  ← expertise adds precision (Refinement)
      → contracts formalize          ← machine-readable output (Formalization)
```

### Core Insight

The current Spark Canvas asks users to think in domain events — "What happened? To what? Triggered by?" This is powerful for DDD practitioners but fails the Technologically Inept Test for product managers, designers, and business stakeholders.

Requirements are the natural language of collaboration. Everyone knows how to say "We need X." The platform's job is to derive the technical rigor from that plain-language input, then let participants with expertise refine it.

### How It Fits the Existing Model

Requirements don't replace events — they **precede** them. The funnel maps onto the existing phase model:

| Funnel Stage | Phase | What Happens |
|-------------|-------|-------------|
| State requirement | **Spark** | Participant types "We need offline support" |
| Derive events | **Spark → Explore** | Platform suggests: `DataSyncRequested`, `OfflineCacheCreated`, `ConflictDetected`, `SyncCompleted` |
| Refine events | **Explore** | Participant reviews, edits, adds assumptions |
| Negotiate | **Agree** | Multiple participants' requirements overlap; negotiate contracts |
| Formalize | **Build** | Agreed events become machine-readable contracts |

The requirement is the *why*. The events are the *what*. The contract is the *how*.

---

## Data Model

### New Type: `Requirement`

```typescript
interface Requirement {
  id: string;                    // unique ID
  statement: string;             // "We need offline support"
  authorId: string;              // participant who stated it
  createdAt: string;             // ISO timestamp
  priority?: PriorityTier;       // optional MoSCoW tier
  tags?: string[];               // optional labels for grouping
  derivedEvents: string[];       // event names derived from this requirement
  derivedAssumptions: string[];  // assumption IDs derived from this requirement
  status: RequirementStatus;
}

type RequirementStatus = 'draft' | 'active' | 'fulfilled' | 'deferred';
```

### Provenance Chain

Every derived event gets a `sourceRequirement` field linking back to the requirement that spawned it:

```typescript
// Extension to DomainEvent
interface DomainEvent {
  // ... existing fields ...
  sourceRequirements?: string[];  // Requirement IDs that drove this event
}
```

This enables traceability: from contract → event → requirement → plain English.

### Session Extension

```typescript
interface Session {
  // ... existing fields ...
  requirements: Requirement[];
}
```

---

## UI Design

### Requirements Input (Spark Phase)

The Spark Canvas gets a **new entry mode**: Requirements Mode.

**Toggle in canvas header**: `Events | Requirements`

When in Requirements mode, the canvas becomes a simple list:

```
┌─────────────────────────────────────────────────┐
│  What does your system need to do?              │
│                                                 │
│  1. We need offline support                 [×] │
│  2. Users should be able to share documents [×] │
│  3. We need real-time notifications         [×] │
│  4. _Type a new requirement..._                 │
│                                                 │
│  [Derive Events]                                │
└─────────────────────────────────────────────────┘
```

Rules:
- Each line is a plain English sentence
- No structured fields — just text
- Enter key adds a new line
- The "Derive Events" button triggers event suggestion
- This is the **lowest-friction entry point** in the entire system

### Derivation Review (Spark → Explore transition)

When "Derive Events" is clicked, the platform:
1. Analyzes each requirement
2. Suggests domain events (using enhanced `suggest_events` logic)
3. Presents a review panel:

```
┌─────────────────────────────────────────────────┐
│  "We need offline support"                      │
│  ├── DataSyncRequested       [✓] [edit] [×]    │
│  ├── OfflineCacheCreated     [✓] [edit] [×]    │
│  ├── ConflictDetected        [✓] [edit] [×]    │
│  └── SyncCompleted           [✓] [edit] [×]    │
│                                                 │
│  "Users should share documents"                 │
│  ├── DocumentShared          [✓] [edit] [×]    │
│  ├── SharePermissionGranted  [✓] [edit] [×]    │
│  └── DocumentAccessRevoked   [✓] [edit] [×]    │
│                                                 │
│  [Accept All]  [Accept Selected]  [Edit More]   │
└─────────────────────────────────────────────────┘
```

Each suggested event:
- Is pre-checked (accepted by default)
- Can be edited (opens the event editor with fields pre-filled)
- Can be dismissed (unchecked)
- Shows confidence level as a subtle badge

### Requirements Panel (persistent, sidebar)

After submission, requirements appear in a persistent sidebar panel:

```
Requirements (3)
├── ✅ We need offline support (4 events)
├── ✅ Users should share documents (3 events)
└── ⬜ Real-time notifications (0 events — needs derivation)
```

This provides:
- **Traceability**: click a requirement to highlight its derived events in the canvas/flow diagram
- **Coverage**: amber indicator when a requirement has no derived events
- **Context**: hovering shows the full requirement text

### Change Sets (Future)

A Change Set groups related requirements:

```
Change Set: "Mobile Experience v2"
├── We need offline support
├── Push notifications for key events
└── Responsive layouts for all views
```

Change sets enable:
- Batch derivation (derive events for all requirements in a set)
- Scope tracking (how much of this change set is covered by events/contracts?)
- Release planning (which change set ships in v2.1?)

This is explicitly deferred — the requirements primitive must land first.

---

## MCP Tool Surface

| Tool | Input | Output | Phase |
|------|-------|--------|-------|
| `submit_requirement` | `{sessionCode, participantId, statement, tags?}` | `{requirementId}` | Spark |
| `derive_events` | `{sessionCode, requirementIds}` | `{suggestions: [{requirementId, events: DomainEvent[]}]}` | Spark→Explore |
| `accept_derived_events` | `{sessionCode, participantId, requirementId, eventNames}` | `{submittedCount}` | Explore |
| `list_requirements` | `{sessionCode}` | `{requirements: Requirement[]}` | Any |
| `get_requirement_coverage` | `{sessionCode, requirementId?}` | `{coverage: [{reqId, eventCount, fulfilled}]}` | Any |

---

## Implementation Tasks

### Layer 1: Schema & Types (no dependencies)
1. Add `Requirement` type to `src/schema/types.ts`
2. Add `sourceRequirements` optional field to `DomainEvent` type
3. Add `requirements` field to Session interface in session-store

### Layer 2: Derivation Engine (depends on L1)
4. Enhance `src/lib/event-suggestions.ts` with requirement-to-event derivation
   - Current: keyword matching against 5 domain patterns
   - New: NLP-style extraction of verbs/nouns → event patterns
   - New: Assumption derivation (cross-boundary implications)
5. Add derivation provenance tracking in `src/lib/requirement-derivation.ts`

### Layer 3: Session Store (depends on L1)
6. Extend SessionStore with requirement CRUD operations
7. Wire requirement events to EventStore (RequirementSubmitted, EventsDerived, EventsAccepted)

### Layer 4: MCP Tools (depends on L2, L3)
8. Implement `submit_requirement` tool
9. Implement `derive_events` tool (enhanced)
10. Implement `accept_derived_events` tool
11. Implement `list_requirements` and `get_requirement_coverage` tools

### Layer 5: UI Components (depends on L3, L4)
12. Requirements input mode for spark-canvas
13. Derivation review panel component
14. Requirements sidebar panel
15. Traceability highlights (click requirement → highlight events)

### Layer 6: Integration (depends on all)
16. Wire requirement coverage into completeness checks
17. Wire requirement provenance into provenance-explorer
18. Update suggestion bar messages for requirement-based workflows

---

## Priority Order

P0: Types + Session store extension (L1, L3) — foundation
P1: Derivation engine (L2) — the core value proposition
P1: MCP tools (L4) — agent access
P2: UI components (L5) — human access
P3: Integration with existing phases (L6) — polish

## Critical Path

Types → Session Store → Derivation Engine → MCP Tools → UI Components → Integration

## Parallel Opportunities

- L1 (types) and L2 (derivation engine logic) can be developed in parallel
- L4 (MCP tools) and L5 (UI components) can be developed in parallel once L2+L3 are done
- L6 tasks are all independent of each other
