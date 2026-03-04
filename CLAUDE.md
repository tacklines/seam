# Seam

Collaborative sessions where humans and AI agents work together in real time.

## Architecture

- **Frontend**: `frontend/` — Lit web components + Vite + Tailwind + Shoelace
- **Backend**: `server/` — Rust (Axum) with PostgreSQL
- **Auth**: Keycloak OIDC (realm: `seam`, client: `web-app` public PKCE)
- **Infra**: Docker Compose (Keycloak + Postgres)

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

## Conventions

- Frontend API calls go through Vite proxy (`/api` → `:3002`, `/ws` → WebSocket)
- Auth tokens: Bearer JWT from Keycloak, validated via JWKS
- Session codes: uppercase alphanumeric, no ambiguous chars (0/O, 1/I/L)
