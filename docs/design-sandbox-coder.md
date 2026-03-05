# Design: Agent Sandbox via Coder

Status: Draft

## Problem

Agents executing tasks need isolated environments where they can clone a repo, run code, make commits, and return results -- without being able to affect each other, the host, or other projects. We need chroot-level isolation at minimum, container-level preferred.

## Approach: Coder as Sandbox Infrastructure

[Coder](https://github.com/coder/coder) (AGPL-3.0) provides programmable, isolated development workspaces defined via Terraform templates. Self-hosted, free community edition. Anthropic uses it for running Claude Code agents remotely.

### Why Coder Over Rolling Our Own

- Workspace lifecycle management (create/start/stop/delete) via REST API
- Terraform templates for reproducible environments
- Wireguard tunnels for secure connectivity
- Resource limits, auto-stop on idle
- We avoid building container orchestration

### Integration Architecture

```
Seam Backend (Rust)
  |
  |-- Coder API Client (thin HTTP client)
  |     |
  |     |-- POST /api/v2/workspaces       (create workspace for task)
  |     |-- GET  /api/v2/workspaces/:id    (poll status)
  |     |-- POST /api/v2/workspaces/:id/builds (start/stop)
  |     |-- DELETE /api/v2/workspaces/:id  (cleanup)
  |
  |-- Workspace Template (Terraform)
        |-- Clones project.repo_url
        |-- Checks out task branch
        |-- Installs project toolchain
        |-- Drops agent credentials (SSH key or token)
        |-- Sets resource limits (CPU, memory, disk)
```

### Task Lifecycle

1. Task assigned to agent
2. Seam creates Coder workspace from project template
3. Workspace clones repo, creates feature branch
4. Agent gets exec access (SSH or Coder CLI tunnel)
5. Agent works: edits, tests, commits
6. Task marked complete -> Seam extracts branch/commits
7. Workspace auto-stops, then destroyed after cooldown

### What Seam Owns

- **Terraform templates** per project or project type
- **Orchestration logic** tying task lifecycle to workspace lifecycle
- **Credential injection** for repo access (GitHub App token, deploy key)
- **Artifact extraction** pulling commits/branches/PR info back
- **Cost policy** auto-stop timeouts, max concurrent workspaces per org

### Infrastructure

- Coder server runs alongside Seam (Docker Compose or K8s)
- Workspaces are Docker containers initially (simplest provisioner)
- Could graduate to K8s pods for better isolation and resource management

### Open Questions

- Coder workspace per task, or per agent session (reuse across tasks)?
- How do agents authenticate to Coder? Seam-issued tokens?
- Do we need real-time streaming of agent output from the workspace?
- DevPod as lighter alternative for v1?
- AGPL-3.0 license implications for Seam's own licensing
