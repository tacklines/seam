# Testing

## Server (Rust)

```bash
cd server && cargo test        # or: just test
```

- Tests live alongside source in `#[cfg(test)]` modules
- Integration tests go in `server/tests/`
- Use `sqlx::test` for database-dependent tests

## Frontend (TypeScript)

No test framework currently configured. Type-checking serves as the primary verification:

```bash
cd frontend && npx tsc --noEmit    # or: just check-frontend
```

## Agents (Python)

No test suite currently configured. Manual verification via CLI:

```bash
cd agents && uv run python -m seam_agents.cli <code> --skill triage
```

## Full Check

```bash
just check-all    # cargo check + tsc --noEmit
```
