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
- Domain events in `src/contexts/session/domain-events.ts` — 17 events, 5 contexts, Zod discriminated union (added: 2026-02-28)
- Use `baseEventSchema.extend({ type: z.literal("X"), ... })` to define events (added: 2026-02-28)
- EventStore uses `DomainEventSchema.parse(event)` on append — ZodError is the signal for invalid data (added: 2026-02-28)

### CQRS & Streaming
- `ProjectionEngine` subscribes at construction — `rebuild()` must `reset()` first to avoid double-counting (added: 2026-02-28)
- When spreading a `DomainEvent` union into object literal, TypeScript flags excess properties — spell out fresh literals in tests (added: 2026-02-28)
- MCP stdio transport reserves stdout for JSON-RPC — all logging via `console.error()` (added: 2026-02-28)

### WebSocket & A2A
- `WebSocketServer` attaches via `{ server: httpServer }` — no explicit `upgrade` wiring needed (added: 2026-02-28)
- `heartbeatTimer.unref()` prevents tests from hanging (added: 2026-02-28)
- A2A spec v0.2.5 uses `message/send` as primary method, not `tasks/send` (added: 2026-02-28)
- A2A synchronous in-memory ops: `submitted → working → completed` in one request cycle (added: 2026-02-28)

### Infrastructure
- Keycloak `--import-realm` with volume mount to `/opt/keycloak/data/import/` for pre-configured realm (added: 2026-02-28)
- For polling MCP tools, callers must track semantic values (e.g., currentPhase) not timestamp-based `changed` booleans (added: 2026-02-28)

### Type Unification
- When consolidating duplicate types, the alias pattern (`export type ClientType = CanonicalType`) preserves all downstream consumers without touching import sites (added: 2026-03-01, dispatch: xiu)
- `src/schema/types.ts` is the correct home for types shared across server (src/lib/) and client (src/state/) layers (added: 2026-03-01, dispatch: xiu)

## Cross-Agent Notes
- Participant type now unified in `src/schema/types.ts` — `SessionParticipant` is an alias. Both layers import from schema/ (added: 2026-03-01, dispatch: xiu)
