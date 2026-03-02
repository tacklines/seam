# Retrospective History

## Retro: 2026-02-28 (Sprint 4)
- Tasks completed: 3 (a6r.12, a6r.26, x42) + 1 epic closed (ppc)
- New learnings: 9 across 3 members (component: 3, architect: 3, logic: 3)
- Pruned/archived: 21 entries (architect: 17, component: 4)
- Tests: 555 → 601 (+46)
- Key insight: ELK layered algorithm ignores `elk.aspectRatio` for disconnected component packing — requires post-processing union-find reflow

## Retro: 2026-02-28 (Sprint 5)
- Tasks completed: 4 (a6r.33, a6r.28, a6r.32, a6r.30) — all component agent
- New learnings: 9 for component agent
- Pruned/archived: 12 entries (7 to archive, 5 merged/removed)
- Tests: 601 → 683 (+82)
- Key insight: Build new components first, apply cross-cutting changes (a11y) last — ensures cross-cutting tasks cover the full component set

## Retro: 2026-03-01 (Sprint 6)
- Tasks completed: 2 (pmf, a6r.29) + a6r epic closed — backlog fully clear
- New learnings: 3 across 2 members (architect: 1, component: 2)
- Pruned/archived: 0 (all entries <21 days old)
- Tests: 683 → 692 (+9)
- Key insight: Small schema task (pmf) completes fast, gives good warm-up before large cross-cutting task (i18n across 22 files)

## Retro: 2026-03-01 (Sprint 7)
- Tasks completed: 5 (jat, xiu, b79, exv, 6vh) — foundation layer of epic n57
- New learnings: 10 across 3 members (architect: 3, component: 4, logic: 3)
- Pruned/archived: 5 entries from component (to archive)
- Tests: 692 → 728 (+36)
- Key insight: Three sequential tasks modifying types.ts caused one merge conflict — batch same-file changes into a single task or dispatch strictly serially with immediate merge

## Retro: 2026-03-01 (Sprint 8)
- Tasks completed: 5 (2ye, 35l, 36k, qdu, w6f) — Layer 2 of epic n57, all 4 agents utilized
- New learnings: 11 across 4 members (architect: 5, logic: 2, component: 2, tester: 2)
- Pruned/archived: 8 entries (architect: 5, component: 3)
- Tests: 728 → 798 (+70)
- Key insight: Worktree agents that need events from a just-merged bead will re-create them, causing predictable merge conflicts — include exact field names in agent prompts to minimize post-merge fixes

## Retro: 2026-03-02 (UX Unification epic htre)
- Tasks completed: 3 this session (htre.4 tab panel extraction, htre.5 comparison-diff audit, test fix) + 3 in prior session (htre.1-3, htre.6)
- Epic htre fully closed: app-shell.ts 2504 → 1758 lines (-30%)
- New learnings: 0 new (pruning session — component 93→58, architect 74→58)
- Pruned/archived: 9 component entries + 6 architect entries archived
- Tests: 798 → 1293 (+495 across multiple sprints)
- Key insight: Orchestrator can handle trivial audit tasks (htre.5) directly without agent dispatch — saves tokens and time for obvious-answer investigations
