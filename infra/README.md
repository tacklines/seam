# Infrastructure

Development-only infrastructure configuration. Not for production use.

## Keycloak

Identity provider for the multi-human-workflows realm.

### Start

```bash
docker compose up -d
```

Keycloak starts on port 8080 in dev mode with H2 embedded database. The realm
is imported automatically from `infra/keycloak/realm-export.json` on first
startup.

### Admin Console

URL: http://localhost:8080
Username: `admin`
Password: `admin`

Navigate to the `multi-human-workflows` realm to inspect or modify clients,
users, and roles.

### Clients

| Client ID   | Type         | Purpose                                           |
|-------------|--------------|---------------------------------------------------|
| `web-app`   | Public/PKCE  | Vite dev server SPA (http://localhost:5173)       |
| `agent-api` | Confidential | MCP / agent server — client credentials grant     |

The `agent-api` client secret for dev is `agent-api-secret`.

### Test User

| Field     | Value                  |
|-----------|------------------------|
| Username  | `testuser`             |
| Password  | `testpass`             |
| Email     | `testuser@example.com` |

### Re-exporting the Realm

After making changes in the admin console, export the realm to keep
`realm-export.json` in sync:

```bash
docker compose exec keycloak \
  /opt/keycloak/bin/kc.sh export \
  --realm multi-human-workflows \
  --users realm_file \
  --dir /opt/keycloak/data/import
```

Then copy the exported file back to `infra/keycloak/realm-export.json` and
commit it.
