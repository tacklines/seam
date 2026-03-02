# Archive: component

Entries moved here during retro 2026-02-28.

## Force Layout (d3-force replaced by ELK)
- d3-force fixed-node pattern: setting `fx`/`fy` on a simulation node makes it immovable — useful as a gravity anchor for cluster layout (added: 2026-02-28)
- `simulation.stop()` then `for (i) sim.tick()` for synchronous force convergence; calling `.stop()` before adding forces is safe (added: 2026-02-28)

## File Move Patterns (one-time restructure)
- When moving TS files to deeper paths, run two sed passes: one for `from '...'` imports, one for `import('...')` inline type expressions (added: 2026-02-28, dispatch: a6r.12)
- `shared/` subdirectory for cross-domain UI primitives avoids circular dependencies between domain directories (added: 2026-02-28, dispatch: a6r.12)

## Animation Patterns (stable, archived Sprint 5)
- Two-frame CSS transition pattern: set element to old position → await updateComplete → requestAnimationFrame → set new position. CSS then animates old→new. Skipping RAF causes both renders to batch (added: 2026-02-28, dispatch: multi-human-workflows-880)
- CSS `transition: transform` on SVG `<g>` requires `style="transform: translate(Xpx, Ypx)"` not SVG `transform` attribute — attribute changes don't trigger CSS transitions (added: 2026-02-28, dispatch: multi-human-workflows-880)

## ELK Compound Nodes (stable, archived Sprint 5)
- ELK compound nodes: child node coordinates are relative to parent's top-left, not absolute. Compute absolute positions as `parentX + child.x, parentY + child.y` (added: 2026-02-28, dispatch: multi-human-workflows-apz)
- Use scoped ID convention (`aggregate::eventName`) for domain event nodes inside compound groups to prevent ID collisions (added: 2026-02-28, dispatch: multi-human-workflows-apz)

## SVG Rendering Details (stable, archived Sprint 5)
- SVG `<textPath startOffset="50%" text-anchor="middle">` with `paint-order="stroke"` creates readable labels along curved paths (added: 2026-02-28, dispatch: multi-human-workflows-5ja)
- SVG marker `markerUnits="strokeWidth"` scales arrowheads relative to stroke width for crisp zoom-invariant arrows (added: 2026-02-28, dispatch: multi-human-workflows-5ja)
- ELK edge sections: `laid.edges[].sections[].{startPoint, endPoint, bendPoints}` — track edge ID to group key to retrieve sections after layout (added: 2026-02-28, dispatch: multi-human-workflows-5ja)

## Pruned Sprint 7 Retro (2026-03-01)
- ELK layout types: cast `ElkNode` children and edges through ELK API types for type safety (added: 2026-02-28)
- d3-drag on SVG `<g>`: attach to group, read dx/dy from event, update transform — works with ELK-positioned nodes (added: 2026-02-28)
- Bidirectional zoom sync: SVG viewBox ↔ minimap viewport requires debounce flag to prevent feedback loops (added: 2026-02-28)
- Worktree compat: agents in isolated worktrees may not see prior agents' merged code — design tasks to be self-contained (added: 2026-02-28)
- Semantic zoom: switch SVG detail level based on `k` (scale) from d3-zoom transform — threshold at k<0.5 for compact, k>1.5 for detail (added: 2026-02-28)

## Archived Sprint 8 Retro (2026-03-01)
- SVG `@dblclick` on `<g>` propagates to parent click handlers — use `e.stopPropagation()` (added: 2026-02-28)
- When a node appears in `nodes[]` for edge routing but needs special rendering, keep a separate list and filter from regular render loop (added: 2026-02-28)
- Check store types before assuming data from task requirements — missing fields need a schema extension task (added: 2026-02-28, dispatch: a6r.33)

## Archived Sprint 9 / htre Retro (2026-03-02)
- SVG `pointer-events` must be applied via `style=` in Lit svg templates, not as bare attribute (added: 2026-02-28)
- Edge filter helpers extracted to `src/lib/edge-filters.ts` — pure functions (added: 2026-02-28)
- Worktree gotchas: git stash pop can surface merge conflicts in package.json/tsconfig; @storybook/web-components types not installed (added: 2026-03-01)
- Fixed-position toast stack: `pointer-events: none` on host, re-enable on notification wrappers (added: 2026-03-02)
- Verdict panel pulse: box-shadow keyframe animation toggled by `.animating` class via setTimeout (added: 2026-03-02)
- `ReactiveController.setFoo()` from render() safe if guarded by equality checks — Lit batches synchronous requestUpdate() (added: 2026-02-28)
- Store selector equality (`!==`) relies on store returning new object references on mutation (added: 2026-02-28)
- When `ReactiveController` side effects needed, use raw `store.subscribe` with type filter instead of StoreController (added: 2026-02-28)
- Timer in Lit: store as `ReturnType<typeof setInterval> | null`, start in connectedCallback, clear in disconnectedCallback (added: 2026-03-02)
