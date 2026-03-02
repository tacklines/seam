# Epic: UX Unification

**Epic ID**: multi-human-workflows-htre
**Created**: 2026-03-02
**Source**: /blossom (compressed — findings confirmed from direct exploration)
**Goal**: Tighten up codebase after rapid feature sprint. Decompose God component, remove dead code, extract lib functions, eliminate duplication.

## Task IDs

| BD ID | Title | Priority | Status | Depends On |
|-------|-------|----------|--------|------------|
| htre.1 | Remove dead global-settings component | P1 | open | none |
| htre.2 | Extract app-shell derivation functions to src/lib/ | P1 | open | none |
| htre.3 | Deduplicate IntegrationReport construction | P2 | open | htre.2 |
| htre.4 | Extract app-shell tab panels into dedicated tab components | P2 | open | htre.2 |
| htre.5 | Audit and clean up comparison-diff placement | P3 | open | none |
| htre.6 | Unify settings-dialog with settings-drawer | P2 | open | none |

## Priority Order

1. htre.1 — Remove dead global-settings (quick win, clears confusion)
2. htre.2 — Extract derivation functions (highest impact, ~800 lines moved)
3. htre.3 — Deduplicate IntegrationReport (natural followup to .2)
4. htre.6 — Unify settings pattern (medium impact)
5. htre.4 — Extract tab panels (large refactor, builds on .2)
6. htre.5 — Comparison-diff placement (low priority polish)

## Critical Path

htre.1 → htre.2 → htre.3 → htre.4 (sequential, each builds on prior)

## Parallel Opportunities

- htre.1, htre.2, htre.5, htre.6 can all start independently
- htre.3 and htre.4 both depend on htre.2
