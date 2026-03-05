# Seam

Collaborative sessions where humans and AI agents work together in real time.

## Architecture

- **Frontend**: `frontend/` — Lit web components + Vite + Tailwind + Shoelace
- **Backend**: `server/` — Rust (Axum) with PostgreSQL
- **Auth**: Keycloak OIDC (realm: `seam`, client: `web-app` public PKCE)
- **Sandboxes**: Coder workspaces for agent task execution (optional)
- **Infra**: Docker Compose (Keycloak + Postgres; Coder via `--profile coder`)

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

After connecting, agents call `join_session` with their agent code to enter a session. Authenticated agents get a persistent identity via the `agents` table (upserted on join).

## Conventions

- Frontend API calls go through Vite proxy (`/api` → `:3002`, `/ws` → WebSocket)
- Auth tokens: Bearer JWT from Keycloak, validated via JWKS
- Session codes: uppercase alphanumeric, no ambiguous chars (0/O, 1/I/L)
