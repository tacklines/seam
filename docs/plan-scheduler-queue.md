# Task Scheduler & Message Queue

## Goal

Add a task scheduler/runner and event-driven reaction system to Seam, enabling:
- **Scheduled jobs**: "At this time, in this project, run this agent" (cron-like)
- **Event reactions**: When domain events fire (e.g. `task.created`), trigger automated processing (dependency detection, filing, etc.)

## Architecture Decisions

1. **RabbitMQ** as the message queue backbone (topic exchange, basic routing via `lapin`)
2. **Separate `seam-worker` binary** sharing crate modules with the server
3. **Table-polling event bridge** reading `domain_events` with cursor for at-least-once delivery
4. **Postgres-backed scheduler** with polling loop (30s granularity)
5. **`event_reactions` config table** for user-configurable reactions per project
6. **PG NOTIFY untouched** — RabbitMQ is additive (PG NOTIFY stays for WebSocket UI updates)
7. **Reuse existing Coder workspace launch** for agent execution
8. **No DLX/retry in v1** — failed messages are logged
9. RabbitMQ added to `docker-compose.yml`

## Data Model

### `event_reactions` table
```sql
CREATE TABLE event_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_type TEXT NOT NULL,          -- e.g. 'task.created', 'task.updated'
    aggregate_type TEXT NOT NULL,       -- e.g. 'task', 'session'
    filter JSONB DEFAULT '{}',         -- optional payload filter (jsonpath-like)
    action_type TEXT NOT NULL,          -- 'launch_agent', 'webhook', 'mcp_tool'
    action_config JSONB NOT NULL,      -- action-specific config
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `scheduled_jobs` table
```sql
CREATE TABLE scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cron_expr TEXT NOT NULL,            -- cron expression (5-field)
    action_type TEXT NOT NULL,          -- 'launch_agent', 'webhook', 'mcp_tool'
    action_config JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `event_bridge_cursor` table
```sql
CREATE TABLE event_bridge_cursor (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
    last_event_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## RabbitMQ Topology

- **Exchange**: `seam.events` (topic)
- **Routing keys**: `{aggregate_type}.{event_type}` (e.g. `task.created`, `session.participant_joined`)
- **Queue**: `seam.reactions` — bound with `#` initially (all events), can refine later
- **Consumer**: `seam-worker` process

## Components

### Phase 1: Infrastructure
- Add RabbitMQ to docker-compose.yml
- Add `lapin` dependency to Cargo.toml
- Create `seam-worker` binary target
- Database migration for `event_reactions`, `scheduled_jobs`, `event_bridge_cursor`

### Phase 2: Event Bridge
- `server/src/worker/bridge.rs` — polls `domain_events` table, publishes to RabbitMQ
- Cursor-based: reads events with `id > last_event_id`, advances cursor atomically
- Batch size: 100 events per poll, 5s poll interval

### Phase 3: Reaction Engine
- `server/src/worker/reactions.rs` — consumes from `seam.reactions` queue
- Matches incoming events against `event_reactions` table
- Dispatches matched actions (launch_agent via existing Coder workspace flow)
- Logs failures (no retry in v1)

### Phase 4: Scheduler
- `server/src/worker/scheduler.rs` — polls `scheduled_jobs` for due jobs
- Computes next_run_at from cron expression
- Dispatches due jobs as actions
- 30s poll interval

### Phase 5: API & Frontend
- CRUD endpoints for event_reactions and scheduled_jobs
- Project settings UI for managing reactions and schedules
- Action type: `launch_agent` config schema: `{ skill, model, prompt, session_id? }`

## Worker Binary Structure

```
server/src/bin/worker.rs     — main entry, connects to DB + RabbitMQ
server/src/worker/mod.rs     — module root
server/src/worker/bridge.rs  — event bridge (DB → RabbitMQ)
server/src/worker/reactions.rs — reaction consumer
server/src/worker/scheduler.rs — cron scheduler
```

All three subsystems run as concurrent tokio tasks in the single worker process.
