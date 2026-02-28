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

## Cross-Agent Notes
- (none yet)
