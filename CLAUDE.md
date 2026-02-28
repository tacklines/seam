# Multi-Human Workflows Visualizer

Collaborative web app for multi-human Event Storming. Participants create/join sessions via join codes, submit storm-prep YAML files, and visualize combined domain event flows in real time. Built with Lit web components, Vite, and Tailwind CSS v4.

## Operating Mode: Orchestrator

**The primary Claude Code session operates as an orchestrator only.** Do not directly implement tasks -- dispatch work to specialized subagents.

### Orchestrator Responsibilities

1. **Task Dispatch**: Delegate implementation work to appropriate subagents via the Task tool
2. **Coordination**: Manage dependencies between tasks, unblock work, review agent outputs
3. **Backlog Management**: Use `bd` commands to triage, prioritize, and track issues
4. **Session Management**: Run `bd sync` before completing sessions

### Serialized Dispatching

**Dispatch tasks one at a time, not in parallel.** This approach:
- Avoids API throttling, enabling longer uninterrupted work sessions
- Allows learning from each task's output before starting the next
- Reduces context bloat from concurrent agent results

Workflow: dispatch -> wait for completion -> review -> dispatch next task

---

## Quick Reference

```bash
npm run dev          # Vite dev server (port 5173)
npm run build        # tsc + vite build (type-check then bundle)
npm test             # vitest run (all tests)
npm run test:watch   # vitest watch mode
npm run test:e2e     # playwright e2e tests (auto-starts dev server)
npm run test:e2e:ui  # playwright UI mode (interactive test runner)
npm run server       # HTTP session server (port 3001)
npm run mcp          # MCP server (stdio transport)
```

## Project Structure

```
src/
  schema/        # JSON schema + TypeScript types for candidate events
  lib/           # Pure functions: YAML loading/validation, cross-role comparison, ELK layout
  state/         # Reactive store (pub/sub, framework-independent)
  components/    # Lit web components (one element per file)
  server/        # Session HTTP server (REST + SSE) and MCP server
  fixtures/      # Sample YAML files for development
```

## Architecture

- **Schema is the contract** -- YAML files validate against `candidate-events.schema.json`
- **State flows down** via properties, **events bubble up** from child components
- **Store** is a singleton pub/sub (`src/state/app-state.ts`), not framework-coupled
- **Session server** -- HTTP REST + SSE on port 3001; shared `SessionStore` singleton in `src/server/store.ts`
- **MCP server** -- stdio transport with 4 tools (create/join/submit/get session) for AI-assisted workflows
- **Path alias**: `@` maps to `/src` in both Vite and vitest configs
- **Server tsconfig** -- `tsconfig.server.json` for Node-only code (separate from browser tsconfig)

## Key Patterns

- One custom element per file, registered via `@customElement('tag-name')` decorator
- Shoelace components imported per-component (tree-shaking, not full bundle)
- Unit tests colocated next to source: `src/lib/foo.ts` -> `src/lib/foo.test.ts`
- E2E tests in `e2e/` directory using Playwright (config: `playwright.config.ts`)
- `experimentalDecorators: true` + `useDefineForClassFields: false` in tsconfig (required for Lit)

## Skill Quick Reference

| I want to... | Use |
|---|---|
| Explore something unknown | /blossom or /fractal |
| Research + prioritize | /gather -> /distill -> /rank |
| Review code | /review |
| Run a session | /status -> ... -> /retro -> /handoff |

## Do Not Modify

- `src/schema/candidate-events.schema.json` -- shared contract with tackline pipeline
- `node_modules/`
