# Design: Plans and Design Documents System

Status: Draft

## Problem

Seam has tasks and sessions, but no place to capture the *why* and *how* before work starts. Plans, designs, and architectural decisions need a home that:

- Lives alongside the project, not scattered in external docs
- Can be referenced by tasks ("implements design X")
- Supports iterative refinement (drafts -> review -> accepted)
- Is visible to both humans and agents during sessions

## What is a "Plan"?

A plan is a structured document attached to a project that describes intended work before execution. This covers:

- **Design docs** (how a feature should work)
- **Architecture decisions** (why we chose approach X)
- **Implementation plans** (ordered steps to achieve a goal)
- **Spikes/investigations** (what we learned exploring an area)

## Data Model

```sql
CREATE TABLE plans (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    body TEXT NOT NULL,             -- markdown content
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'accepted', 'superseded', 'abandoned')),
    parent_id UUID REFERENCES plans(id),  -- supersedes relationship
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, slug)
);

-- Tasks can reference the plan they implement
ALTER TABLE tasks ADD COLUMN plan_id UUID REFERENCES plans(id);
```

## Status Lifecycle

```
draft -> review -> accepted -> superseded
                            -> abandoned
draft -> abandoned
```

## Key Features

- **Markdown body** with full rendering (we already have marked + DOMPurify)
- **Task linkage** tasks reference the plan they implement
- **Versioning** superseded plans link to their replacement via parent_id
- **Comments** reuse existing comment system (extend to plan_id)
- **Session context** agents in a session can query plans for the project to understand intent

## API Surface

- `POST /api/projects/:id/plans` create plan
- `GET /api/projects/:id/plans` list plans (filterable by status)
- `GET /api/plans/:id` get plan with body
- `PUT /api/plans/:id` update plan (title, body, status)
- `GET /api/tasks?plan_id=:id` tasks implementing a plan

## Open Questions

- Should plans support collaborative editing (CRDT/OT), or is it single-author with comments?
- Do agents need write access to plans, or only read?
- Should we version plan body edits (full history), or just track status transitions?
- Relationship to notes (which already exist) -- are plans a structured superset of notes?
