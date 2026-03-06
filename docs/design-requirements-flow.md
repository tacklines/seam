# Design: Request-to-Requirements Flow

**Status**: Draft
**Date**: 2026-03-05

## Problem

A human says "I want X functionality." Today, that request lives in chat or a session note — ephemeral context that doesn't connect to the structured work it produces. We want a system where:

1. A human's request is captured as a durable entity
2. An agent automatically analyzes the request against existing project features/requirements
3. The agent decomposes the request into requirements (and sub-requirements) with linked tasks
4. Everything is browsable in the project UI
5. Multiple requests can share requirements (many-to-many)

## What We Have Today

| Layer | Status | Notes |
|---|---|---|
| **Requirements** (schema + MCP tools + routes) | Built | migration 017, full CRUD, hierarchy via parent_id, linked to tasks via requirement_tasks junction |
| **Tasks** (schema + MCP + routes + frontend) | Built | Full lifecycle with provenance, dependencies, commit tracking |
| **Plans** (schema + routes + frontend) | Built | Design docs with status workflow, but disconnected from requirements |
| **Requirements frontend** | Missing | No UI components exist |
| **Request entity** | Missing | No concept of "user request" as a trackable entity |
| **Automated agent dispatch** | Partially built | Event reactions exist (event_reactions table + worker) but not wired to request creation |

## Conceptual Model

```
Request (human intent)
  "I want real-time collaboration on documents"
    |
    | 1:N (a request produces requirements)
    | N:1 (a requirement can serve multiple requests)
    |
Requirement (goal / acceptance criterion)
  "Real-time cursor presence"
  "Conflict-free concurrent editing"
  "Document version history"
    |
    | 1:N (a requirement drives tasks)
    | N:1 (a task can satisfy multiple requirements)
    |
Task (implementation work)
  "Implement CRDT merge logic"
  "Add cursor position WebSocket channel"
  "Build version diff UI"
```

### Are Features and Requirements Distinct?

Short answer: **no, not as separate entities.** A "feature" is just a requirement at a certain altitude.

- Top-level requirements = features ("Real-time collaboration")
- Child requirements = acceptance criteria ("Cursor presence", "Conflict resolution")
- The hierarchy already exists via `parent_id` on requirements

Adding a separate `features` table would create a modeling headache (where does a "feature" end and a "requirement" begin?) without adding real value. Instead, we use **requirement depth** as the signal:

- Depth 0 (no parent) = feature-level
- Depth 1+ = sub-requirements / acceptance criteria

The UI can present depth-0 requirements as "Features" and children as "Requirements" if that labeling helps humans.

### What Is a "Request"?

A request is a **user's original intent** — the natural-language ask before decomposition. It's the provenance record that answers "why do these requirements exist?"

Key properties:
- Authored by a human (or on behalf of one)
- Raw/unstructured — the human's words, not the agent's decomposition
- Links to the session where it was made
- Links to the requirements it produced (many-to-many)
- Has a status: `pending` (just submitted), `analyzing` (agent working), `decomposed` (requirements created), `archived`

## Data Model

### New: `requests` table

```sql
CREATE TABLE requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id UUID REFERENCES sessions(id),
    author_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,           -- short summary (agent-generated or human-provided)
    body TEXT NOT NULL,            -- the human's original words
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'analyzing', 'decomposed', 'archived')),
    analysis TEXT,                 -- agent's analysis/reasoning (markdown)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE request_requirements (
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    PRIMARY KEY (request_id, requirement_id)
);

CREATE INDEX idx_requests_project ON requests(project_id, status);
CREATE INDEX idx_request_requirements_req ON request_requirements(requirement_id);
```

### Existing: `requirements` table (no schema changes needed)

Already has: hierarchy (parent_id), task linking (requirement_tasks), project scoping, session attribution, status workflow.

### Relationship Summary

```
requests ──M:N──> requirements ──M:N──> tasks
              request_requirements    requirement_tasks
```

- A request links to the requirements it drove
- A requirement can be linked from multiple requests (shared pool)
- A requirement links to the tasks that implement it
- A task can satisfy multiple requirements

## The Flow

### 1. Human submits a request

In the session UI, a human types their request. This creates a `requests` row with status=`pending`.

Could be:
- A dedicated "Request" input in the session lobby
- A chat message with a `/request` prefix
- A button in the project view ("New Feature Request")

### 2. Domain event triggers agent dispatch

```
request.created → event_reactions → launch_agent (blossom skill)
```

The event reaction is a per-project configuration:
```json
{
    "event_type": "request.created",
    "action_type": "launch_agent",
    "action_config": {
        "skill": "blossom",
        "prompt_template": "Analyze this feature request against the project's existing requirements and features. Decompose into requirements and tasks.\n\nRequest: {{body}}\n\nUse list_requirements to see existing requirements. Use create_requirement to add new ones. Link them with link_requirement_task."
    }
}
```

Request status transitions to `analyzing`.

### 3. Agent analyzes and decomposes

The blossom agent:

1. **Reads existing requirements** via `list_requirements` MCP tool
2. **Reads existing tasks** via `list_tasks` to understand what's already planned/done
3. **Analyzes the gap** between what exists and what the request needs
4. **Creates requirements** (or links to existing ones if they already cover it)
5. **Decomposes requirements into tasks** via `create_task` + `link_requirement_task`
6. **Links requirements back to the request** via a new `link_request_requirement` MCP tool
7. **Writes analysis** — the agent's reasoning about how the request maps to requirements

