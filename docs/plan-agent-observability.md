# Agent Observability Plan

Capture and surface all agent input/output for agents running in Coder sandboxes, with streaming support across all layers.

## Vision

A unified real-time view of what every agent is doing: tool calls, process output, state transitions — all streamed to the frontend as they happen.

## Architecture

### Streaming Transport

Multiplexed WebSocket channels on existing `/ws` connection. Stream types:

```jsonc
// Tool invocation (server-side capture)
{"type": "agent_stream", "stream": "tool", "participant_id": "...",
 "data": {"tool": "create_task", "params": {...}, "result": {...}, "duration_ms": 42}}

// Process output (from Coder workspace)
{"type": "agent_stream", "stream": "output", "participant_id": "...",
 "data": {"line": "Reading task ABC-5...", "fd": "stdout", "ts": "..."}}

// State transition
{"type": "agent_stream", "stream": "state", "participant_id": "...",
 "data": {"state": "working", "task_id": "...", "detail": "implementing ABC-5"}}
```

Frontend subscribes per-agent:
```jsonc
{"type": "subscribe_agent", "participant_id": "...", "streams": ["tool", "output", "state"]}
{"type": "unsubscribe_agent", "participant_id": "..."}
```

### Phases

## Phase 1: MCP Tool Invocation Audit

**Goal**: Capture every MCP tool call with full request/response, stream in real-time.

### 1a. Database: `tool_invocations` table

```sql
CREATE TABLE tool_invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id),
    participant_id UUID NOT NULL REFERENCES participants(id),
    tool_name TEXT NOT NULL,
    request_params JSONB,
    response JSONB,
    is_error BOOLEAN NOT NULL DEFAULT false,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_invocations_session ON tool_invocations(session_id, created_at DESC);
CREATE INDEX idx_tool_invocations_participant ON tool_invocations(participant_id, created_at DESC);

-- Real-time notification
CREATE OR REPLACE FUNCTION notify_tool_invocation() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('tool_invocations', json_build_object(
        'id', NEW.id,
        'session_id', NEW.session_id,
        'participant_id', NEW.participant_id,
        'tool_name', NEW.tool_name,
        'is_error', NEW.is_error,
        'duration_ms', NEW.duration_ms
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tool_invocation_notify
    AFTER INSERT ON tool_invocations
    FOR EACH ROW EXECUTE FUNCTION notify_tool_invocation();
```

### 1b. Server: Audit recording in MCP handler

Wrap each tool call in the MCP handler to record timing + params + response. Insert into `tool_invocations` table after each call completes.

### 1c. Server: REST endpoint for history

`GET /api/sessions/:code/tool-invocations?participant_id=&limit=&before=`

Returns paginated tool invocation history for a session or specific participant.

### 1d. Server: WebSocket broadcast

Listen on PG `tool_invocations` channel, broadcast `agent_stream`/`tool` messages to subscribed clients.

## Phase 2: WebSocket Subscription Protocol

**Goal**: Let frontend clients subscribe to specific agent streams.

### 2a. Server: Subscription state in ConnectionManager

Track per-connection agent subscriptions. On `subscribe_agent` message, add participant_id to connection's subscription set. On `unsubscribe_agent`, remove it.

### 2b. Server: Filtered broadcast

When broadcasting agent_stream messages, only send to connections subscribed to that participant_id.

### 2c. Server: PG LISTEN for tool_invocations

Add `tool_invocations` to the existing `run_pg_listener` alongside `task_changes` and `domain_events`.

## Phase 3: Process Output Streaming

**Goal**: Stream agent stdout/stderr from Coder workspaces to frontend.

### 3a. Server: Log ingest endpoint

`POST /api/workspaces/:id/logs` — accepts newline-delimited log lines. Authenticated via agent token (sat_).

Request body (newline-delimited JSON):
```jsonc
{"line": "Reading task...", "fd": "stdout", "ts": "2026-03-05T10:01:04Z"}
{"line": "Error: not found", "fd": "stderr", "ts": "2026-03-05T10:01:05Z"}
```

### 3b. Server: Log storage + relay

Store recent lines in a ring buffer (in-memory, per workspace). Broadcast to subscribed WebSocket clients as `agent_stream`/`output` messages.

Optionally persist to `workspace_logs` table for historical access.

### 3c. Coder template: Log forwarder sidecar

20-line bash script that tails Claude Code's output and POSTs to the ingest endpoint:

```bash
tail -f /tmp/claude-agent.log | while IFS= read -r line; do
  curl -s -X POST "$SEAM_URL/api/workspaces/$WORKSPACE_ID/logs" \
    -H "Authorization: Bearer $SEAM_TOKEN" \
    -H "Content-Type: application/x-ndjson" \
    -d "{\"line\":$(echo "$line" | jq -Rs .),\"fd\":\"stdout\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
done
```

### 3d. Server: REST endpoint for log history

`GET /api/workspaces/:id/logs?limit=&before=` — returns recent log lines.

## Phase 4: Frontend Agent Activity Panel

**Goal**: Unified real-time view of agent streams.

### 4a. Agent stream service

Lit reactive controller that manages WebSocket subscriptions and exposes streams as reactive properties.

### 4b. Agent activity panel component

`<agent-activity-panel participant-id="...">` — shows interleaved tool calls + output + state transitions. Tool calls expandable to show params/response. Output scrolls like a terminal.

### 4c. Integration into agent detail view

Add activity panel to the existing agent detail page in the project agents tab.

## Phase 5: State Transitions

**Goal**: Granular agent lifecycle events.

### 5a. Emit state events from MCP handler

When agent joins, claims task, completes task — emit `agent_stream`/`state` via WebSocket.

### 5b. Frontend state badges

Show current agent state in agent list and detail views.

## Quality Criteria

- Tool invocations captured with <10ms overhead
- Log lines appear in frontend within 500ms of being written in sandbox
- No data loss on WebSocket reconnect (REST endpoints for backfill)
- Works with MCP_AUTH_DISABLED=true for local dev
