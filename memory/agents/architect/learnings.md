# Learnings: architect

## Codebase Patterns
- Schema is the contract: YAML files validate against `src/schema/candidate-events.schema.json` (DO NOT MODIFY this file -- shared with tackline pipeline)
- State is a singleton pub/sub store at `src/state/app-state.ts`, framework-independent
- Path alias `@` maps to `/src` in both Vite and vitest configs
- MCP server entrypoint at `src/server/mcp.ts`, built via `tsconfig.server.json` to `dist-server/` (added: 2026-02-28, dispatch: bead-usw)
- MCP SDK imports: `@modelcontextprotocol/sdk/server/mcp.js` (McpServer) and `@modelcontextprotocol/sdk/server/stdio.js` (StdioServerTransport) (added: 2026-02-28, dispatch: bead-usw)

## Gotchas
- Server tsconfig must set `allowImportingTsExtensions: false` (incompatible with `noEmit: false`) and `"types": ["node"]` (added: 2026-02-28, dispatch: bead-fk3)
- tsconfig include globs must end `/**/*` not `/**` — TypeScript rejects bare `**` as terminal (added: 2026-02-28, dispatch: bead-usw)
- MCP stdio transport reserves stdout for JSON-RPC — all logging must use `console.error()` (added: 2026-02-28, dispatch: bead-usw)

## Preferences
- For polling-friendly MCP tools over stateless transports, document that callers must track semantic values (e.g., currentPhase) rather than relying on timestamp-based `changed` booleans (added: 2026-02-28, dispatch: ppc.8+ppc.5)
- `z.string().optional()` with Zod produces `string | undefined` in handler — TypeScript handles correctly without nullish coalescing (added: 2026-02-28, dispatch: ppc.8+ppc.5)

## Domain Events
- Domain events live in `src/contexts/session/domain-events.ts` — 17 events across 5 contexts, Zod-validated discriminated union (added: 2026-02-28, dispatch: a6r.6)
- Use `baseEventSchema.extend({ type: z.literal("X"), ... })` to define events — avoids re-declaring eventId/sessionCode/timestamp in each schema (added: 2026-02-28, dispatch: a6r.6)
- `DOMAIN_EVENT_TYPES` array needs `as const` for TypeScript to narrow element type to `DomainEventType` (added: 2026-02-28, dispatch: a6r.6)

## EventStore
- EventStore uses `DomainEventSchema.parse(event)` on append — thrown ZodError is the correct signal for invalid data, callers catch if needed (added: 2026-02-28, dispatch: a6r.7)
- Snapshot listener set with `Array.from(this.listeners)` before notification iteration — guards against listeners that unsubscribe themselves during callback (added: 2026-02-28, dispatch: a6r.7)
- `getEvents()` returns defensive copy (spread into new array) so callers cannot corrupt internal log (added: 2026-02-28, dispatch: a6r.7)

## Dual-Write Pattern
- Use `satisfies EventType` on event literal objects — gives compile-time safety without widening the inferred type, prefer over `as EventType` (added: 2026-02-28, dispatch: a6r.8)
- Optional EventStore constructor injection keeps backward compat: `constructor(eventStore?: EventStore)` with `?? null` fallback (added: 2026-02-28, dispatch: a6r.8)
- For `ArtifactSubmitted.version`, count prior same-participant/same-file submissions as in-place version counter (added: 2026-02-28, dispatch: a6r.8)

## Context Extraction
- When a bounded context service needs store reads, inject a narrow accessor `(code: string) => Session | null` instead of the full store class — avoids circular imports, keeps interface minimal (added: 2026-02-28, dispatch: a6r.15)
- Export shared low-level utilities (like `generateId`) from their point of definition rather than duplicating — even 1-line functions (added: 2026-02-28, dispatch: a6r.15)

## Gateway Pattern
- `LoadedFile` lives in `src/schema/types.ts`, not `src/lib/session-store.ts` — session-store imports it from schema (added: 2026-02-28, dispatch: a6r.16)
- When adding contexts that server code imports, add them to `tsconfig.server.json` include array (added: 2026-02-28, dispatch: a6r.16)

