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

## Temporal Queries
- `getEventCount` optimization: access `this.store.get(code)?.length` directly rather than creating a defensive copy via `getEvents()` (added: 2026-02-28, dispatch: a6r.11)
- For late-join/pagination: capture `totalCount` from filtered set before applying `maxEvents` slicing so callers know how many were skipped (added: 2026-02-28, dispatch: a6r.11)
- Pure functions that depend on domain-specific types (DomainEvent) belong in `src/contexts/session/` not `src/lib/` (added: 2026-02-28, dispatch: a6r.11)

## Idempotency
- `assignOwnership` already had upsert semantics (filter-then-push); other operations needed explicit guards (added: 2026-02-28, dispatch: a6r.27)
- Content hashing via `JSON.stringify(data)` is sufficient for detecting identical re-submissions — CandidateEventsFile is plain serializable, no crypto hash needed (added: 2026-02-28, dispatch: a6r.27)

## ELK Layout
- ELK `layered` algorithm ignores `elk.aspectRatio` for disconnected component packing — only affects force-based algorithms. Use post-processing union-find + bounding-box reflow for landscape packing (added: 2026-02-28, dispatch: x42)
- Column count formula `ceil(sqrt(n * aspectRatio))` gives correct landscape packing for any number of disconnected components (added: 2026-02-28, dispatch: x42)
- When reflowing positions, update three coordinate systems: compound positions, child node absolute positions (parent offset + child relative), and edge section bend points (added: 2026-02-28, dispatch: x42)

## UX Phase Mapping
- When multiple UX phases share a single engine phase (e.g., spark/explore/rank during prep), use artifact inventory counts inside the switch case — keeps logic co-located and readable (added: 2026-03-01, dispatch: 6vh)
- Never-exhaustive check (`const _exhaustive: never = value`) in default switch cases provides compile-time safety for string unions without runtime cost (added: 2026-03-01, dispatch: 6vh)

## Cross-Agent Notes
- Task descriptions may reference types not yet in codebase — check src/schema/types.ts before assuming prior agent's work landed in your worktree (added: 2026-03-01, dispatch: 6vh)
