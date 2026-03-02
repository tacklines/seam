# Learnings: architect

## Core — High-Reuse Fundamentals

### Project Structure
- Schema is the contract: YAML files validate against `src/schema/candidate-events.schema.json` (DO NOT MODIFY — shared with tackline pipeline)
- State is a singleton pub/sub store at `src/state/app-state.ts`, framework-independent
- Path alias `@` maps to `/src` in both Vite and vitest configs
- MCP server entrypoint at `src/server/mcp.ts`, built via `tsconfig.server.json` to `dist-server/`

### TypeScript Patterns
- Server tsconfig: `allowImportingTsExtensions: false`, `"types": ["node"]`; include globs must end `/**/*` not `/**` (added: 2026-02-28)
- `satisfies EventType` on event literals for compile-time safety without widening (added: 2026-02-28)
- Transition tables as `Record<State, Partial<Record<Action, State>>>` preferable to switch statements (added: 2026-02-28)
- `as const satisfies T` for frozen config objects with string union fields (added: 2026-03-01)
- Zod v4: `z.record(z.string(), z.unknown())` — single-arg form is type error (added: 2026-02-28)
- `z.ZodType<T>` annotation on inline Zod schemas acts as structural alignment test (added: 2026-03-01)

### Architecture Patterns
- Inject narrow accessor `(code: string) => Session | null` into context services — avoids circular imports (added: 2026-02-28)
- Optional EventStore constructor injection with `?? null` fallback — all services use this (added: 2026-02-28)
- Server `listen()` needs `process.env.NODE_ENV !== 'test'` guard to avoid EADDRINUSE in vitest (added: 2026-02-28)
- Factory pattern (`createSseHandler(eventStore)`) for testable handlers (added: 2026-02-28)

## Task-Relevant — Current Sprint Context

### Domain Events & EventStore
- 27 events, 7 contexts, Zod discriminated union in `src/contexts/session/domain-events.ts` (added: 2026-02-28)
- EventStore uses `DomainEventSchema.parse(event)` on append — ZodError signals invalid data (added: 2026-02-28)
- Adding new domain event: update DomainEventSchema union, DOMAIN_EVENT_TYPES array, count assertion in test (added: 2026-03-02)

### Service Patterns
- MCP tools wrapping context services: instantiate inline with `getSession` accessor, call method, return — no persistent instance (added: 2026-03-02)
- Service-level `Map<sessionCode, Map<entityId, Entity>>` for approval queues (added: 2026-03-01)
- When domain type serves dual purposes, split into per-participant stored form + computed view type (added: 2026-03-02)
- Session field additions cascade to 6+ places — prefer service-level Map storage when wrapping pure functions (added: 2026-03-02)

### Type Unification
- Alias pattern `export type ClientType = CanonicalType` preserves downstream consumers without touching import sites (added: 2026-03-01)
- `src/schema/types.ts` is the correct home for cross-layer shared types (added: 2026-03-01)

### Delegation & Presence
- Use same generated ID for event's `eventId` and stored entity's `id` — simplifies event→state tracing (added: 2026-03-01)
- PresenceTracker singleton shared between http.ts and websocket.ts via module cache; test with fresh instances (added: 2026-03-02)

### Config
- Deep-merging strongly-typed config requires `as any` — sub-interfaces lack index signatures (added: 2026-03-01)

## Cross-Agent Notes
- Participant type unified in `src/schema/types.ts` — `SessionParticipant` is an alias (added: 2026-03-01)
