# Epic: Schema-Journey Alignment Audit

**Epic ID**: multi-human-workflows-nkf
**Created**: 2026-03-01
**Source**: /blossom
**Goal**: Audit YAML schema and TypeScript types against the 5-step journey (prep→jam→formalize→build→integrate) described in the guiding docx files. Optimize schema structure to cleanly represent the workflow.

## Spike Findings

1. **Evaluate schema broadening: domain events vs practical artifacts** — Docs describe storm-prep covering API endpoints, DB schemas, component props, event queues — current schema only models DDD domain events
   - source: src/schema/candidate-events.schema.json, docs/multi-human-howto.md
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: none
   - agent: architect

2. **Add trigger type enum or known-types guidance** — trigger field is free-form but UI maps to 5 known types with i18n fallback
   - source: src/schema/candidate-events.schema.json:69-71, detail-panel.ts:32-35
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: nkf.5
   - agent: schema-evolve

3. **Surface metadata.scope and metadata.goal in UI** — Required in schema, scored in completeness, never displayed
   - source: src/lib/prep-completeness.ts:88-95
   - confidence: CONFIRMED
   - priority: P1
   - depends-on: none
   - agent: lit-component

4. **Reconcile Participant types across server and client** — Three parallel definitions with different fields
   - source: session-store.ts:26-30, app-state.ts:6-14, domain-events.ts:26-31
   - confidence: LIKELY
   - priority: P2
   - depends-on: none
   - agent: architect

5. **Remove or document sources field on DomainEvent** — Never consumed by any component or lib function
   - source: candidate-events.schema.json:83-90
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: nkf.5
   - agent: schema-evolve

6. **Centralize confidence/direction color mappings** — Hardcoded in 3 components
   - source: detail-panel.ts:23-27, event-card.ts:9-19, assumption-list.ts:10-23
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: none
   - agent: lit-component

7. **Add realistic fixture matching docs' practical style** — session-orchestration.yaml too DDD-heavy
   - source: src/fixtures/, docs/multi-human-howto.md
   - confidence: CONFIRMED
   - priority: P2
   - depends-on: nkf.5
   - agent: general-purpose

8. **Evaluate removing event_count/assumption_count from metadata** — UI always recomputes from array lengths
   - source: candidate-events.schema.json:32-41
   - confidence: CONFIRMED
   - priority: P3
   - depends-on: nkf.5
   - agent: schema-evolve

## Priority Order

1. nkf.5 — Evaluate schema broadening (P1, gates 4 tasks)
2. nkf.7 — Surface metadata in UI (P1, independent)
3. nkf.6 — Add trigger type enum (P1, blocked by nkf.5)
4. nkf.8 — Reconcile Participant types (P2, independent)
5. nkf.10 — Centralize color mappings (P2, independent)
6. nkf.9 — Document sources field (P2, blocked by nkf.5)
7. nkf.11 — Add realistic fixture (P2, blocked by nkf.5)
8. nkf.12 — Evaluate metadata counts (P3, blocked by nkf.5)

## Task IDs

| BD ID | Title | Priority | Status | Assigned Agent |
|-------|-------|----------|--------|----------------|
| nkf.5 | Evaluate schema broadening | P1 | open | architect |
| nkf.6 | Add trigger type enum | P1 | open | schema-evolve |
| nkf.7 | Surface metadata.scope/goal in UI | P1 | open | lit-component |
| nkf.8 | Reconcile Participant types | P2 | open | architect |
| nkf.9 | Remove/document sources field | P2 | open | schema-evolve |
| nkf.10 | Centralize color mappings | P2 | open | lit-component |
| nkf.11 | Add realistic fixture | P2 | open | general-purpose |
| nkf.12 | Evaluate metadata counts | P3 | open | schema-evolve |

## Critical Path

nkf.5 (schema broadening) → nkf.6 (trigger enum) → done

## Parallel Opportunities

Independent tasks (can run simultaneously):
- nkf.7: Surface metadata in UI
- nkf.8: Reconcile Participant types
- nkf.10: Centralize color mappings
