# Plan: Migrate from Zitadel to Ory Hydra + Kratos

## Vision

Replace Zitadel with Ory Hydra (OAuth2/OIDC + DCR) and Ory Kratos (identity management, MFA) to get:
- Native Dynamic Client Registration (RFC 7591) for MCP clients like Claude Code
- Unified JWT-based auth (eliminate bespoke `sat_` agent tokens)
- Headless auth with our own Lit UI (full control over login/consent/profile UX)
- MFA support (TOTP, WebAuthn) via Kratos

## Constraints

- Pre-launch: no backwards compatibility needed, no user migration
- Keep existing `oidc-client-ts` frontend library (just repoint authority)
- Maintain `MCP_AUTH_DISABLED=true` bypass for local dev
- Agent token validation in `workspace_logs.rs` and `mcp_auth.rs` must be replaced with JWT validation

## Current Auth Surface (to replace)

### Server
- `server/src/auth.rs` — JWKS validation + userinfo enrichment (Zitadel-specific userinfo URL)
- `server/src/mcp_auth.rs` — Dual-path: JWT or `sat_` agent token
- `server/src/agent_token.rs` — Opaque token create/validate/revoke
- `server/src/routes/workspace_logs.rs` — `sat_` token auth for log ingest
- `server/src/main.rs` — `.well-known` proxy endpoints to Zitadel OIDC discovery

### Frontend
- `frontend/src/lib/auth-config.ts` — Authority + client ID (build-time VITE vars)
- `frontend/src/state/auth-state.ts` — `oidc-client-ts` UserManager

### Infrastructure
- `docker-compose.prod.yml` — `zitadel` + `zitadel-login` containers
- `docker-compose.yml` — `keycloak` container (local dev, stale)
- `infra/postgres/01-create-coder-db.sh` — Creates `zitadel` database + role
- `infra/deploy/user-data.sh` — Zitadel SSM secrets, Caddy `auth.seam.tacklines.com` vhost
- `infra/coder/templates/seam-agent/main.tf` — `seam_token` parameter, `SEAM_TOKEN` env var

### Docs
- `docs/deployment.md` — Zitadel setup instructions
- `docs/design-mcp-auth.md` — MCP auth design doc
- `CLAUDE.md` — References to Keycloak/Zitadel auth

---

## Phase 1: Local Dev Infrastructure

Add Hydra + Kratos to `docker-compose.yml`, replacing the Keycloak container.

### Tasks
1. Write Hydra config (`infra/ory/hydra.yml`) — enable DCR, set issuer URL, Postgres DSN
2. Write Kratos config (`infra/ory/kratos.yml`) — identity schema, TOTP, self-service flows
3. Write Kratos identity schema (`infra/ory/identity.schema.json`) — email, name
4. Update `docker-compose.yml` — replace Keycloak with Hydra + Kratos containers
5. Update `infra/postgres/01-create-coder-db.sh` — replace Zitadel DB with Hydra + Kratos DBs
6. Verify: `docker compose up -d` starts cleanly, Hydra OIDC discovery works

## Phase 2: Login + Consent + Registration UI

Build the auth UI as Lit components. Kratos provides flow state machine via API, we render it.

### Tasks
1. Create `frontend/src/components/auth/login-page.ts` — Kratos login flow renderer
2. Create `frontend/src/components/auth/registration-page.ts` — Kratos registration flow
3. Create `frontend/src/components/auth/consent-page.ts` — Hydra consent approval
4. Create `frontend/src/components/auth/error-page.ts` — Auth error display
5. Add routes: `/auth/login`, `/auth/register`, `/auth/consent`, `/auth/error`
6. Add consent API handler in Rust — accept/reject Hydra consent requests
7. Add login API handler in Rust — bridge Kratos login completion to Hydra login acceptance
8. Verify: full PKCE login flow works end-to-end in browser

## Phase 3: Server Auth Refactor

Replace Zitadel JWT validation with Hydra JWT validation. Eliminate agent token dual-path.

### Tasks
1. Update `auth.rs` — point JWKS at Hydra, remove Zitadel-specific userinfo enrichment
2. Simplify `mcp_auth.rs` — single JWT validation path (remove `sat_` branch)
3. Update `workspace_logs.rs` — validate JWT instead of `sat_` tokens
4. Remove `agent_token.rs` — no longer needed
5. Update `main.rs` — remove `.well-known` proxy, Hydra handles its own discovery
6. Update Coder template — inject OAuth2 client credentials instead of `sat_` token
7. Add migration to drop `agent_tokens` table
8. Verify: `cargo test` passes, MCP auth works with JWT

## Phase 4: Frontend Auth Repoint

Update frontend OIDC config to point at Hydra instead of Zitadel.

### Tasks
1. Update `auth-config.ts` — authority to Hydra URL, client ID
2. Update `auth-state.ts` — remove Zitadel-specific workarounds if any
3. Verify: login/logout/token refresh work in browser

## Phase 5: Production Deployment

Swap Zitadel for Hydra + Kratos on prod.

### Tasks
1. Update `docker-compose.prod.yml` — replace zitadel + zitadel-login with hydra + kratos
2. Update `infra/deploy/user-data.sh` — Hydra/Kratos secrets, remove Zitadel SSM params
3. Update Caddyfile — `auth.seam.tacklines.com` proxies to Hydra (or remove subdomain, serve from main)
4. Update `.github/workflows/deploy.yml` — new VITE build args
5. Update SSM parameters in `infra/deploy/ssm.tf`
6. Update `docs/deployment.md` — Ory setup instructions
7. Update `CLAUDE.md` — replace Zitadel/Keycloak references with Ory

## Phase 6: Cleanup

Remove all Zitadel/Keycloak artifacts.

### Tasks
1. Remove `infra/keycloak/` directory
2. Remove Zitadel references from postgres init scripts
3. Remove `zitadel_bootstrap` volume from prod compose
4. Remove stale SSM parameter definitions (zitadel-masterkey, zitadel-db-password, zitadel-admin-password)
5. Remove `docs/adrs/ADR-003-oidc-provider.md` or update for Ory
6. Clean up any remaining Zitadel/Keycloak references across codebase

## Quality Criteria

- DCR works: Claude Code can connect to `/mcp` without pre-configured client ID
- Single auth path: all tokens are Hydra JWTs, no opaque token fallback
- Login flow: browser PKCE flow works for humans
- MFA ready: TOTP enrollable via Kratos self-service
- Local dev: `just dev-noauth` still works (MCP_AUTH_DISABLED bypass unchanged)
