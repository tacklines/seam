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
| `deploy-operator` | Deploy, verify, and roll back production releases | sonnet | Deploying code, checking prod health, rolling back |
| `infra-engineer` | Terraform IaC, AWS resources, secrets, EC2 bootstrap | sonnet | Infrastructure changes, secret rotation, troubleshooting |

## Capabilities Matrix

| Agent | Reads | Writes | Tests |
|-------|-------|--------|-------|
| code-reviewer | Y | N | Y (check only) |
| debugger | Y | N | Y (run only) |
| rust-implementer | Y | Y | Y |
| frontend-implementer | Y | Y | Y (tsc only) |
| agent-developer | Y | Y | Y (ruff only) |
| migration-author | Y | Y | Y |
| mcp-tool-developer | Y | Y | Y |
| event-auditor | Y | N | N |
| vertical-slice-planner | Y | N | N |
| deploy-operator | Y | N | N |
| infra-engineer | Y | Y | N |

## Common Workflows

### New Feature (vertical slice)
1. `vertical-slice-planner` -- decompose into ordered tasks
2. `migration-author` -- schema changes (if needed)
3. `rust-implementer` -- server routes, auth, domain events
4. In parallel (independent of each other, all depend on step 3):
   - `mcp-tool-developer` -- agent-facing tools (if needed)
   - `frontend-implementer` -- UI components and state
   - `agent-developer` -- skills or workflow updates (if needed)
5. In parallel: `code-reviewer` + `event-auditor` -- review and verify event coverage

### Bug Fix
1. `debugger` -- diagnose root cause
2. Appropriate implementer agent -- fix
3. `code-reviewer` -- review fix

### Schema Change
1. `migration-author` -- migration + model + route + MCP propagation
2. In parallel: `frontend-implementer` (UI for new fields, if needed) + `code-reviewer` (review)

### New MCP Tool
1. `mcp-tool-developer` -- tool definition + handler
2. In parallel: `agent-developer` (skill integration, if needed) + `code-reviewer` (review)

### Audit
In parallel: `event-auditor` (domain event coverage) + `code-reviewer` (general quality)

### Deployment
1. `code-reviewer` -- review changes before shipping
2. `deploy-operator` -- build, push, deploy, verify
3. (if rollback needed) `deploy-operator` -- roll back to previous ECR image

### Infrastructure Change
1. `infra-engineer` -- modify Terraform, plan, apply
2. `deploy-operator` -- verify production health after infra change

## Skills (complementary)

Agents execute implementation. Skills orchestrate workflows. Key skills in `skills/`:
- `/seam` -- join sessions, manage tasks via MCP
- `/seam-drive` -- autonomous implementation loop against session backlog
- `/seam-plan` -- decompose goals into task hierarchies
- `/seam-review` -- code review with findings posted to session
- `/seam-triage` -- investigate and triage bugs/tasks
- `/seam-standup` -- session status summary
- `/seam-deploy` -- guided production deployment (CI or manual)
- `/seam-infra` -- Terraform plan/apply/status/secret/ssh management
- `/seam-rollback` -- emergency rollback to previous ECR image
