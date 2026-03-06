# Agent Catalog

Quick reference for which agent to dispatch for each task type in the Seam monorepo.

## Agents

| Agent | Purpose | Model | Invoke When |
|-------|---------|-------|-------------|
| `code-reviewer` | Review changes for correctness, security, patterns | sonnet | Before merging, after implementation |
| `debugger` | Diagnose bugs across stack boundaries | sonnet | Bug reports, test failures, unexpected behavior |
| `rust-implementer` | Backend routes, DB queries, auth, WebSocket | sonnet | Server-side feature work |
| `frontend-implementer` | Lit components, state, routing, API integration | sonnet | UI feature work |
| `agent-developer` | LangGraph agents, MCP clients, skills, workflows | sonnet | Agent system changes |
| `migration-author` | Schema changes + model/route/MCP propagation | sonnet | Database schema work |
| `mcp-tool-developer` | MCP tools end-to-end (schema, handler, agent-side) | sonnet | New tools for agents |
| `event-auditor` | Verify domain event coverage | haiku | Periodic audit, after route additions |
| `vertical-slice-planner` | Decompose multi-stack features into tasks | opus | Planning new features that span stacks |

## Capabilities Matrix

| Agent | Reads | Writes | Tests | Beads |
|-------|-------|--------|-------|-------|
| code-reviewer | Y | N | Y (check only) | Y |
| debugger | Y | N | Y (run only) | Y |
| rust-implementer | Y | Y | Y | Y |
| frontend-implementer | Y | Y | Y (tsc only) | Y |
| agent-developer | Y | Y | Y (ruff only) | Y |
| migration-author | Y | Y | Y | Y |
| mcp-tool-developer | Y | Y | Y | Y |
| event-auditor | Y | N | N | Y |
| vertical-slice-planner | Y | N | N | Y |

## Common Workflows

### New Feature (vertical slice)
1. `vertical-slice-planner` -- decompose into ordered tasks
2. `migration-author` -- schema changes (if needed)
3. `rust-implementer` -- server routes, auth, domain events
4. `mcp-tool-developer` -- agent-facing tools (if needed)
5. `frontend-implementer` -- UI components and state
6. `agent-developer` -- skills or workflow updates (if needed)
7. `code-reviewer` -- final review
8. `event-auditor` -- verify event coverage

### Bug Fix
1. `debugger` -- diagnose root cause
2. Appropriate implementer agent -- fix
3. `code-reviewer` -- review fix

### Schema Change
1. `migration-author` -- migration + model + route + MCP propagation
2. `frontend-implementer` -- UI for new fields (if needed)
3. `code-reviewer` -- review

### New MCP Tool
1. `mcp-tool-developer` -- tool definition + handler
2. `agent-developer` -- skill integration (if needed)
3. `code-reviewer` -- review

### Audit
1. `event-auditor` -- domain event coverage
2. `code-reviewer` -- general quality

## Skills (complementary)

Agents execute implementation. Skills orchestrate workflows. Key skills in `skills/`:
- `/seam` -- join sessions, manage tasks via MCP
- `/seam-drive` -- autonomous implementation loop against session backlog
- `/seam-plan` -- decompose goals into task hierarchies
- `/seam-review` -- code review with findings posted to session
- `/seam-triage` -- investigate and triage bugs/tasks
- `/seam-standup` -- session status summary
