# Learnings: architect

## Core — High-Reuse Fundamentals

### Project Structure
- Schema is the contract: YAML files validate against `src/schema/candidate-events.schema.json` (DO NOT MODIFY — shared with tackline pipeline)
- State is a singleton pub/sub store at `src/state/app-state.ts`, framework-independent
- Path alias `@` maps to `/src` in both Vite and vitest configs
- MCP server entrypoint at `src/server/mcp.ts`, built via `tsconfig.server.json` to `dist-server/`

### TypeScript / Zod Patterns
- Server tsconfig must set `allowImportingTsExtensions: false` and `"types": ["node"]` (added: 2026-02-28)
- tsconfig include globs must end `/**/*` not `/**` — TypeScript rejects bare `**` as terminal (added: 2026-02-28)
- Use `satisfies EventType` on event literal objects — compile-time safety without widening inferred type (added: 2026-02-28)
- Transition tables as `Record<State, Partial<Record<Action, State>>>` preferable to switch statements (added: 2026-02-28)
- Zod v4 requires `z.record(z.string(), z.unknown())` — single-arg form is a type error (added: 2026-02-28)
- Use `as const satisfies T` for frozen config objects with string union fields — `Object.freeze` alone widens literals to `string` (added: 2026-03-01, dispatch: b79)

### Architecture Patterns
- Inject narrow accessor `(code: string) => Session | null` into context services — avoids circular imports (added: 2026-02-28)
- Optional EventStore constructor injection: `constructor(eventStore?: EventStore)` with `?? null` fallback — all services use this (added: 2026-02-28)
- Server entry-point modules need `if (process.env.NODE_ENV !== 'test')` guard on `server.listen()` to avoid `EADDRINUSE` in vitest (added: 2026-02-28)
- Use factory pattern (`createSseHandler(eventStore)`) for testable handlers — decouples transport from logic (added: 2026-02-28)
- Debounced event-subscription persistence (100ms setTimeout) replaces manual persist calls — single subscription, clearTimeout on rapid bursts (added: 2026-02-28)

## Task-Relevant — Current Sprint Context

### Domain Events & EventStore
- Domain events in `src/contexts/session/domain-events.ts` — 27 events, 7 contexts, Zod discriminated union (added: 2026-02-28, updated: 2026-03-01)
- Use `baseEventSchema.extend({ type: z.literal("X"), ... })` to define events (added: 2026-02-28)
- EventStore uses `DomainEventSchema.parse(event)` on append — ZodError is the signal for invalid data (added: 2026-02-28)

### CQRS & Streaming
- `ProjectionEngine` subscribes at construction — `rebuild()` must `reset()` first to avoid double-counting (added: 2026-02-28)
- When spreading a `DomainEvent` union into object literal, TypeScript flags excess properties — spell out fresh literals in tests (added: 2026-02-28)
- MCP stdio transport reserves stdout for JSON-RPC — all logging via `console.error()` (added: 2026-02-28)

### Infrastructure
- For polling MCP tools, callers must track semantic values (e.g., currentPhase) not timestamp-based `changed` booleans (added: 2026-02-28)

### Type Unification
- When consolidating duplicate types, the alias pattern (`export type ClientType = CanonicalType`) preserves all downstream consumers without touching import sites (added: 2026-03-01, dispatch: xiu)
- `src/schema/types.ts` is the correct home for types shared across server (src/lib/) and client (src/state/) layers (added: 2026-03-01, dispatch: xiu)

### Zod + TypeScript Pragmatism
- For deeply nested Partial<T> types, use `z.record(z.string(), z.unknown())` at Zod level + `Omit<...> & { field: ActualType }` for TS type — avoids rebuilding deep interface hierarchies in Zod (added: 2026-03-01, dispatch: 2ye)
- `z.ZodType<T>` annotation on inline Zod schemas acts as structural alignment test — compiler errors if Zod shape doesn't match TS interface (added: 2026-03-01, dispatch: 2ye)

### Bounded Context Services
- When a domain type serves dual purposes (stored record vs computed aggregate), split into per-participant stored form + computed view type (added: 2026-03-02, dispatch: 3r3.6)
- Adding Session fields cascades to 6+ places (Session, SerializedSession, createSession, serialize/deserialize, persistence, 4+ test fixtures) — prefer service-level Map storage when wrapping existing pure functions (added: 2026-03-02, dispatch: 3r3.6-3r3.9)
- Always verify event field names in `domain-events.ts` — task descriptions use shorthand; event payloads are not uniform (flat fields vs embedded objects) (added: 2026-03-02, dispatch: 3r3.7)
- MCP tool handlers are stdio-only — test by mirroring handler logic in helpers that call SessionStore directly (added: 2026-03-02, dispatch: 3r3.15)

### Session Config Integration
- Deep-merging strongly-typed config requires `as any` — sub-interfaces lack index signatures (added: 2026-03-01, dispatch: w6f)
- Worktree agent re-creating events already in HEAD causes expected merge conflicts — keep HEAD version, fix field name mismatches (added: 2026-03-01, dispatch: w6f)

### MCP Tool Patterns (Phase I-IV)
- MCP tools that wrap bounded context services: instantiate service inline with `getSession` accessor from SessionStore, call service method, return result — no persistent service instance needed (added: 2026-03-02, dispatch: 3r3.13)
- Template-based suggestions (suggest_events, suggest_priorities, suggest_decomposition): heuristic pattern matching, not LLM — deterministic, testable, fast (added: 2026-03-02, dispatch: 3r3.13, updated: 3r3.12)
- DecompositionService.getDecomposition() returns WorkItem[] only — get_decomposition MCP tool combines it with session.workItemDependencies + getCoverageMatrix() (added: 2026-03-02, dispatch: 3r3.12)
- Decomposition heuristics in `src/lib/decomposition-heuristics.ts` — trigger-pattern classification, complexity by event count (S=1-2, M=3-4, L=5-6, XL=7+) (added: 2026-03-02, dispatch: 3r3.12)

### Delegation Service Pattern
- When an event schema uses `eventId` as the record identifier, use the same generated ID for both the event's `eventId` and the stored entity's `id` — makes tracing between events and state trivial (added: 2026-03-01, dispatch: 3r3.8)
- Service-level Map storage (`Map<sessionCode, Map<entityId, Entity>>`) is the right pattern for approval queues where entries come and go with business decisions (added: 2026-03-01, dispatch: 3r3.8)

### Presence & Real-time
- When adding a new domain event to DomainEventSchema union, also update DOMAIN_EVENT_TYPES array and count assertion in domain-events.test.ts (added: 2026-03-02, dispatch: 3r3.24)
- PresenceTracker singleton shared between http.ts and websocket.ts — Node module cache ensures same instance; test with fresh instances for isolation (added: 2026-03-02, dispatch: 3r3.24)

## Cross-Agent Notes
- Participant type now unified in `src/schema/types.ts` — `SessionParticipant` is an alias. Both layers import from schema/ (added: 2026-03-01, dispatch: xiu)
