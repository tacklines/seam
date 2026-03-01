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
