# Seam

Collaborative sessions where humans and AI agents work together in real time.

## Operating Mode: Orchestrator

**The primary Claude Code session operates as an orchestrator only.** Do not directly implement tasks -- instead, dispatch work to specialized subagents.

### Orchestrator Responsibilities

1. **Task Dispatch**: Delegate implementation work to appropriate subagents via the Task tool
2. **Coordination**: Manage dependencies between tasks, unblock work, review agent outputs
3. **Task Tracking**: Use your preferred task tracking approach to triage, prioritize, and track tasks

### Parallel Worktree Dispatching

**Dispatch independent tasks in parallel using worktree isolation.** For tasks with no dependencies between them, use `isolation: "worktree"` + `run_in_background: true` to run them concurrently. This maximizes throughput by letting independent work proceed simultaneously.

Serial dispatch (dispatch -> wait -> review -> dispatch next) is reserved for tasks with true sequential dependencies, where one task's output is required as input to the next.

## Quick Reference

```bash
just dev                  # Start everything (infra + server + frontend)
just dev-noauth           # Same but with MCP auth disabled
just worker               # Start the seam-worker (event bridge + scheduler)
just test                 # cargo test (server)
just check-all            # cargo check + tsc --noEmit
just token                # Get test JWT from Hydra
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
- **Auth**: Ory Hydra (OAuth2/OIDC) + Ory Kratos (identity)
- **Sandboxes**: Coder workspaces for agent task execution (optional)
- **Worker**: `server/src/bin/worker.rs` — seam-worker binary (event bridge + reactions + scheduler)
- **Message Queue**: RabbitMQ (topic exchange `seam.events`, queue `seam.reactions`)
- **Infra**: Docker Compose (Hydra + Kratos + Postgres + RabbitMQ; Coder via `--profile coder`)

## Data Model

```
Organization (tenant) → Project → Session → Participants (human/agent)
```

- Sessions have human join codes (shareable, 6 chars)
- Each human gets a per-session agent join code (8 chars) for their AI agents
- RBAC: org (owner/admin/member), project (admin/member/viewer), session (host/participant)

## Development

```bash
docker compose up -d          # Hydra + Kratos + Postgres
cd server && cargo run         # Rust API on :3002
cd frontend && npm run dev     # Vite on :5173
```

Test user: register at http://localhost:5173/auth/register (Kratos)

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

Agents connect via Streamable HTTP at `/mcp`. Auth via Hydra JWT:

1. **Hydra JWT** — all clients (external and agent) authenticate via OAuth; auto-discovered from `/.well-known/oauth-protected-resource`

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
- `/projects/:id/:tab` — project workspace tab (graph, settings, tasks, plans, agents, workspaces)
- `/projects/:id/tasks/:ticketId` — deep-link to task
- `/projects/:id/plans/:planId` — deep-link to plan
- `/projects/:id/agents/:agentId` — deep-link to agent detail
- `/projects/:id/workspaces/:workspaceId` — deep-link to workspace detail
- `/sessions/:code` — session lobby
- `/sessions/:code/tasks/:ticketId` — in-session task deep-link

Navigation: use `navigateTo('/path')` from `router.ts`, never `window.location.hash`.
Router sets `location` property on routed components (params available via `this.location.params`).

## Ephemeral Invocations

Single `claude -p` executions inside persistent Coder workspaces. Workspaces are reusable environments; invocations are short-lived processes.

### Data Model

- `invocations` table: tracks each `claude -p` call (perspective, prompt, status, output, exit code)
- Workspaces have `pool_key` for find-or-create resolution (e.g. `project:<uuid>:branch:<name>`)
- Invocations can optionally link to a session, task, and participant

### Dispatch Flow

1. `POST /api/projects/:id/invocations` creates an invocation record
2. Server resolves a workspace via pool key (find running → wake stopped → create new)
3. `coder ssh <workspace> -- claude -p --agent <perspective> '<prompt>'` is spawned
4. stdout/stderr streamed to log buffer + WebSocket broadcast
5. Structured JSON output captured in `result_json`
6. `session_id` extracted from JSON output → stored as `claude_session_id`

### Session Continuity (--resume)

Persistent agents are chains of resumed invocations — ephemeral processes with full context:

- Each completed invocation stores `claude_session_id` (extracted from `--output-format json` output)
- A new invocation can pass `resume_session_id` to continue from a prior session
- Dispatch adds `--resume <session_id>` to the claude command when resuming
- Frontend: "Continue" button on completed invocations opens dialog pre-filled for resumption
- Chain indicator (arrow-repeat icon) shown on resumed invocations in the list view

### Agent Perspectives

`.claude/agents/{coder,reviewer,planner}.md` files in workspace define role-specific behavior. The `--agent <name>` flag selects which perspective to use.

### Reaction Integration

`invoke_agent` action type in the reaction engine creates invocations from event triggers. Supports `{{key}}` template interpolation from event payloads.

### Frontend Components

- `invocation-list` — per-project list with status badges and prompt preview
- `invocation-detail` — output stream (2s polling), result JSON, metadata
- `invoke-dialog` — launch form (perspective, prompt, branch, system prompt)
- Integrated as "Invocations" tab in project workspace

### Key Endpoints

- `POST /api/projects/:id/invocations` — create and dispatch
- `GET /api/projects/:id/invocations` — list (filterable by status, workspace, task)
- `GET /api/invocations/:id` — detail with output from log buffer

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
- `ssh_key` → `SSH_PRIVATE_KEY` (written to `~/.ssh/id_ed25519` in workspace, ssh-agent started)
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

- `invoke_agent` — create an ephemeral invocation (`claude -p`) in a workspace pool. Supports `--resume` for session continuity.
- `webhook` — HTTP callback (not yet implemented)
- `mcp_tool` — invoke an MCP tool via Streamable HTTP client

### API Endpoints

- `GET/POST /api/projects/:id/reactions` — list/create event reactions
- `PATCH/DELETE /api/projects/:id/reactions/:id` — update/delete
- `GET/POST /api/projects/:id/scheduled-jobs` — list/create scheduled jobs
- `PATCH/DELETE /api/projects/:id/scheduled-jobs/:id` — update/delete

### Environment

- `AMQP_URL` — RabbitMQ connection (default: `amqp://seam:seam@localhost:5672`)
- `WORKER_API_TOKEN` — Bearer token for worker to call server API (invoke_agent action)
- `SEAM_URL` — Server URL for internal API calls (default: `http://localhost:3002`)
- RabbitMQ management UI: `http://localhost:15672` (seam/seam)