## CQRS Projections
- When spreading a `DomainEvent` union variable into an object literal, TypeScript flags excess properties because it checks against every union arm — spell out fresh object literals in tests instead (added: 2026-02-28, dispatch: a6r.10)
- `ProjectionEngine` subscribes at construction time, so `rebuild()` must `reset()` before replaying — live events and replay events would otherwise double-count (added: 2026-02-28, dispatch: a6r.10)
- For `Map`-valued projection state, `new Map(this.state.ownership)` in `getState()` is the right defensive copy pattern — same principle as spreading arrays (added: 2026-02-28, dispatch: a6r.10)

## SSE / Event Streaming
- Server entry-point modules (`src/server/*.ts`) that call `server.listen()` at module scope need `if (process.env.NODE_ENV !== 'test')` guard to avoid `EADDRINUSE` in vitest (added: 2026-02-28, dispatch: a6r.9)
- Use `createSseHandler(eventStore)` factory pattern for testable SSE — decouples transport from logic, no HTTP mocking needed (added: 2026-02-28, dispatch: a6r.9)

## Auto-Persistence
- Move singleton creation (EventStore) to the module that also manages persistence (`store.ts`) to avoid circular imports between store.ts and gateway.ts (added: 2026-02-28, dispatch: a6r.13)
- Debounced event-subscription persistence (100ms setTimeout) replaces manual `persistSessions()` calls — single subscription in store.ts, clearTimeout on rapid bursts (added: 2026-02-28, dispatch: a6r.13)

## State Machine
- Transition tables as `Record<State, Partial<Record<Action, State>>>` are preferable to switch statements — exhaustiveness enforced by TypeScript, transitions readable at a glance (added: 2026-02-28, dispatch: a6r.17)
- When adding a required field to a core interface (`Session`), run `tsc --noEmit` immediately to discover all fixture helpers that need `status` added (added: 2026-02-28, dispatch: a6r.17)
- `?? 'active'` default in `sessionFromJson`/`deserializeSession` is the right pattern for adding required fields to persisted data — backward compat without migration (added: 2026-02-28, dispatch: a6r.17)

## Artifact Versioning
- Version chains keyed by `participant+fileName` composite — each unique combo gets independent version numbering starting at 1 (added: 2026-02-28, dispatch: a6r.18)
- `SubmissionProtocol = 'web' | 'mcp' | 'a2a'` lives in `src/schema/types.ts` alongside other shared types — not in the context module (added: 2026-02-28, dispatch: a6r.18)
- ArtifactService follows same optional EventStore injection pattern as AgreementService — `constructor(eventStore?: EventStore)` (added: 2026-02-28, dispatch: a6r.18)

## Contract Context
- Define a local `SessionData` interface with only the fields the service needs — more explicit than `(code: string) => Session | null` and documents dependency surface in the type system (added: 2026-02-28, dispatch: a6r.19)
- `checkCompliance` and `detectDrift` are stateless — take/derive data, return report, no mutations. Safe to call repeatedly, easy to test (added: 2026-02-28, dispatch: a6r.19)

## WebSocket
- `WebSocketServer` attaches to HTTP server's `upgrade` event automatically when constructed with `{ server: httpServer }` — no explicit wiring needed (added: 2026-02-28, dispatch: a6r.24)
- `heartbeatTimer.unref()` is important for tests to not hang: intervals with references prevent process from exiting (added: 2026-02-28, dispatch: a6r.24)
- Mock-based tests using `vi.mock('ws')` are correct for server tests in sandbox environments where loopback binding is blocked (added: 2026-02-28, dispatch: a6r.24)

## Keycloak
- `--import-realm` flag with volume mount to `/opt/keycloak/data/import/` is the cleanest way to get a pre-configured realm on first boot (added: 2026-02-28, dispatch: a6r.25)
- Storing credentials as plaintext `"value"` in realm JSON is safe for dev imports — Keycloak hashes them on first write (added: 2026-02-28, dispatch: a6r.25)

## A2A Protocol
- Zod v4 requires `z.record(z.string(), z.unknown())` — single-arg `z.record(z.unknown())` is a type error (added: 2026-02-28, dispatch: a6r.26)
- A2A spec v0.2.5 uses `message/send` as primary method name, not `tasks/send` (added: 2026-02-28, dispatch: a6r.26)
- A2A task execution: synchronous in-memory ops work as `submitted → working → completed` in one request cycle; async ops would need background worker + polling (added: 2026-02-28, dispatch: a6r.26)

## Cross-Agent Notes
- (none yet)
