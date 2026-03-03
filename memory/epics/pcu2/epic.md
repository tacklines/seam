# Epic: Seam rebrand and complete workflow experience

**Epic ID**: multi-human-workflows-pcu2
**Created**: 2026-03-02
**Source**: /blossom
**Goal**: Transform Multi-Human Workflows into Seam — rebrand all surfaces, fill UX gaps, ensure complete Spark-to-Ship journey for technologically inept users.

## Spike Findings

1. **Rebrand config/docs to Seam** — 15 confirmed brand occurrences across 11 files
   - source: package.json, README, CLAUDE.md, team.yaml, index.html, mcp.ts, a2a.ts, i18n.ts, docs/
   - confidence: CONFIRMED
   - priority: P1
   - agent: architect

2. **Auto-advance from lobby after submission** — Users stuck in lobby after file upload
   - source: session-lobby.ts:471-501
   - confidence: CONFIRMED
   - priority: P1
   - agent: component

3. **Disabled-tab tooltips** — Greyed tabs give no explanation
   - source: app-shell.ts:781-812
   - confidence: CONFIRMED
   - priority: P1
   - agent: component

4. **Phase transition CTAs** — No "what to do next" prompts
   - source: suggestion-bar.ts, empty-state.ts
   - confidence: CONFIRMED
   - priority: P1
   - agent: component

5. **Live collaboration indicators** — No participant view tracking
   - source: experience-design.md:519-524
   - confidence: CONFIRMED
   - priority: P1
   - agent: architect + component

6. **YAML validation error messages** — Raw schema errors shown to users
   - source: yaml-loader.ts
   - confidence: CONFIRMED
   - priority: P2
   - agent: logic

7. **YAML format help** — No template download or format explanation
   - source: onboarding-overlay.ts, file-drop-zone.ts
   - confidence: CONFIRMED
   - priority: P2
   - agent: component

8. **Re-accessible help** — Tips dismissed permanently
   - source: help-tip.ts
   - confidence: CONFIRMED
   - priority: P2
   - agent: component

9. **URL auto-join** — No /?session=X&name=Y support
   - source: experience-design.md:509
   - confidence: LIKELY
   - priority: P2
   - agent: component

10. **Negotiation progress bar** — No X of Y conflicts resolved indicator
    - source: experience-design.md:296
    - confidence: LIKELY
    - priority: P2
    - agent: component

11. **Detail panel break-down button** — No expand-to-50% behavior
    - source: experience-design.md:228-230
    - confidence: LIKELY
    - priority: P2
    - agent: component

12. **create_work_items schema mismatch** — Spec vs implementation divergence
    - source: mcp.ts:1388-1424 vs experience-design.md:698-708
    - confidence: CONFIRMED
    - priority: P2
    - agent: architect

## Priority Order

1. pcu2.5 — Rebrand config files (P1, unblocks 4 tasks)
2. pcu2.11 — Auto-advance from lobby (P1, high user impact)
3. pcu2.12 — Disabled-tab tooltips (P1, unblocks pcu2.14)
4. pcu2.18 — Live collaboration indicators (P1)
5. pcu2.6 — Rebrand index.html (P1, blocked by pcu2.5)
6. pcu2.7 — Rebrand i18n (P1, blocked by pcu2.5)
7. pcu2.8 — Rebrand server identity (P1, blocked by pcu2.5)
8. pcu2.9 — Rename docs (P1, blocked by pcu2.5)
9. pcu2.14 — Phase transition CTAs (P1, blocked by pcu2.12)
10. pcu2.13 — YAML error messages (P2)
11. pcu2.15 — YAML format help (P2)
12. pcu2.16 — Re-accessible help (P2)
13. pcu2.19 — URL auto-join (P2)
14. pcu2.20 — Negotiation progress bar (P2)
15. pcu2.21 — Detail panel break-down (P2)
16. pcu2.10 — Settings label rebrand (P2, blocked by pcu2.7)
17. pcu2.17 — create_work_items schema (P2)

## Task IDs

| BD ID | Title | Priority | Status | Agent |
|-------|-------|----------|--------|-------|
| pcu2.5 | Rebrand config files to Seam | P1 | open | architect |
| pcu2.6 | Rebrand index.html | P1 | open | component |
| pcu2.7 | Rebrand i18n messages | P1 | open | logic |
| pcu2.8 | Rebrand server identity | P1 | open | architect |
| pcu2.9 | Rename docs files | P1 | open | architect |
| pcu2.10 | Settings dialog label | P2 | open | component |
| pcu2.11 | Auto-advance from lobby | P1 | open | component |
| pcu2.12 | Disabled-tab tooltips | P1 | open | component |
| pcu2.13 | YAML error messages | P2 | open | logic |
| pcu2.14 | Phase transition CTAs | P1 | open | component |
| pcu2.15 | YAML format help | P2 | open | component |
| pcu2.16 | Re-accessible help | P2 | open | component |
| pcu2.17 | create_work_items schema | P2 | open | architect |
| pcu2.18 | Live collaboration indicators | P1 | open | architect+component |
| pcu2.19 | URL auto-join | P2 | open | component |
| pcu2.20 | Negotiation progress bar | P2 | open | component |
| pcu2.21 | Detail panel break-down | P2 | open | component |

## Critical Path

pcu2.5 → pcu2.7 → pcu2.10 (rebrand chain: config → i18n → settings label)
pcu2.12 → pcu2.14 (UX chain: tooltips → phase CTAs)

## Parallel Opportunities

Wave 1 (no deps): pcu2.5, pcu2.11, pcu2.12, pcu2.13, pcu2.15, pcu2.16, pcu2.18, pcu2.19, pcu2.20, pcu2.21
Wave 2 (after pcu2.5): pcu2.6, pcu2.7, pcu2.8, pcu2.9
Wave 3 (after pcu2.7, pcu2.12): pcu2.10, pcu2.14