### 4. Request marked as decomposed

Agent updates request status to `decomposed`. The analysis field contains the agent's reasoning.

### 5. Human reviews in UI

The project detail page shows:
- **Requests tab**: list of all requests with status badges
- **Requirements tab**: tree view of requirements (features at top, sub-requirements nested)
- Clicking a request shows: original text, agent analysis, linked requirements
- Clicking a requirement shows: description, linked requests (provenance), linked tasks (implementation)
- Cross-navigation: request → requirements → tasks → commits

## MCP Tools (New)

### `create_request`
Create a feature request on behalf of a user (or from agent analysis).
- `title`: Short summary
- `body`: Full request text
- Returns: request ID

### `get_request`
Get request details with linked requirements.

### `list_requests`
List requests with optional status filter.

### `update_request`
Update status or analysis text.

### `link_request_requirement`
Associate a requirement with its originating request.

### `unlink_request_requirement`
Remove association.

## Frontend: Project Requirements View

### Project Detail — New Tabs

Add to the existing project detail page (`/projects/:id/:tab`):

**Requests tab** (`/projects/:id/requests`)
- List of requests with status badges (pending/analyzing/decomposed/archived)
- Each row: title, author, date, requirement count
- Click → request detail inline or deep-link

**Requirements tab** (`/projects/:id/requirements`)
- Tree view: top-level requirements (features) with expandable children
- Each node: title, status badge, task count, request count
- Filters: status, priority
- Click → requirement detail with linked tasks and requests

### Request Detail View

- Original request body (the human's words)
- Agent analysis (markdown, collapsible)
- Linked requirements (chips/cards, clickable)
- Status with transition controls
- Session attribution

### Requirement Detail View

- Title + description
- Status + priority
- Parent/children hierarchy
- Linked tasks (with status, clickable)
- Linked requests (provenance — "this requirement exists because of these requests")

## Integration with Existing Systems

### Event Reactions (already built)

The `event_reactions` table + worker reaction engine already supports `launch_agent` actions. We just need:
1. Emit `request.created` domain event
2. Configure a default reaction per project (or let users configure it)

### Plans

Plans remain separate — they're design documents, not requirements. But a plan could reference requirements by ID in its markdown body, and we could render those as links in the UI.

### Dependency Graph

The existing dependency graph (`/projects/:id/graph`) shows task dependencies. We could add a "requirements view" that shows the requirements → tasks graph, giving a higher-altitude view of project progress.

### Session Scoping

Requests are created in sessions but live at the project level. The session_id on the request records where it originated. Requirements created by the blossom agent inherit the session context.

## What This Enables

1. **Traceability**: Human intent → requirements → tasks → commits. Full chain.
2. **Deduplication**: When a new request overlaps with existing requirements, the agent links rather than duplicates.
3. **Progress visibility**: "Request X is 60% satisfied" (3 of 5 linked requirements have status=satisfied).
4. **Shared requirements**: Two requests for different features might both need "i18n support" — one requirement serves both.
5. **Agent-in-the-loop**: The decomposition agent adds intelligence at the translation layer. Humans state intent; agents do the structured breakdown.

## Open Questions

1. **Should requests be submittable outside sessions?** Currently session_id is optional. A project-level "submit request" makes sense for async workflows.

2. **How much agent autonomy?** Should the blossom agent auto-create tasks, or just requirements? Creating tasks might be premature — a human might want to review requirements before tasking.
   - **Proposed**: Agent creates requirements + suggests tasks (as draft status). Human promotes to open.

3. **Requirement satisfaction tracking**: When all linked tasks are closed, should the requirement auto-transition to `satisfied`? Or require human confirmation?
   - **Proposed**: Auto-suggest, human confirms. Domain event: `task.closed` → check if all tasks for a requirement are done → notify.

4. **Request editing**: Can a human refine their request after submission? If so, should that re-trigger analysis?
   - **Proposed**: Yes, editing resets status to `pending` and can re-trigger the reaction.

5. **Existing requirements without requests**: Requirements created directly (not from a request) are valid. Not every requirement needs a request parent — some come from technical analysis, audits, etc.

## Implementation Phases

### Phase 1: Request Entity + MCP Tools
- Migration: requests + request_requirements tables
- MCP tools: create/get/list/update request, link/unlink request↔requirement
- Domain event: request.created
- Default event reaction configuration

### Phase 2: Frontend — Requirements Tab
- Project detail: requirements tree view
- Requirement detail: linked tasks + requests
- This makes the existing (but invisible) requirements system usable

### Phase 3: Frontend — Requests Tab
- Project detail: requests list
- Request detail: body, analysis, linked requirements
- Request submission UI (in session or project-level)

### Phase 4: Automated Blossom Dispatch
- Wire request.created event to launch_agent reaction
- Blossom skill enhancement: awareness of existing requirements, gap analysis
- Agent writes analysis back to request entity

### Phase 5: Progress Tracking
- Requirement satisfaction percentage (based on linked task statuses)
- Request completion percentage (based on linked requirement statuses)
- Dashboard/overview in project detail
