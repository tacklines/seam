# Learnings: component

## Codebase Patterns
- One custom element per file, registered via `@customElement('tag-name')` decorator
- Shoelace components imported per-component (tree-shaking, not full bundle)
- `experimentalDecorators: true` + `useDefineForClassFields: false` in tsconfig (required for Lit)
- Components organized by domain feature: shared/, session/, artifact/, comparison/, visualization/ under src/components/ (added: 2026-02-28, dispatch: a6r.12)

## File Move Patterns
- When moving TS files to deeper paths, run two sed passes: one for `from '...'` imports, one for `import('...')` inline type expressions — the latter hides in method signatures (added: 2026-02-28, dispatch: a6r.12)
- `shared/` subdirectory for cross-domain UI primitives (event-card, assumption-list, aggregate-nav, filter-panel) avoids circular dependencies between domain directories (added: 2026-02-28, dispatch: a6r.12)

## Gotchas
- ELK TypeScript types: `elk.layout()` returns `ElkNode` — annotate children/edges with explicit `ElkNode` type to avoid implicit-any on `.x`/`.y` access (added: 2026-02-28, dispatch: multi-human-workflows-ort)
- Shoelace `sl-change` event: `e.target` is `SlSelect` not `HTMLSelectElement`; cast via `(e.target as unknown as { value: string }).value` for type-safe access (added: 2026-02-28, dispatch: multi-human-workflows-ort)
- `@types/d3-drag` not available; use native pointer events with `setPointerCapture`/`releasePointerCapture` instead (added: 2026-02-28, dispatch: multi-human-workflows-sfd)
- Bidirectional d3-zoom sync (e.g., minimap <-> main canvas) requires a `_updatingFromMinimap` flag to prevent re-entrant zoom event loops (added: 2026-02-28, dispatch: multi-human-workflows-sfd)
- Worktree branches based on old commits may have incompatible types when merged with main; extract standalone components and manually integrate the rest (added: 2026-02-28, dispatch: multi-human-workflows-imt)
- SVG `@dblclick` on `<g>` propagates to parent click handlers — use `e.stopPropagation()` to prevent single-click from also firing (added: 2026-02-28, dispatch: multi-human-workflows-2kp)
- When a node appears in `nodes[]` for edge routing but needs special rendering (e.g., collapsed aggregate), keep a separate list and filter it from the regular render loop (added: 2026-02-28, dispatch: multi-human-workflows-2kp)

## Semantic Zoom
- Semantic zoom: use a private getter reading from @state() viewTransform.k — re-evaluates automatically on each Lit render triggered by zoom events, no additional @state needed (added: 2026-02-28, dispatch: multi-human-workflows-891)
- Aggregate event node IDs have form 'AggregateName::EventName'; external system node IDs are plain strings with no '::' — use this to distinguish intra- vs inter-aggregate edges (added: 2026-02-28, dispatch: multi-human-workflows-891)

## Animation Patterns
- Two-frame CSS transition pattern: set element to old position → await updateComplete → requestAnimationFrame → set new position. CSS then animates old→new. Skipping RAF causes both renders to batch (added: 2026-02-28, dispatch: multi-human-workflows-880)
- CSS `transition: transform` on SVG `<g>` requires `style="transform: translate(Xpx, Ypx)"` not SVG `transform` attribute — attribute changes don't trigger CSS transitions (added: 2026-02-28, dispatch: multi-human-workflows-880)

## Preferences
- ELK compound nodes: child node coordinates are relative to parent's top-left, not absolute. Compute absolute positions as `parentX + child.x, parentY + child.y` (added: 2026-02-28, dispatch: multi-human-workflows-apz)
- Use scoped ID convention (`aggregate::eventName`) for domain event nodes inside compound groups to prevent ID collisions (added: 2026-02-28, dispatch: multi-human-workflows-apz)

## Session Patterns
- app-shell.ts uses `_soloMode` boolean @state to switch between session-lobby and file-drop-zone hero landing (added: 2026-02-28, dispatch: multi-human-workflows-zgg)
- EventSource (SSE) in Lit: connect in method, call close() in disconnectedCallback, store as private field not @state to avoid re-renders (added: 2026-02-28, dispatch: multi-human-workflows-zgg)

## Accessibility
- SVG keyboard navigation: add `tabindex="0"`, `role="application"`, `aria-label`, `aria-activedescendant` to the SVG element; use `role="img"` and `aria-label` on node `<g>` elements (added: 2026-02-28, dispatch: multi-human-workflows-jus)
- Roving tabindex pattern for graph: build adjacency map from edges, use ArrowRight/Down (+1) and ArrowLeft/Up (-1) to traverse, Enter/Space to activate, Escape to clear focus (added: 2026-02-28, dispatch: multi-human-workflows-jus)

## Force Layout
- d3-force fixed-node pattern: setting `fx`/`fy` on a simulation node makes it immovable — useful as a gravity anchor for cluster layout (added: 2026-02-28, dispatch: multi-human-workflows-82g)
- `simulation.stop()` then `for (i) sim.tick()` for synchronous force convergence; calling `.stop()` before adding forces is safe (added: 2026-02-28, dispatch: multi-human-workflows-82g)

## State Lifting
- When a Lit component manages connection lifecycle (EventSource, WebSocket), put the connection in `state/` with a module-level variable, not in the component — state persists across navigation, components focus on rendering (added: 2026-02-28, dispatch: a6r.34)
- Components subscribe to the store in `connectedCallback` and unsubscribe in `disconnectedCallback` — same lifecycle pattern as EventSource itself (added: 2026-02-28, dispatch: a6r.34)

## Reactive Controllers
- When a component needs event-type-driven side effects (not just derived values), use raw `store.subscribe` with a type filter — `StoreController` is wrong for event-driven side effects (added: 2026-02-28, dispatch: a6r.31)
- `ReactiveController.setFoo()` called from `render()` is safe if guarded by equality checks — Lit batches synchronous `requestUpdate()` within a render (added: 2026-02-28, dispatch: a6r.31)
- Store selector equality (`!==`) works correctly only when store returns new object references on mutation — `StoreController<T>` relies on this invariant (added: 2026-02-28, dispatch: a6r.31)

## Cross-Agent Notes
- (from logic) ELK returns top-left (x,y) not center; use `_nodeCx`/`_nodeCy` helpers when computing edge endpoints or zoom targets (added: 2026-02-28)
- SVG `pointer-events` must be applied via `style=` attribute in Lit svg templates, not as a bare attribute (added: 2026-02-28, dispatch: multi-human-workflows-5ku)
- Edge filter helpers extracted to `src/lib/edge-filters.ts` — pure functions `isEdgeVisible`/`isEdgeGroupVisible` (added: 2026-02-28, dispatch: multi-human-workflows-5ku)
- SVG `<textPath startOffset="50%" text-anchor="middle">` with `paint-order="stroke"` creates readable labels along curved paths (added: 2026-02-28, dispatch: multi-human-workflows-5ja)
- SVG marker `markerUnits="strokeWidth"` scales arrowheads relative to stroke width for crisp zoom-invariant arrows (added: 2026-02-28, dispatch: multi-human-workflows-5ja)
- ELK edge sections: `laid.edges[].sections[].{startPoint, endPoint, bendPoints}` — track edge ID to group key to retrieve sections after layout (added: 2026-02-28, dispatch: multi-human-workflows-5ja)
