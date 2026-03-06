# Seam

Collaborative sessions where humans and AI agents work together in real time.

## Operating Mode: Orchestrator

**The primary Claude Code session operates as an orchestrator only.** Do not directly implement tasks -- instead, dispatch work to specialized subagents.

### Orchestrator Responsibilities

1. **Task Dispatch**: Delegate implementation work to appropriate subagents via the Task tool
2. **Coordination**: Manage dependencies between tasks, unblock work, review agent outputs
3. **Backlog Management**: Use `bd` commands to triage, prioritize, and track issues
4. **Session Management**: Run `bd sync` before completing sessions

### Serialized Dispatching

**Dispatch tasks one at a time, not in parallel.** This approach:
- Avoids API throttling, enabling longer uninterrupted work sessions
- Allows learning from each task's output before starting the next
- Reduces context bloat from concurrent agent results

Workflow: dispatch -> wait for completion -> review -> dispatch next task

## Quick Reference

```bash
just dev                  # Start everything (infra + server + frontend)
just dev-noauth           # Same but with MCP auth disabled
just worker               # Start the seam-worker (event bridge + scheduler)
just test                 # cargo test (server)
just check-all            # cargo check + tsc --noEmit
just token                # Get test JWT from Keycloak
```

## Skill Quick Reference

| I want to... | Use |
|---|---|
| Work in a Seam session | /seam |
| Drive a feature sprint | /seam-drive |
| Plan implementation | /seam-plan |
| Review code | /seam-review |
| Run standup | /seam-standup |
| Triage tasks | /seam-triage |

## Architecture

- **Frontend**: `frontend/` — Lit web components + Vite + Tailwind + Shoelace
- **Backend**: `server/` — Rust (Axum) with PostgreSQL
- **Auth**: Keycloak OIDC (realm: `seam`, client: `web-app` public PKCE)
- **Sandboxes**: Coder workspaces for agent task execution (optional)
- **Worker**: `server/src/bin/worker.rs` — seam-worker binary (event bridge + reactions + scheduler)
- **Message Queue**: RabbitMQ (topic exchange `seam.events`, queue `seam.reactions`)
- **Infra**: Docker Compose (Keycloak + Postgres + RabbitMQ; Coder via `--profile coder`)

## Data Model

```
Organization (tenant) → Project → Session → Participants (human/agent)
```

- Sessions have human join codes (shareable, 6 chars)
- Each human gets a per-session agent join code (8 chars) for their AI agents
- RBAC: org (owner/admin/member), project (admin/member/viewer), session (host/participant)

## Development

```bash
docker compose up -d          # Keycloak + Postgres
cd server && cargo run         # Rust API on :3002
cd frontend && npm run dev     # Vite on :5173
```

Test user: `testuser` / `testpass` (Keycloak)

### Coder Integration (optional)

```bash
docker compose --profile coder up -d   # Add Coder on :7080
./infra/coder/setup.sh                 # Push seam-agent template
# Set env vars for the Seam server:
export CODER_URL=http://localhost:7080
export CODER_TOKEN=<coder tokens create --name seam-integration>
```

Health check: `GET /api/integrations/coder/status`

## MCP Access

Agents connect via Streamable HTTP at `/mcp`. Two auth methods:

1. **Keycloak JWT** — external clients authenticate via OAuth; auto-discovered from `/.well-known/oauth-protected-resource`
2. **Agent tokens** (`sat_` prefix) — server-spawned agents get opaque tokens injected as `SEAM_TOKEN`; validated via SHA-256 hash lookup in `agent_tokens` table

