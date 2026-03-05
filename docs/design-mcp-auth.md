# Design: MCP Authentication & Agent Identity

## Problem

The `/mcp` Streamable HTTP endpoint is unauthenticated. Any network client can connect, call `join_session` with a valid agent code, and operate as an agent. This is fine for local development but unacceptable for remote/production use.

Additionally, agent identity is weak — agents are identified only by their sponsor's agent code, with no persistent agent identity or capability scoping.

## Goals

1. **Authenticate MCP connections** using Keycloak OAuth 2.0
2. **Device authorization flow** so agents can obtain tokens without browser access
3. **Better agent identity** — persistent agent records with scoped capabilities
4. **MCP spec compliance** — advertise OAuth metadata per the MCP specification
5. **Ease of use** — minimal friction for agent operators to connect

## Architecture

### Authentication Flow

```
Agent                    Seam Server              Keycloak
  │                          │                       │
  ├─ GET /.well-known/      │                       │
  │  oauth-protected-resource                       │
  │◄─ { auth_server, scopes }                       │
  │                          │                       │
  ├─────────────────────────────── POST /device/auth │
  │◄──────────────────────────── { device_code,      │
  │                                user_code,        │
  │                                verification_uri }│
  │                          │                       │
  │  (human approves via     │                       │
  │   Keycloak UI or Seam    │                       │
  │   session page)          │                       │
  │                          │                       │
  ├─────────────────────────────── POST /token       │
  │◄──────────────────────────── { access_token }    │
  │                          │                       │
  ├─ POST /mcp               │                       │
  │  Authorization: Bearer   │                       │
  │  <access_token>          │                       │
  │                     ├─── validate JWT ──────────►│
  │                     │◄── claims ────────────────│
  │                     │                            │
  │◄─ MCP response      │                           │
```

### Components

#### 1. Tower Auth Middleware (`server/src/mcp_auth.rs`)

A Tower layer that wraps `StreamableHttpService`:

- Extracts `Authorization: Bearer <token>` from request headers
- Validates the JWT against Keycloak JWKS (reuses existing `JwksCache`)
- Injects validated `Claims` into request extensions
- Returns `401 Unauthorized` if no/invalid token
- Passes `/.well-known/*` requests through without auth

The middleware wraps the MCP service at mount time:

```rust
let mcp_service = StreamableHttpService::new(
    move || Ok(SeamMcp::new(mcp_db.clone())),
    Arc::new(LocalSessionManager::default()),
    StreamableHttpServerConfig::default(),
);
let authed_mcp = McpAuthLayer::new(jwks.clone()).layer(mcp_service);
let app = app.nest_service("/mcp", authed_mcp);
```

#### 2. OAuth Metadata Endpoints

Per MCP spec, the server advertises OAuth configuration:

**`GET /.well-known/oauth-protected-resource`** (RFC 9728):
```json
{
  "resource": "https://seam.example.com/mcp",
  "authorization_servers": ["https://keycloak.example.com/realms/seam"],
  "scopes_supported": ["openid", "profile"],
  "bearer_methods_supported": ["header"]
}
```

**`GET /.well-known/oauth-authorization-server`** — proxies to Keycloak's own metadata at `{keycloak_url}/realms/{realm}/.well-known/openid-configuration`, which already includes the `device_authorization_endpoint`.

#### 3. Internal Agent Tokens

For server-spawned agents (Coder workspaces), Keycloak OAuth is overkill — the server itself creates and manages these agents. Instead, opaque bearer tokens:

```sql
CREATE TABLE agent_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,    -- SHA-256 of the raw token
    user_id UUID NOT NULL REFERENCES users(id),  -- sponsoring human
    session_id UUID REFERENCES sessions(id),     -- optional session scope
    agent_id UUID REFERENCES agents(id),         -- links to persistent agent identity
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
```

Flow:
1. Server generates crypto-random token when creating a Coder workspace
2. Stores SHA-256 hash in `agent_tokens`, injects raw token as `SEAM_TOKEN` env var
3. Agent uses `Authorization: Bearer <SEAM_TOKEN>` for MCP connections
4. McpAuthMiddleware: if token has no dots (not a JWT), look up hash in `agent_tokens`

This is simpler and more secure for internal agents — no OAuth dance, tokens are scoped and revocable, and the server controls the full lifecycle.

#### 3b. Keycloak Device Auth (future, external clients)

For external MCP clients (Claude Code, etc.), Keycloak device auth (RFC 8628) will be added later:

- Create client `mcp-agents` in realm `seam`
- Enable "OAuth 2.0 Device Authorization Grant" flow
- MCP clients discover this via `/.well-known/oauth-authorization-server`

#### 4. Agent Identity Model

Current model: agents are `participants` with `participant_type = 'agent'`, linked to a sponsor via `agent_join_codes.user_id`.

Proposed additions:

