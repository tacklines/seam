# Definition of Done

What "done" means for common task types in Seam.

## New Feature

1. Implementation complete across all affected stacks (server, frontend, agents)
2. Database migrations added if schema changes needed
3. CLAUDE.md updated if the feature changes architecture, routing, or conventions
4. `cargo check` passes (server)
5. `npx tsc --noEmit` passes (frontend)
6. `cargo test` passes (server)
7. Committed with `feat:` prefix

## Bug Fix

1. Root cause identified
2. Fix implemented
3. `cargo test` passes
4. Committed with `fix:` prefix

## Frontend Change

1. Component works with Shoelace design system
2. Uses Lit reactive properties (not direct DOM manipulation)
3. Routes registered in `router.ts` if new pages added
4. API calls go through Vite proxy (never hardcode localhost:3002)
5. `npx tsc --noEmit` passes

## Backend Change

1. New routes registered in `main.rs` router
2. SQL queries use sqlx with parameterized queries
3. Auth middleware applied to protected routes
4. Domain events emitted for state changes
5. `cargo test` passes

## Database Migration

1. Migration file in `server/migrations/` with sequential numbering
2. Migrations are additive (no destructive changes without migration path)
3. MCP tool handlers updated if schema affects tool parameters
