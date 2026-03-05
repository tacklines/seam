# COTS Evaluation: Build vs Integrate

Status: Draft

The AI coding revolution has produced a wave of open source tooling that overlaps
with features we're building or planning. Before committing to custom implementations,
evaluate what's available.

## Area 1: Project Management & Task Tracking

### What we've built
Custom tasks, comments, dependencies, priorities, notes — all in our Postgres schema.

### COTS Option: Plane
- https://plane.so | https://github.com/makeplane/plane
- Open source (AGPL), self-hosted via Docker Compose or K8s
- Full API, webhooks, OAuth apps, **native MCP server**
- Built-in docs/wiki system (covers our "plans" need too)
- AI features with bring-your-own-key (Anthropic/OpenAI)
- Agents can be assigned to work items natively
- Modern UI, active development, Linear-like UX

### Assessment
Plane covers tasks + plans + docs in one package with an API surface we could
integrate against rather than rebuild. The MCP server is particularly interesting —
agents could interact with Plane directly.

**Risk:** We lose tight coupling between sessions and tasks. Seam's value is the
real-time collaborative session layer. Plane is async project management.

**Possible approach:** Use Plane as the project management backend, Seam as the
real-time session/collaboration layer on top. Seam sessions reference Plane work
items. Agents get context from Plane, execute in Coder workspaces, report back
to both.

## Area 2: Sandbox / Agent Workspaces

### COTS Option: Coder (confirmed strong fit)
- https://github.com/coder/coder | AGPL-3.0
- REST API for workspace CRUD + dedicated Tasks API for agent workflows
- AgentAPI (https://github.com/coder/agentapi) — HTTP control of Claude Code,
  Goose, Aider, etc. inside workspaces
- Terraform templates define environments
- Anthropic dogfoods this for their own agent runs

### Assessment
Even stronger fit than initially thought. Coder's Tasks API is purpose-built for
what we need — programmatic agent task execution without dealing with workspace
plumbing. The AgentAPI layer means we don't need to build agent-to-workspace
communication either.

**This is clearly a "use, don't build" decision.**

## Area 3: Plans & Design Documents

### Option A: Plane Docs (bundled with Plane)
If we adopt Plane for project management, docs/wiki comes free. Supports rich
text, can be linked to work items.

### Option B: ADRs in Git
Architecture Decision Records stored as markdown in the project repo (e.g.
`docs/adr/`). Tools: adr-tools CLI, MkDocs for rendering. Zero infrastructure
cost. Agents can read/write them as regular files in their workspace.

### Option C: Custom plans table (our current design)
Full control, tight session integration, but reinventing what Plane or git-based
ADRs already provide.

### Assessment
ADRs-in-git is compelling because agents already work in git repos. A plan is
just a markdown file an agent can read for context. No API needed. Plane Docs
adds a UI layer if we want one.

## The Integration Architecture

If we lean COTS-heavy, Seam's role sharpens:

```
Plane (async project management)
  - Projects, work items, docs, backlogs
  - MCP server for agent access
  |
Seam (real-time collaboration layer)
  - Sessions where humans + agents coordinate live
  - Session-scoped tasks that reference Plane work items
  - WebSocket presence, comments, Q&A
  |
Coder (agent execution environment)
  - Isolated workspaces per task
  - AgentAPI for controlling coding agents
  - Tasks API for programmatic orchestration
  |
Git Repo (versioned artifact store)
  - Code, ADRs, plans as markdown
  - Branches per task, commits as proof of work
```

Seam becomes the **orchestration and collaboration layer** that ties these
systems together, rather than trying to be all of them.

## Licensing

Seam is MIT-licensed. AGPL on Coder and Plane is a non-issue:

- Seam integrates via HTTP APIs (separate processes), not linking — no copyleft propagation
- MIT imposes no restrictions on what you integrate with
- Self-hosting users deploy AGPL components alongside Seam, but the source is
  already public (GitHub). Their only obligation is to share modifications,
  which the AGPL projects already encourage via upstream contribution.
- No licensing friction in any direction.

## Open Questions

1. Does Plane's API support everything we need, or would we hit walls?
2. Operational complexity of running Plane + Coder + Seam + Keycloak + Postgres
3. Can Plane and Coder share Keycloak for SSO?
4. Is the integration glue simple enough, or does it become its own maintenance burden?
5. At what point does "integrate three tools" become harder than "build one tool"?

Sources:
- Plane: https://plane.so, https://developers.plane.so/
- Coder: https://github.com/coder/coder
- Coder AgentAPI: https://github.com/coder/agentapi
- Coder Tasks API: https://coder.com/blog/automate-coder-tasks-via-cli-and-api
- ADR tooling: https://adr.github.io/
