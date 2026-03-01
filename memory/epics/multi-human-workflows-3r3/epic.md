# Epic: Vision Gap Analysis — current state vs experience-design.md

**Epic ID**: multi-human-workflows-3r3
**Created**: 2026-03-01
**Source**: /blossom
**Goal**: Deep analysis of what exists in multi-human-workflows compared to where we want to be per docs/experience-design.md. Includes complete frontend/backend rewrite, paired with supporting Claude Code skills and agents, to make the vision complete end to end.

## Spike Findings

5 spikes executed (all CONFIRMED quality):
- **Frontend (3r3.1)**: 40 items — 15 exist, 7 partial, 18 missing. Phases III/IV/VII almost entirely absent.
- **MCP tools (3r3.2)**: 22 existing, 17 missing. Critical gaps: Rank, Slice, Delegation tools.
- **Domain model (3r3.3)**: 5/8 bounded contexts exist. Missing: Prioritization, Decomposition, Delegation.
- **Real-time (3r3.4)**: WebSocket solid. Missing: presence, viewing, activity, approval queue.
- **Claude Code (3r3.5)**: Team/agents/architecture mature. Gaps: stories, e2e, fixtures.

## Priority Order

1. 3r3.6 PrioritizationService (P1) — blocks Phase III MCP + UI
2. 3r3.7 DecompositionService (P1) — blocks Phase IV MCP + UI
3. 3r3.10 DraftService (P1) — blocks Phase I MCP + UI
4. 3r3.9 ComparisonService (P1) — event-sourced wrapper
5. 3r3.15 Cross-cutting MCP tools (P1) — lowest effort
6. 3r3.11 Phase III MCP tools (P1) — depends on 3r3.6
7. 3r3.12 Phase IV MCP tools (P1) — depends on 3r3.7
8. 3r3.13 Phase I-II MCP tools (P1) — depends on 3r3.10
9. 3r3.14 Phase V-VII MCP tools (P1) — no deps
10. 3r3.24 Presence indicators (P1) — high impact, low effort
11. 3r3.17 Priority View UI (P1) — depends on 3r3.6
12. 3r3.18 Breakdown Editor UI (P1) — depends on 3r3.7
13. 3r3.16 Spark Canvas UI (P1) — depends on 3r3.10
14. 3r3.19 Compliance Badge (P1) — no deps
15. 3r3.20 Integration Dashboard (P1) — no deps
16. 3r3.21 Settings Dialog (P1) — no deps
17. 3r3.30 E2E tests (P1) — depends on 3r3.31
18. 3r3.8 DelegationService (P2) — blocks approval queue
19. 3r3.22 Approval Queue UI (P2) — depends on 3r3.8
20. 3r3.31 Fixtures (P2) — blocks e2e tests
21. 3r3.23 Component enhancements (P2) — polish
22. 3r3.25 Activity pulse (P2) — polish
23. 3r3.26 Keyboard shortcuts (P2) — polish
24. 3r3.27 URL join + clipboard (P2) — convenience
25. 3r3.28 Onboarding overlays (P2) — polish
26. 3r3.29 Storybook coverage (P2) — quality

## Task IDs

| BD ID | Title | Priority | Status | Assigned Agent |
|-------|-------|----------|--------|----------------|
| 3r3.6 | Create PrioritizationService bounded context | P1 | open | architect |
| 3r3.7 | Create DecompositionService bounded context | P1 | open | architect |
| 3r3.8 | Create DelegationService bounded context | P2 | open | architect |
| 3r3.9 | Create ComparisonService (event-sourced) | P1 | open | architect |
| 3r3.10 | Create DraftService | P1 | open | architect |
| 3r3.11 | Phase III MCP tools | P1 | open | architect |
| 3r3.12 | Phase IV MCP tools | P1 | open | architect |
| 3r3.13 | Phase I-II MCP tools | P1 | open | architect |
| 3r3.14 | Phase V-VII MCP tools | P1 | open | architect |
| 3r3.15 | Cross-cutting MCP tools | P1 | open | architect |
| 3r3.16 | Spark Canvas + Draft Editor | P1 | open | component |
| 3r3.17 | Priority View + Voting widgets | P1 | open | component |
| 3r3.18 | Breakdown Editor + Dependency Graph | P1 | open | component |
| 3r3.19 | Compliance Badge + Drift Notifications | P1 | open | component |
| 3r3.20 | Integration Dashboard + Go/No-Go | P1 | open | component |
| 3r3.21 | Global Settings Dialog + Settings Drawer | P1 | open | component |
| 3r3.22 | Approval Queue + Delegation UI | P2 | open | component |
| 3r3.23 | Enhance existing components | P2 | open | component |
| 3r3.24 | Presence dots + viewing indicators | P1 | open | architect |
| 3r3.25 | Activity pulse + celebration moments | P2 | open | component |
| 3r3.26 | Keyboard shortcuts system | P2 | open | logic |
| 3r3.27 | URL join + clipboard paste | P2 | open | component |
| 3r3.28 | First-time help + onboarding | P2 | open | component |
| 3r3.29 | Storybook coverage | P2 | open | component |
| 3r3.30 | E2E tests Phases III-VII | P1 | open | tester |
| 3r3.31 | Fixtures for Rank/Slice/Build/Ship | P2 | open | logic |

## Critical Path

```
PrioritizationService (3r3.6) → Phase III MCP (3r3.11) → Priority View UI (3r3.17)
DecompositionService (3r3.7) → Phase IV MCP (3r3.12) → Breakdown Editor UI (3r3.18)
DraftService (3r3.10) → Phase I-II MCP (3r3.13) + Spark Canvas UI (3r3.16)
Fixtures (3r3.31) → E2E tests (3r3.30)
```

Longest chain: 3 tasks. Minimum 3 sprints for critical path.

## Parallel Opportunities

**Wave 1**: 3r3.6 + 3r3.7 + 3r3.9 + 3r3.10 (services) | 3r3.15 + 3r3.14 (MCP) | 3r3.19 + 3r3.20 + 3r3.21 (UI) | 3r3.24 + 3r3.26 + 3r3.31 (infra)
**Wave 2**: 3r3.11 + 3r3.12 + 3r3.13 (MCP) | 3r3.16 + 3r3.17 + 3r3.18 (UI)
**Wave 3**: 3r3.8 + 3r3.22 + 3r3.23 + 3r3.25 + 3r3.27 + 3r3.28 + 3r3.29 + 3r3.30 (polish + test)
