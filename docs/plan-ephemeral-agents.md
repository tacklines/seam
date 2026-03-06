# Plan: Ephemeral Agent Invocations

## Vision

Replace the current "one workspace = one long-lived interactive Claude Code session" model with **ephemeral invocations within persistent workspaces**.

- **Workspaces** are reusable execution environments: repo cloned, tools installed, credentials injected, MCP configured. They persist, auto-pause on idle, wake on demand.
- **Invocations** are single `claude -p` (or `./agents`) calls executed inside a workspace. They run, produce output, exit. Multiple invocations can reuse the same workspace.
- **Reactions** trigger invocations — event-driven, not human-initiated (though humans can trigger too).

### Key Properties

- **Truly ephemeral processes**: No interactive session sitting idle. Process starts, does work, exits.
- **Full log capture**: All output streamed back to Seam in real-time.
- **Artifact filing**: Structured output (`--output-format json`) captured and filed on tasks.
- **Agent perspectives**: `.claude/agents/*.md` files define roles (coder, reviewer, planner) with tailored system prompts, allowed tools, and skill compositions.
- **Auto-shutdown**: Workspaces auto-pause after idle timeout. No idle resource burn.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Seam Event  │────>│  Reaction    │────>│  Invocation      │
│  (task.created,    │  Engine      │     │  Dispatcher      │
│   comment.added,   │  (worker)    │     │  (server/worker) │
│   manual trigger)  └──────────────┘     └────────┬────────┘
│                                                   │
│                                         ┌────────▼────────┐
│                                         │  Workspace Pool  │
│                                         │  (Coder)         │
│                                         │                  │
│                                         │  claude -p       │
│                                         │  --agent <role>  │
│                                         │  "task prompt"   │
│                                         └────────┬────────┘
│                                                   │
│                              stdout/stderr ───────▼───────
│                              POST /api/invocations/:id/output
│                              (or direct log forwarding)
└───────────────────────────────────────────────────────────
```

## Data Model Changes

### New: `invocations` table

```sql
CREATE TABLE invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    session_id UUID REFERENCES sessions(id),
    task_id UUID REFERENCES tasks(id),
    participant_id UUID REFERENCES participants(id),

    -- What to run
    agent_perspective TEXT NOT NULL,        -- e.g. "coder", "reviewer", "planner"
    prompt TEXT NOT NULL,                   -- the task prompt
    system_prompt_append TEXT,              -- additional system prompt context

    -- Execution state
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
    exit_code INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Output
    result_json JSONB,                     -- structured output from claude -p --output-format json
    error_message TEXT,

    -- Provenance
    triggered_by TEXT,                     -- 'reaction', 'manual', 'scheduler'
    reaction_id UUID REFERENCES event_reactions(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Modified: `workspaces` table

Workspaces become reusable pools rather than 1:1 with agents:
- Add `pool_key TEXT` — identifies the workspace's purpose (e.g. `project:<id>:branch:<name>`)
- Add `last_invocation_at TIMESTAMPTZ` — for idle detection
- Remove tight coupling to single participant

### Simplified: Agent launch flow

Current: `launch_agent` → create workspace → create participant → provision → startup script launches claude
New: `dispatch_invocation` → find/create workspace → execute `claude -p` inside it → stream output

## Phases

### Phase 1: Invocation Model (server)

- [ ] Create `invocations` migration
- [ ] `POST /api/projects/:id/invocations` — create and dispatch an invocation
- [ ] `GET /api/projects/:id/invocations` — list invocations (filterable by workspace, task, status)
- [ ] `GET /api/invocations/:id` — get invocation detail with output
- [ ] Invocation dispatcher: find workspace, execute `coder ssh <ws> -- claude -p ...`, stream output
- [ ] Domain events: invocation.started, invocation.completed, invocation.failed

### Phase 2: Workspace Pool (server + infra)

- [ ] Simplify Coder template — environment setup only, no agent launch in startup script
- [ ] Workspace pool logic: find existing workspace for project+branch, or create new
- [ ] Auto-pause: workspaces stop after N minutes idle (Coder's `auto_stop_timeout`)
- [ ] Wake-on-invoke: start paused workspace before dispatching invocation

### Phase 3: Agent Perspectives (config)

- [ ] Define perspective format: `.claude/agents/<name>.md` with system prompt, tools, skills
- [ ] Map perspectives to `claude -p` flags: `--agent <name>` or `--append-system-prompt-file`
- [ ] Default perspectives: coder (implement), reviewer (review), planner (decompose)
- [ ] MCP config generation: per-invocation `.mcp.json` with Seam server URL + auth

### Phase 4: Output Pipeline (server + frontend)

- [ ] Invocation output streaming: capture stdout from `coder ssh`, POST to Seam
- [ ] Structured result capture: parse `--output-format json` output, store in `result_json`
- [ ] Artifact filing: extract commits, file changes, test results from structured output
- [ ] WebSocket broadcast: stream invocation output to subscribed clients

### Phase 5: Frontend (UI)

- [ ] Invocation list view (per-project, per-workspace, per-task)
- [ ] Invocation detail: output stream, result, status, duration
- [ ] Launch dialog: pick perspective, optional task, custom prompt
- [ ] Workspace pool view: active workspaces, idle status, invocation history
- [ ] Replace current agent activity panel with invocation-centric view

### Phase 6: Reaction Integration (worker)

- [ ] New action type: `invoke_agent` (lighter than `launch_agent`)
- [ ] Wire reactions to invocation dispatcher
- [ ] Scheduler: periodic invocations (e.g. nightly review sweep)

## What Gets Removed/Simplified

- **Startup script agent launch**: Template no longer launches claude on boot
- **Two-forwarder pattern**: Single forwarder or direct output streaming via SSH
- **Interactive session management**: No more `/agent` slash command as primary entry point
- **1:1 workspace-participant coupling**: Workspaces serve multiple invocations

## Migration Path

1. Build invocation system alongside existing agent launch
2. Both coexist — `launch_agent` still works for interactive sessions
3. New `invoke_agent` reaction action uses the invocation system
4. Gradually migrate UI to invocation-centric views
5. Deprecate interactive agent launch when invocation model is proven

## Open Questions

- Should workspaces be scoped per-project or per-project+branch?
- How to handle git state between invocations? (stash? separate worktrees?)
- Rate limiting on invocations to prevent runaway reactions?
- How to pass large context (task details, code snippets) to `claude -p`? Prompt size limits?