```sql
-- Track persistent agent identities across sessions
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_subject TEXT NOT NULL,         -- sub claim from JWT
    display_name TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}',            -- model, version, capabilities
    UNIQUE(keycloak_subject, organization_id)
);
```

When an authenticated agent calls `join_session`:

1. Extract `sub` claim from the JWT (injected by auth middleware into request parts)
2. Upsert into `agents` table — creates persistent identity on first use
3. Link the participant record to both the agent identity and the session
4. The agent code still controls **which session** — the JWT controls **who is this agent**

This separates authentication (JWT) from authorization (agent code).

#### 5. MCP Tool Handler Changes

The `join_session` tool gains access to the authenticated identity:

```rust
#[tool(description = "Join a session using an agent code")]
async fn join_session(
    &self,
    #[tool(params)] params: JoinSessionParams,
    Extension(parts): Extension<http::request::Parts>,
) -> Result<CallToolResult, McpError> {
    // Extract authenticated user from JWT claims
    let claims = parts.extensions.get::<Claims>();

    // If authenticated, use JWT identity; if not (stdio), fall back to agent code only
    let agent_identity = match claims {
        Some(claims) => {
            // Upsert agent record, verify authorization
            self.resolve_agent_identity(claims).await?
        }
        None => None, // stdio transport, no JWT
    };

    // Proceed with join, linking agent identity
    self.do_agent_join(&params.code, params.display_name.as_deref(), agent_identity).await
}
```

### UX: Connecting an Agent

#### For agent operators (CLI/SDK):

```bash
# One-time setup: get a token via device flow
seam-auth device-login --realm-url https://keycloak.example.com/realms/seam

# Opens browser / prints: "Go to https://keycloak.example.com/realms/seam/device
#                          and enter code: ABCD-EFGH"

# Token is cached in ~/.seam/token.json

# MCP config with auth:
{
  "mcpServers": {
    "seam": {
      "url": "https://seam.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${SEAM_TOKEN}"
      }
    }
  }
}
```

#### For MCP clients with native OAuth support (Claude Code, etc.):

```json
{
  "mcpServers": {
    "seam": {
      "url": "https://seam.example.com/mcp"
    }
  }
}
```

The client auto-discovers OAuth metadata from `/.well-known/oauth-protected-resource`, performs the device auth flow (or browser redirect if available), and handles token refresh automatically.

#### For local development:

Set `MCP_AUTH_DISABLED=true` on the server (or use `just dev-noauth`) to skip JWT validation on the `/mcp` endpoint.

## Implementation Plan

### Sprint 1: Auth Middleware + Metadata (DONE - commit 9edc564)

1. ~~Tower auth middleware~~ — `McpAuthLayer` validates Bearer JWTs, injects `Arc<Claims>`
2. ~~OAuth metadata endpoints~~ — `/.well-known/oauth-protected-resource` + authorization server proxy
3. ~~Remove stdio transport~~ — deleted `seam-mcp` binary (gave direct DB access)
4. ~~Dev bypass~~ — `MCP_AUTH_DISABLED` env var + `just dev-noauth` / `just server-noauth`

### Sprint 2: Internal Agent Tokens + Identity

5. **`agent_tokens` table migration** — opaque token storage with SHA-256 hashes
6. **Token generation + validation** — crypto-random tokens, dual-path auth in middleware (JWT vs opaque)
7. **`agents` table migration** — persistent agent identity across sessions
8. **Agent upsert on join** — link authenticated agent to persistent identity record

### Sprint 3: Workspace Integration + Polish

9. **Inject token into Coder workspace** — generate + pass `SEAM_TOKEN` on workspace creation
10. **Agent info in session context** — participants show agent metadata (model, capabilities)
11. **Token lifecycle** — expiry, revocation, cleanup
12. **External client OAuth** (future) — Keycloak device auth for Claude Code etc.

## Security Considerations

- **JWT validation** reuses existing `JwksCache` — same security as REST API
- **Agent codes remain required** for session authorization — JWT alone doesn't grant session access
- **Scoping**: future work could add Keycloak roles/scopes for fine-grained tool access (e.g., read-only agents)
- **Token lifetime**: Keycloak access tokens should be short-lived (5 min) with refresh tokens
- **Rate limiting**: Consider per-agent rate limits on the MCP endpoint
- **Stdio transport**: Removed (gave direct DB access, bypassed all auth)

## Alternatives Considered

### API Keys instead of OAuth
Simpler but requires key management UI, rotation, revocation. OAuth gives us all of this via Keycloak for free.

### Agent codes as Bearer tokens
Conflates session authorization with transport authentication. Agent codes are short (8 chars) and session-scoped — not suitable as API credentials.

### Full OAuth authorization code flow (browser redirect)
Works for humans but not for headless agents. Device flow solves this. MCP clients with browser access can use authorization code flow via the same Keycloak metadata.

### Custom token endpoint on Seam server
Adds complexity. Keycloak already implements device auth, token refresh, and JWKS. No need to reimplement.
