# Archive: component

Entries moved here during retro 2026-02-28.

## Force Layout (d3-force replaced by ELK)
- d3-force fixed-node pattern: setting `fx`/`fy` on a simulation node makes it immovable — useful as a gravity anchor for cluster layout (added: 2026-02-28)
- `simulation.stop()` then `for (i) sim.tick()` for synchronous force convergence; calling `.stop()` before adding forces is safe (added: 2026-02-28)

## File Move Patterns (one-time restructure)
- When moving TS files to deeper paths, run two sed passes: one for `from '...'` imports, one for `import('...')` inline type expressions (added: 2026-02-28, dispatch: a6r.12)
- `shared/` subdirectory for cross-domain UI primitives avoids circular dependencies between domain directories (added: 2026-02-28, dispatch: a6r.12)
