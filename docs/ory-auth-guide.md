# Ory Hydra + Kratos Auth Guide

Working reference for the Ory auth stack (Hydra v2.3 + Kratos v1.3) behind Caddy reverse proxy.

## Architecture

```
Browser → Caddy (TLS) → seam-server (:3002)  → Hydra admin (:4445)
                       → Kratos (:4433)         → Postgres (hydra DB)
                       → Hydra public (:4444)    → Postgres (kratos DB)
```

- **Hydra**: OAuth2/OIDC provider. Issues JWT access tokens. Manages OAuth2 clients.
- **Kratos**: Identity management. Handles registration, login, password hashing, account recovery.
- **Seam server**: Hosts auth UI pages (`/auth/*`) and bridges Hydra login/consent flows.

### Auth Flow (OIDC Authorization Code + PKCE)

```
1. Frontend → Hydra /oauth2/auth (authorize endpoint)
2. Hydra → redirect to seam /auth/login?login_challenge=...
3. Seam login page → Kratos /self-service/login/browser (get login flow)
4. User submits credentials → Kratos validates → returns session
5. Seam → Hydra admin PUT /admin/oauth2/auth/requests/login/accept
6. Hydra → redirect to seam /auth/consent?consent_challenge=...
7. Seam auto-accepts consent → Hydra admin PUT /admin/oauth2/auth/requests/consent/accept
8. Hydra → redirect to frontend /auth/callback with authorization code
9. Frontend exchanges code for tokens via Hydra /oauth2/token
```

## Configuration Files

| File | Purpose |
|---|---|
| `infra/ory/hydra-prod.yml` | Hydra server config (URLs, CORS, TLS termination, JWT strategy) |
| `infra/ory/kratos-prod.yml` | Kratos config (methods, flows, UI URLs, hashers, secrets) |
| `infra/ory/identity.schema.json` | Identity schema (traits, credential identifiers) |
| `docker-compose.prod.yml` | Service definitions, env vars, health checks |
| `infra/deploy/ssm.tf` | Terraform for secrets in AWS SSM Parameter Store |

## Caddy Routing

```
seam.tacklines.com:
  /kratos/*        → strip prefix → localhost:4433 (Kratos public)
  /api/*           → localhost:3002 (Seam server)
  /auth/*          → static files (auth UI pages baked into frontend)
  /.well-known/*   → localhost:3002 (OIDC discovery, resource metadata)
  /*               → static files (SPA)

auth.seam.tacklines.com:
  /*               → localhost:4444 (Hydra public: token, authorize, JWKS, userinfo)
```

## Kratos Gotchas

### Two-Step Registration (v1.3)

Kratos v1.3 uses a **two-step registration flow** by default:
1. Step 1: Collect traits (email, name) with `method: "profile"`
2. Step 2: Set credential (password) with `method: "password"`

Our frontend handles this transparently — the user sees a single form with all fields, and the two API calls are chained in the background.

### JSON API vs Form-Urlencoded

**Critical**: Kratos's JSON API (`Content-Type: application/json`) requires **nested objects** for traits:

```json
// CORRECT (JSON)
{"method": "password", "traits": {"email": "user@example.com", "name": "User"}, "password": "..."}

// WRONG (JSON) — dot notation only works with form-urlencoded
{"method": "password", "traits.email": "user@example.com", "traits.name": "User", "password": "..."}
```

Sending dot-notation keys in JSON causes `"could not find any identifiers"` errors because Kratos can't find the `traits.email` field marked as `password.identifier: true`.

### Passkey Method Breaks Registration

Kratos v1.3 with `passkey.enabled: true` causes `"no identifier found"` 500 errors on registration flow initialization. The identity schema has `passkey.display_name: true` (not `identifier`), and the passkey strategy fails to find an identifier during flow setup.

**Workaround**: Keep passkey disabled. Can re-enable when upgrading to a Kratos version with the fix.

### WebAuthn Triggers Multi-Step

Even with only password + webauthn enabled, Kratos forces the two-step "profile-first" registration. Disabling webauthn doesn't help — the two-step flow is the v1.3 default when any non-password method exists.

### Identity Schema

The identity schema at `infra/ory/identity.schema.json` defines:
- `email` as the password identifier (`ory.com/kratos.credentials.password.identifier: true`)
- `email` as TOTP account name
- `email` for recovery and verification
- `name` as an optional display name

If you change the schema, you must restart Kratos AND start a new registration flow (old flows use the cached schema).

### CSRF Tokens

Every Kratos flow includes a `csrf_token` hidden field. This MUST be included in every POST. The token changes between steps — always use the one from the most recent flow response.

## Hydra Gotchas

### TLS Termination

Hydra runs behind Caddy (TLS terminator). Without proper config, Hydra rejects requests because it thinks it's being accessed over HTTP.

**Required config** in `hydra-prod.yml`:
```yaml
serve:
  tls:
    allow_termination_from:
      - 0.0.0.0/0
  cookies:
    same_site_mode: Lax
```

Do NOT use `--dev` or `--dangerous-force-http` flags in production. The `--dangerous-force-http` flag doesn't even exist in Hydra v2.3.

### JWKS Endpoint

