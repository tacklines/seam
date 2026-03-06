# Sprint Planning Feature

## Goal

Add drag-to-sprint planning to the project task board. Sprints are sessions pre-populated with tasks. Tasks can appear in multiple sessions, with state syncing between them.

## Current State

- Tasks have `session_id UUID` (nullable) — the originating session
- Tasks are project-scoped via `project_id` (NOT NULL, migration 004)
- A task belongs to at most one session (single FK)
- Sessions exist within projects, have codes, names, participants
- Task board shows project tasks grouped by status columns

## Design

### Data Model

**Junction table** `session_tasks` enables many-to-many:

```sql
CREATE TABLE session_tasks (
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by UUID REFERENCES users(id),
    PRIMARY KEY (session_id, task_id)
);
```

- `tasks.session_id` stays as-is (origin tracking / created-in-session)
- `session_tasks` tracks which sessions a task is planned into
- Backfill: INSERT INTO session_tasks from existing tasks WHERE session_id IS NOT NULL
- When a task is created in a session (MCP or REST), auto-insert into session_tasks too

### API

New endpoints on the project-scoped session routes:

- `POST /api/sessions/:code/tasks/add` — `{ task_ids: [uuid] }` — add existing project tasks to session
- `DELETE /api/sessions/:code/tasks/:taskId/remove` — remove task from session (doesn't delete the task)
- `GET /api/sessions/:code/tasks` — already exists, but must now query via junction table
- `GET /api/projects/:id/sessions` — already exists, returns sessions list

The existing session task listing (`GET /api/sessions/:code/tasks`) currently queries `WHERE session_id = ?`. It needs to join through `session_tasks` instead (or UNION both).

### Frontend

**Sprint lane in task board:**
- A collapsible "Sprint Planning" section at the top or right of the task board
- Dropdown to select an existing session or create a new one (with editable name)
- Tasks can be dragged from the main board into the sprint lane
- Sprint lane shows the tasks currently associated with that session
- "Start Sprint" button navigates to the session view

**Drag and drop:**
- Use HTML5 drag/drop API (already available in browsers, no library needed)
- Draggable task cards in the main board
- Drop zone in the sprint lane
- Visual feedback: highlight drop zone on dragover

## Phases

### Phase 1: Migration + Backend (session_tasks table, API endpoints)
### Phase 2: Frontend Sprint Planning UI (sprint lane, drag-drop, create sprint)
### Phase 3: Sync (session task listing uses junction table, MCP auto-populates it)
