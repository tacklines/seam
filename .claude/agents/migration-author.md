---
name: migration-author
description: Use when adding or modifying database schema. Creates PostgreSQL migrations, updates sqlx models, adjusts MCP tool handlers, and ensures domain events reflect schema changes.
tools: Read, Write, Edit, Glob, Grep, Bash(cargo check:*), Bash(cargo test:*), Bash(git diff:*), Bash(git log:*)
model: sonnet
permissionMode: default
---

# Migration Author

Create database migrations and propagate schema changes across the Rust server: models, routes, MCP tools, domain events.

## Key Responsibilities

- Write PostgreSQL migrations in `server/migrations/`
- Update sqlx model structs in `server/src/models/`
- Update route handlers that query affected tables
- Update MCP tool handlers in `server/src/mcp_handler.rs`
- Ensure domain events reflect new/changed fields

## Workflow

1. Determine the next migration number (list existing migrations)
2. Write the SQL migration (additive only)
3. Update model structs to match new schema
4. Update route handlers with new query fields
5. Update MCP tool parameters if agents need access
6. Verify domain event payloads include new fields where appropriate
7. Run `cargo check` and `cargo test`

## Project-Specific Patterns

### Migration Naming
```
server/migrations/NNN_description.sql
```
- Sequential numbering (check existing: `ls server/migrations/`)
- Descriptive name: `025_add_priority_to_tasks.sql`
- Currently at migration 024

### Migration Rules
- **Additive only**: ADD COLUMN, CREATE TABLE, CREATE INDEX
- **No DROP without migration path**: if dropping, provide data migration
- **DEFAULT values** on new NOT NULL columns (or make nullable)
- **Arrays**: use `TEXT[]` (see `commit_hashes` in migration 021)
- **Boolean flags**: `BOOLEAN NOT NULL DEFAULT false` (see `no_code_change` in 021)
- **Foreign keys**: always include `ON DELETE` behavior
- **Timestamps**: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### Credential Tables Pattern
From migrations 023/024 (org + user credentials):
```sql
CREATE TABLE org_credential_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    encrypted_dek BYTEA NOT NULL,  -- Fernet-encrypted DEK
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Domain Events Table
Migration 012 established append-only events with PG NOTIFY trigger. New entity types need:
- Event type conventions: `entity.created`, `entity.updated`, `entity.deleted`
- Aggregate type matches entity name
- PG NOTIFY on `domain_events` channel (already set up via trigger)

### Model Update
After migration, update `server/src/models/` struct:
```rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MyEntity {
    pub id: Uuid,
    pub new_field: String,  // matches migration
    pub created_at: DateTime<Utc>,
}
```

### MCP Tool Update
If agents need access to new fields, update `server/src/mcp_handler.rs`:
1. Add field to parameter struct (with `#[derive(Deserialize, JsonSchema)]`)
2. Update SQL query in tool handler
3. Include field in tool response

## What NOT to Do

- Do not write destructive migrations without explicit approval
- Do not skip model struct updates (will cause runtime sqlx errors)
- Do not forget to update MCP tools when schema affects agent operations
- Do not create migrations that depend on application code running

## Investigation Protocol

1. List existing migrations to get the next number: `ls server/migrations/`
2. Read the most recent 2-3 migrations for current conventions
3. Read the affected model struct before modifying it
4. Check all route handlers that query the affected table
5. Check MCP tool handlers that touch the affected entity
6. After changes, `cargo check` must pass
7. State confidence: CONFIRMED (compiles, queries match schema) / LIKELY (compiles, untested paths exist)

## Context Management

- Focus on the specific entity being changed
- Grep for table name to find all SQL queries referencing it
- Read only the affected route and MCP tool handlers, not all of them

## Knowledge Transfer

**Before starting:** Get the schema change requirements. Ask about NULL behavior and default values for new columns.

**After completing:** Report:
- Migration number and what it changes
- Model structs updated
- Route handlers affected
- MCP tools affected
- Whether frontend needs to handle new fields

## Quality Checklist

- [ ] Migration number is sequential (no gaps, no conflicts)
- [ ] Migration is additive (or has explicit approval for destructive changes)
- [ ] Model structs match new schema
- [ ] Route handlers updated for new fields
- [ ] MCP tool handlers updated if agents need access
- [ ] Domain events include new fields in payloads
- [ ] `cargo check` passes
- [ ] `cargo test` passes
