# Learnings: logic

## Codebase Patterns
- Pure functions in `src/lib/` -- no DOM dependencies, data in / data out
- Tests colocated: `src/lib/foo.ts` -> `src/lib/foo.test.ts`
- YAML loading uses js-yaml, validation uses Ajv with ajv-formats
- ELK.js replaces d3-force for layered (Sugiyama) layout in flow diagram (added: 2026-02-28, dispatch: multi-human-workflows-3tm)
- Use `elkjs/lib/elk.bundled.js` import (works in browser and vitest; worker version doesn't) (added: 2026-02-28, dispatch: multi-human-workflows-3tm)
- ELK returns top-left (x,y) coordinates; use helper methods `_nodeCx`/`_nodeCy` for center coords (added: 2026-02-28, dispatch: multi-human-workflows-3tm)

## Gotchas
- ELK layered algorithm rejects self-loop edges; filter them before layout, handle separately in rendering (added: 2026-02-28, dispatch: multi-human-workflows-3tm)
- BFS: always seed visited set with start node to handle self-loops/cycles naturally; remove start from results at the end (added: 2026-02-28, dispatch: multi-human-workflows-3qx)
- When building objects for TypeScript `Omit<T, 'id' | 'flaggedAt'>` with optional fields, construct the base object with required fields first, then conditionally add optional fields — avoids undefined values (added: 2026-02-28, dispatch: ppc.6+ppc.7)
- `src/lib/` files must use relative imports (`../schema/types.js`), not `@` alias — alias only works in vitest/vite, not `tsc --noEmit` (added: 2026-02-28, dispatch: multi-human-workflows-9o8)
- `tsconfig.server.json` should explicitly include only needed files, not all of `src/lib/` — other lib files have bundler-specific imports that fail under node16 resolution (added: 2026-02-28, dispatch: multi-human-workflows-9o8)
- SessionStore API returns structured objects `{ session, creatorId }` / `{ session, participantId }` — verify actual return shapes before writing tests (added: 2026-02-28, dispatch: multi-human-workflows-9o8)

## Preferences
- PrepStatus and SessionPrepStatus are exported from src/lib/prep-completeness.ts alongside the functions — no need to add analysis output types to schema/types.ts (added: 2026-02-28, dispatch: multi-human-workflows-xb6)

## Workflow Engine
- PHASE_ORDER array + PHASE_METADATA record pattern gives DRY iteration without switch statements in main computation paths (added: 2026-02-28, dispatch: multi-human-workflows-9j7)
- Terminal phase (done) needs special handling: isComplete = true only when current === done, not from the generic "earlier phases complete" rule (added: 2026-02-28, dispatch: multi-human-workflows-9j7)
- `sessionToSessionData()` uses `Map<string, unknown>` for participants (not `Participant`) to preserve lib layer purity — avoids importing from session-store.ts (added: 2026-02-28, dispatch: ppc.2)

## Persistence
- SessionPersistence uses existing SerializedSession type for JSON format — don't reinvent session serialization, session-store.ts already has serializeSession() (added: 2026-02-28, dispatch: multi-human-workflows-27c)
- Map<string, Participant> round-trips through Participant[] array; reconstruct Map from array in sessionFromJson() using p.id as key (added: 2026-02-28, dispatch: multi-human-workflows-27c)

## Adapter Patterns
- Use `src/contexts/<context>/adapter.ts` to decouple lib/ functions from concrete types — adapter maps LoadedFile → ComparableArtifact, keeping lib/ functions pure against abstract interfaces (added: 2026-02-28, dispatch: a6r.20)
- When mapping schema field names (snake_case `affects_events` → camelCase `affectsEvents`), do it in the adapter layer, not in lib/ functions — keeps lib/ aligned with the abstract interface (added: 2026-02-28, dispatch: a6r.20)

## Cross-Agent Notes
- (none yet)
