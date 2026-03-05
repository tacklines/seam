# Seam Agents

LangGraph-powered agents for Seam collaborative sessions. Connects to the Seam MCP server to participate in sessions, manage tasks, answer questions, and run skills autonomously.

## Setup

```bash
cp .env.example .env
# Edit .env with your configuration
uv sync
```

### Prerequisites

- **Seam MCP binary**: Built from `../server` (`cargo build` produces `seam-mcp`)
- **Ollama** (optional): Local models for free-tier inference
- **Anthropic API key** (optional): Enables Claude models via the API
- **Coder** (optional): Workspace sandbox management for isolated execution

## Usage

```bash
# Interactive REPL
uv run seam-agent <agent-code>

# Single-shot with a skill
uv run seam-agent <agent-code> --skill triage -m "Review all open tasks"

# Model selection
uv run seam-agent <agent-code> --model opus -m "Complex analysis task"
uv run seam-agent <agent-code> --budget free -m "Quick summary"

# Disable Coder integration
uv run seam-agent <agent-code> --no-coder
```

### REPL Commands

- `/skills` — List available skills with model requirements
- `/models` — Show registered models with capabilities
- `/<skill>` — Run a skill (e.g., `/triage`, `/research`)
- `/help` — Command reference
- `/quit` — Exit

## Architecture

```
CLI (cli.py)
  -> SeamMCPClient (mcp_client.py)     — stdio connection to seam-mcp
  -> CoderMCPClient (coder_client.py)   — stdio connection to coder mcp (optional)
  -> ModelRouter (models/router.py)     — resolves requirements to best model
  -> SessionAgent (agents/session_agent.py) — LangGraph tool-calling loop
  -> Skills (skills/)                   — registered skill prompts
  -> Tracing (tracing.py)              — Langfuse callback integration
```

### Model Router

The router selects models based on capability requirements, budget constraints, and availability. Models are registered from two sources:

- **Ollama models**: Always available (local, free-tier)
- **Anthropic models**: Available when `ANTHROPIC_API_KEY` is set

Each model has a capability profile (coding, reasoning, tool_use, speed, etc.) and a budget tier (free, economy, moderate, unlimited). Skills can declare model requirements; the router picks the best fit.

```python
# Router resolves by capability match + budget filter
ModelRequirement(capabilities=[Capability.CODING])                    # best coder
ModelRequirement(model_hint="opus")                                   # extract opus-like capabilities
ModelRequirement(capabilities=[Capability.SPEED], max_budget=Budget.FREE)  # fast and free
ModelRequirement(model_hint="devstral-tuned", exact=True)             # exact model
```

### MCP Clients

Both `SeamMCPClient` and `CoderMCPClient` connect to MCP servers over stdio. They manage the subprocess lifecycle (connect/disconnect), convert MCP tools to LangChain `StructuredTool` instances, and provide async `call_tool` wrappers.

Coder tools are prefixed with `coder_` to avoid name collisions with Seam tools.

### Skills

Skills are registered Python objects with a name, description, system prompt, and optional model requirement. Built-in skills are in `skills/builtin.py`. The agent prepends the skill's system prompt when invoked via `/<skill>` in the REPL or `--skill` on the CLI.

### Tracing

When Langfuse credentials are configured, all agent invocations are traced with session and tag metadata. Useful for debugging model routing decisions and tool call patterns.

## Source Files

| File | Purpose |
|------|---------|
| `cli.py` | CLI entrypoint, argument parsing, REPL loop |
| `config.py` | Settings from `.env` via pydantic-settings |
| `mcp_client.py` | Seam MCP stdio client |
| `coder_client.py` | Coder MCP stdio client (workspace management) |
| `tools.py` | MCP-to-LangChain tool conversion |
| `agents/session_agent.py` | LangGraph agent graph, model building, run_agent |
| `models/registry.py` | Model profiles, capability enum, registry |
| `models/router.py` | Requirement-based model resolution |
| `skills/__init__.py` | Skill registry |
| `skills/builtin.py` | Built-in skill definitions |
| `tracing.py` | Langfuse callback handler |