## Knowledge Management

Event-driven indexing pipeline that makes task, comment, plan, and code content searchable by agents via MCP tools.

### Pipeline

1. **Domain events** fire on task/comment/plan CRUD (PG NOTIFY on `domain_events` channel)
2. **Indexer** (`indexer.rs`) listens for events, fetches full entity, splits into chunks, writes to `knowledge_chunks` table with NULL embeddings
3. **Embedding worker** (`embeddings.rs`) polls for NULL-embedding chunks, calls Ollama `/api/embed`, writes `pgvector::Vector` back
4. **Search** (`knowledge.rs`) provides FTS (`search_fts_only`) and hybrid pgvector+FTS via Reciprocal Rank Fusion (`search_hybrid`)

### Code Search

Tantivy-based full-text search for repository files (`code_search.rs`). Separate from knowledge chunks — indexes raw source code with org/project scoping.

- `POST /api/projects/:id/code-index` — index a file
- `DELETE /api/projects/:id/code-index` — clear project index
- Index stored at `./code-search-index/` (Tantivy MmapDirectory)

### MCP Tools

- `search_knowledge` — FTS search across knowledge chunks (project-scoped or cross-project)
- `get_knowledge_detail` — fetch full chunk by ID
- `search_code` — Tantivy code search with snippet highlights

### Environment

- `OLLAMA_URL` — Ollama endpoint for embeddings (worker disabled if unset)
- `EMBEDDING_MODEL` — model name (default: `qwen3-embedding:0.6b`)

### Key Tables

- `knowledge_chunks` — indexed content with optional pgvector embeddings
- `consumer_cursors` — cursor tracking for the indexer consumer

## Multi-Provider Model Routing

User-controlled model selection across multiple inference providers.

### Providers

- **Anthropic** — Claude models (opus, sonnet, haiku) via Anthropic API
- **OpenRouter** — Open-weight models (Qwen 3.5, DeepSeek V3, Llama 4) via OpenAI-compatible API
- **Ollama** — Local models (qwen35-tuned, devstral-tuned)
- **llama.cpp** — Local models via OpenAI-compatible server

### Preference Hierarchy

```
Request-level override (invocation params)
  > Task-level config (task model_hint/budget_tier/provider)
    > User preference (personal default)
      > Org preference (org-wide default)
        > System default (config.py fallback)
```

### Org Policy Enforcement

Org admins can set `model_allowlist` (JSON array of allowed model IDs) and `model_denylist` (JSON array of blocked model IDs) in org model preferences. Enforcement happens at invocation creation — returns 400 if the resolved model violates policy.

### Model Discovery

`GET /api/models` returns available models from all providers. OpenRouter models are fetched and cached in-memory with 1-hour TTL. Anthropic models are built-in. Used by frontend for model selection dropdowns.

### Cost Tracking

Invocations record `model_used`, `input_tokens`, `output_tokens`, and `cost_usd` extracted from Claude JSON output on completion. `GET /api/projects/:id/cost-summary` aggregates total spend and per-model breakdown.

### Key Tables

- `user_model_preferences` — per-user defaults (default_model, default_budget, default_provider)
- `org_model_preferences` — org-wide defaults + policy (model_allowlist, model_denylist)
- Tasks carry `model_hint`, `budget_tier`, `provider` columns for per-task model config
- Invocations carry `model_hint`, `budget_tier`, `provider` (resolved at creation) + `model_used`, `input_tokens`, `output_tokens`, `cost_usd` (populated on completion)

### API Endpoints

- `GET /api/models` — list available models (cached OpenRouter + built-in Anthropic)
- `GET/PUT /api/me/model-preferences` — user model preferences
- `GET/PUT /api/orgs/:slug/model-preferences` — org model preferences (admin only for PUT)
- `GET /api/projects/:id/cost-summary` — aggregated invocation costs

### Dispatch Integration

Invocations carry `model_hint`, `budget_tier`, `provider` fields. At creation, server merges request > task > user prefs > org prefs, then enforces org allowlist/denylist. Resolved values are passed as `SEAM_MODEL_HINT`, `SEAM_BUDGET_TIER`, `SEAM_PROVIDER` env vars to workspaces. Agent CLI reads these as defaults below CLI flags.

### Credential Types for Providers

- `openrouter_api_key` → `OPENROUTER_API_KEY`
- `anthropic_api_key` → `ANTHROPIC_API_KEY` (existing)

## Conventions

- Frontend API calls go through Vite proxy (`/api` → `:3002`, `/ws` → WebSocket)
- Auth tokens: Bearer JWT from Hydra, validated via JWKS
- Session codes: uppercase alphanumeric, no ambiguous chars (0/O, 1/I/L)
