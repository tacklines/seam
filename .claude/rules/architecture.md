---
paths:
  - "server/**/*.rs"
  - "frontend/**/*.ts"
  - "agents/**/*.py"
---

# Architecture Rules

## Three-Stack Boundary

Each stack has its own tooling and conventions. Do not mix concerns:

- **server/** — Rust/Axum. All HTTP endpoints, WebSocket handling, database access, auth.
- **frontend/** — Lit/TypeScript. All UI rendering, client-side state, API calls via Vite proxy.
- **agents/** — Python/LangGraph. Agent logic, MCP client, skills, workflows.

Communication between stacks flows through HTTP APIs and WebSocket only. Never import across stack boundaries.

## Server Patterns

- Routes go in `server/src/routes/` as separate modules, registered in `main.rs`
- Database queries use sqlx with compile-time or runtime checking
- Auth: Keycloak JWT validation via JWKS, plus `sat_` opaque agent tokens
- Domain events: emit via `events::emit()` for state changes (fire-and-forget)
- Migrations: sequential files in `server/migrations/`

## Frontend Patterns

- Components are Lit elements with Shoelace UI primitives
- State management: reactive controllers and shared state modules in `frontend/src/state/`
- Routing: `@vaadin/router` History API — use `navigateTo()`, never `window.location.hash`
- API calls: always through Vite proxy (`/api`, `/ws`) — never hardcode backend URL
- Styling: Tailwind CSS via `@tailwindcss/vite` plugin

## Agent Patterns

- Agents are LangGraph graphs with MCP tool access
- Skills: prompt-based (in `builtin.py`) and workflow-based (in `workflows/`)
- MCP clients use background-thread event loops (no nest_asyncio)
- Model routing: capability-based selection across providers
