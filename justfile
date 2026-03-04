# Seam

set dotenv-load

export KEYCLOAK_PORT := env("KEYCLOAK_PORT", "8081")
export POSTGRES_PORT := env("POSTGRES_PORT", "5433")
export DATABASE_URL := env("DATABASE_URL", "postgres://seam:seam@localhost:" + POSTGRES_PORT + "/seam")
export KEYCLOAK_URL := env("KEYCLOAK_URL", "http://localhost:" + KEYCLOAK_PORT)

# Start everything: infra + backend + frontend
dev: infra-up
    #!/usr/bin/env bash
    set -e
    trap 'kill 0' EXIT

    echo "⏳ Waiting for Postgres..."
    until pg_isready -h localhost -p {{POSTGRES_PORT}} -U seam -q 2>/dev/null; do sleep 0.5; done
    echo "✓ Postgres ready"

    echo "⏳ Waiting for Keycloak..."
    until curl -sf http://localhost:{{KEYCLOAK_PORT}}/realms/seam > /dev/null 2>&1; do sleep 1; done
    echo "✓ Keycloak ready"

    echo "🚀 Starting backend + frontend..."
    cd server && cargo run 2>&1 | sed 's/^/[server] /' &
    sleep 2
    cd frontend && npx vite 2>&1 | sed 's/^/[frontend] /' &
    wait

# Start only backend + frontend (assumes infra already running)
dev-no-infra:
    #!/usr/bin/env bash
    set -e
    trap 'kill 0' EXIT
    cd server && cargo run 2>&1 | sed 's/^/[server] /' &
    sleep 2
    cd frontend && npx vite 2>&1 | sed 's/^/[frontend] /' &
    wait

# Backend only
server:
    cd server && cargo run

# Frontend only
frontend:
    cd frontend && npx vite

# Start Docker infra (Keycloak + Postgres)
infra-up:
    docker compose up -d

# Stop Docker infra
infra-down:
    docker compose down

# Stop Docker infra and wipe volumes
infra-reset:
    docker compose down -v

# Run Rust backend checks
check:
    cd server && cargo check

# Type-check frontend
check-frontend:
    cd frontend && npx tsc --noEmit

# Check everything
check-all: check check-frontend

# Build frontend for production
build-frontend:
    cd frontend && npx vite build

# Build backend release
build-server:
    cd server && cargo build --release

# Build everything
build: build-server build-frontend

# Install frontend deps
install:
    cd frontend && npm install

# Run backend tests
test:
    cd server && cargo test

# Show Docker container status
ps:
    docker compose ps

# Tail Docker logs
logs service="":
    docker compose logs -f {{service}}

# Get a test token from Keycloak (testuser/testpass)
token:
    #!/usr/bin/env bash
    curl -s -X POST {{KEYCLOAK_URL}}/realms/seam/protocol/openid-connect/token \
      -d "grant_type=password" \
      -d "client_id=web-app" \
      -d "username=testuser" \
      -d "password=testpass" \
      -d "scope=openid profile email" | jq -r '.access_token'

# Create a test session (requires running backend)
test-session:
    #!/usr/bin/env bash
    TOKEN=$(just token)
    curl -s -X POST http://localhost:3002/api/sessions \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{}' | jq .

# Run MCP server with an agent code
mcp code="":
    cd server && cargo run --bin seam-mcp -- {{code}}