```json
{
  "mcpServers": {
    "seam": {
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

For local dev, set `MCP_AUTH_DISABLED=true` (or use `just dev-noauth`) to skip auth on `/mcp`.

After connecting, agents call `join_session` with their agent code (plus optional `client_name`, `client_version`, `model`) to enter a session. Each join creates a new participant record with composition metadata — agents have no persistent identity table.

## Frontend Routing

Uses `@vaadin/router` (History API, not hash-based). Route config in `frontend/src/router.ts`.

- `/projects` — project list
- `/projects/:id` — project workspace (overview)
- `/projects/:id/:tab` — project workspace tab (graph, settings, tasks, plans, agents)
- `/projects/:id/tasks/:ticketId` — deep-link to task
- `/projects/:id/plans/:planId` — deep-link to plan
- `/projects/:id/agents/:agentId` — deep-link to agent detail
- `/sessions/:code` — session lobby
- `/sessions/:code/tasks/:ticketId` — in-session task deep-link

Navigation: use `navigateTo('/path')` from `router.ts`, never `window.location.hash`.
Router sets `location` property on routed components (params available via `this.location.params`).

## Agent Observability

Real-time streaming of agent activity via multiplexed WebSocket channels.

### Streams

Three stream types on the existing `/ws` connection, discriminated by `stream` field:

- **`tool`** — MCP tool invocations (captured server-side in `mcp_handler.rs`), stored in `tool_invocations` table
- **`output`** — Process stdout/stderr from Coder workspaces, ingested via `POST /api/workspaces/:id/logs`
- **`state`** — Agent lifecycle transitions (joined, working, idle), emitted via PG NOTIFY

### WebSocket Protocol

Clients subscribe to specific agents:
```jsonc
{"type": "subscribe_agent", "participantId": "uuid"}
{"type": "unsubscribe_agent", "participantId": "uuid"}
```

Server sends filtered `agent_stream` messages only to subscribed connections.

### Key Endpoints

- `GET /api/sessions/:code/tool-invocations` — historical tool calls (filterable by participant_id, tool_name)
- `POST /api/workspaces/:id/logs` — log line ingest from Coder sidecar
- `GET /api/workspaces/:id/logs` — recent log lines from ring buffer

### Frontend Components

- `agent-stream.ts` — WebSocket service managing subscriptions with auto-reconnect
- `agent-activity-panel.ts` — Tabbed panel (All/Tools/Output) with live indicator and state badges
- Integrated into `agent-detail.ts` for online agents

## Agent Git Workflow

Agents get a structured git workflow for propagating changes back to the repo.

### Branch Management
- If no branch specified at launch, server auto-generates `agent/<type>-<short-workspace-id>` (e.g. `agent/coder-a1b2c3d4`)
- Template checks out the branch (creates it if it doesn't exist remotely)
- Branch name is returned in the launch response and shown in the UI

### Push Credentials
- Git credential helper is configured in the Coder template using `GIT_TOKEN` from injected credentials
- Store a `git_token` credential (org or personal) with push access for agents to push
- Without `GIT_TOKEN`, agents can commit locally but cannot push

### Push Instructions
- Server auto-appends push instructions to the agent prompt: "commit and push branch with `git push -u origin <branch>`"
- User-provided instructions are preserved and the push reminder is appended

### Credential Types (env var mapping)
- `claude_oauth` → `CLAUDE_CODE_OAUTH_TOKEN`
- `anthropic_api_key` → `ANTHROPIC_API_KEY`
- `git_token` → `GIT_TOKEN`
- User credentials override org credentials of the same type

## Task Scheduler & Message Queue

Event-driven reactions and scheduled jobs, powered by RabbitMQ.

### Architecture

- **Event Bridge** (`worker/bridge.rs`): Polls `domain_events` table with cursor, publishes to RabbitMQ `seam.events` topic exchange. Routing keys: `{aggregate_type}.{event_type}`.
- **Reaction Engine** (`worker/reactions.rs`): Consumes from `seam.reactions` queue, matches against `event_reactions` table, dispatches actions.
- **Cron Scheduler** (`worker/scheduler.rs`): Polls `scheduled_jobs` table every 30s, dispatches due jobs.
- All three run as concurrent tokio tasks in the `seam-worker` binary.

### Tables

- `event_reactions` — per-project configurable reactions to domain events
- `scheduled_jobs` — per-project cron-based recurring jobs
- `event_bridge_cursor` — singleton tracking last processed event ID

### Action Types

- `launch_agent` — launch a Coder workspace with agent config
- `webhook` — HTTP callback (not yet implemented)
- `mcp_tool` — invoke an MCP tool (not yet implemented)

### API Endpoints

- `GET/POST /api/projects/:id/reactions` — list/create event reactions
- `PATCH/DELETE /api/projects/:id/reactions/:id` — update/delete
- `GET/POST /api/projects/:id/scheduled-jobs` — list/create scheduled jobs
- `PATCH/DELETE /api/projects/:id/scheduled-jobs/:id` — update/delete

### Environment

- `AMQP_URL` — RabbitMQ connection (default: `amqp://seam:seam@localhost:5672`)
- RabbitMQ management UI: `http://localhost:15672` (seam/seam)

## Conventions

- Frontend API calls go through Vite proxy (`/api` → `:3002`, `/ws` → WebSocket)
- Auth tokens: Bearer JWT from Keycloak, validated via JWKS
- Session codes: uppercase alphanumeric, no ambiguous chars (0/O, 1/I/L)