Hydra v2.3 serves JWKS at `/.well-known/jwks.json` (standard path). NOT at `/oauth/v2/keys` (which returns 404 in v2.3 despite working in some other versions).

### JWT Access Tokens

Enabled via:
```yaml
strategies:
  access_token: jwt
```

Access tokens contain standard claims (`sub`, `iss`, `aud`, `scope`). User profile info (name, email) comes from the userinfo endpoint or custom claims added during consent.

### OAuth2 Client Registration

```bash
# Register a public SPA client (inside the Docker network)
docker exec repo-hydra-1 hydra create oauth2-client \
  --endpoint http://localhost:4445 \
  --name seam-web \
  --grant-type authorization_code,refresh_token \
  --response-type code \
  --token-endpoint-auth-method none \
  --redirect-uri "https://seam.tacklines.com/auth/callback" \
  --post-logout-callback "https://seam.tacklines.com/" \
  --scope openid,profile,email,offline_access \
  --audience seam-api
```

Client ID is baked into the frontend at build time via `VITE_CLIENT_ID`.

### Dynamic Client Registration

Enabled in Hydra config for MCP OAuth2 flows:
```yaml
oidc:
  dynamic_client_registration:
    enabled: true
```

## Secrets

All secrets in AWS SSM Parameter Store (Terraform managed):

| Secret | Purpose |
|---|---|
| `hydra_secrets_system` | Hydra encryption key (token/client secret encryption) |
| `kratos_secrets_cookie` | Kratos session cookie signing |
| `kratos_secrets_cipher` | Kratos data encryption (xchacha20-poly1305) |

Generated via: `openssl rand -base64 32` (cookie/system) or `openssl rand -hex 16` (cipher).

Fetched by `user-data.sh` at instance launch → written to `/opt/seam/.env` → injected via docker-compose environment variables.

## Server Auth Endpoints

The Rust server provides auth bridge endpoints at `/api/auth/*`:

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/login?login_challenge=...` | Check Hydra login request (skip if already authenticated) |
| `PUT /api/auth/login/accept?login_challenge=...` | Accept login after Kratos authentication |
| `GET /api/auth/consent?consent_challenge=...` | Get consent request details |
| `PUT /api/auth/consent/accept?consent_challenge=...` | Accept consent (auto-accept for first-party) |
| `PUT /api/auth/consent/reject?consent_challenge=...` | Reject consent |

These call Hydra's admin API (`:4445`) internally.

## Frontend Auth Components

| Component | Route | Purpose |
|---|---|---|
| `login-page.ts` | `/auth/login` | Kratos login + Hydra challenge bridge |
| `registration-page.ts` | `/auth/register` | Single-form registration (chains 2 Kratos steps) |
| `consent-page.ts` | `/auth/consent` | OAuth2 consent (auto-accepts for first-party) |
| `error-page.ts` | `/auth/error` | Auth error display |

### OIDC Client (`oidc-client-ts`)

The frontend uses `oidc-client-ts` for the OAuth2 flow. Configuration is baked at build time:

| Build Arg | Purpose |
|---|---|
| `VITE_AUTH_AUTHORITY` | Hydra public URL (issuer) — `https://auth.seam.tacklines.com` |
| `VITE_APP_URL` | Application URL for redirects — `https://seam.tacklines.com` |
| `VITE_CLIENT_ID` | Hydra OAuth2 client ID |

## Local Development

```bash
# Start with auth disabled (simplest for frontend/API dev)
just dev-noauth

# Start with full auth stack
docker compose up -d  # Starts Keycloak + Postgres + RabbitMQ
# Note: local dev still uses Keycloak, not Ory (TODO: add local Ory compose)
```

## Debugging

### Enable Kratos Verbose Logging

Set `LOG_LEAK_SENSITIVE_VALUES=true` in the Kratos environment to see redacted values (cookies, query params, request bodies) in logs:

```yaml
# docker-compose.prod.yml (temporarily)
kratos:
  environment:
    LOG_LEAK_SENSITIVE_VALUES: "true"
```

### Check Kratos Health

```bash
ssh ec2-user@35.174.204.185
curl http://localhost:4433/health/alive
curl http://localhost:4433/health/ready
```

### Check Hydra Health

```bash
curl http://localhost:4444/health/alive
curl http://localhost:4444/health/ready
```

### Test Registration Flow

```bash
# Step 1: Create flow
curl -s -H 'Accept: application/json' http://localhost:4433/self-service/registration/browser | python3 -m json.tool

# Step 2: Submit (use action URL and csrf_token from step 1)
curl -s -X POST '<action_url>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -b '<cookies from step 1>' \
  -d '{"method":"profile","traits":{"email":"test@example.com","name":"Test"},"csrf_token":"<token>"}'
```

### List Hydra Clients

```bash
docker exec repo-hydra-1 hydra list oauth2-clients --endpoint http://localhost:4445
```

### Inspect a JWT Access Token

```bash
# Decode without verification
echo '<token>' | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

## Migration History

- **Keycloak → Zitadel**: Initial migration (later abandoned)
- **Zitadel → Ory Hydra + Kratos**: Final migration (2026-03-07)
  - Hydra handles OAuth2/OIDC (token issuance, client management)
  - Kratos handles identity (registration, login, password management)
  - Seam server bridges the two via admin APIs
