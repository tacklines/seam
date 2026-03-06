# Commit Conventions

This project uses conventional commits. Inferred from git history.

## Format

```
<type>: <description>
```

## Types

- `feat` — New feature or capability
- `fix` — Bug fix
- `chore` — Maintenance, dependencies, config
- `docs` — Documentation changes only
- `refactor` — Code restructuring without behavior change
- `test` — Adding or updating tests

## Rules

- Lowercase type prefix, no scope parentheses (project uses flat `feat:` not `feat(scope):`)
- Description starts lowercase
- Keep subject line under 72 characters
- Body is optional; use it for multi-file changes that need explanation
- One logical change per commit
