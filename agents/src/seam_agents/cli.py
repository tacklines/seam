"""CLI entrypoint for seam-agent."""

from __future__ import annotations

import argparse
import sys

from seam_agents.coder_client import CoderMCPClient
from seam_agents.mcp_client import SeamMCPClient
from seam_agents.models import Budget, ModelRequirement

# Import built-in skills so they register
import seam_agents.skills.builtin  # noqa: F401
from seam_agents.skills import list_skills
from seam_agents.workflows.skills_bridge import register_workflow_skills
from seam_agents.agents.session_agent import run_agent


def _parse_requirement(args) -> ModelRequirement | None:
    """Build a ModelRequirement from CLI flags, if any are set."""
    if not args.model and not args.budget:
        return None
    return ModelRequirement(
        model_hint=args.model,
        exact=bool(args.model),
        max_budget=Budget(args.budget) if args.budget else None,
    )


def main():
    # Register workflow-backed skills alongside builtin skills
    register_workflow_skills()

    parser = argparse.ArgumentParser(
        prog="seam-agent",
        description="LangGraph-powered agent for Seam collaborative sessions",
    )
    parser.add_argument("agent_code", help="8-character agent join code")
    parser.add_argument("--name", default="seam-agent", help="Agent display name")
    parser.add_argument("--skill", help="Run a specific skill (e.g. triage, decompose)")
    parser.add_argument("--message", "-m", help="Single message to process (non-interactive)")
    parser.add_argument(
        "--model",
        help="Model hint: exact name (devstral-tuned) or alias (opus, qwen, haiku). "
             "Aliases are resolved to capability needs if the exact model isn't available.",
    )
    parser.add_argument(
        "--budget",
        choices=["free", "economy", "moderate", "unlimited"],
        help="Maximum cost tier for model selection",
    )
    parser.add_argument(
        "--no-coder",
        action="store_true",
        help="Disable Coder workspace integration even if configured",
    )
    parser.add_argument(
        "--workflow",
        help="Run a goal-routed workflow (auto-selects best primitive/pipeline)",
    )
    args = parser.parse_args()

    client = SeamMCPClient(agent_code=args.agent_code, agent_name=args.name)
    cli_requirement = _parse_requirement(args)

    # Optionally connect to Coder MCP
    coder_client = None
    if not args.no_coder:
        coder_client = _try_connect_coder()
        if coder_client:
            print("Coder workspace management enabled")

    try:
        client.connect()
        print(f"Connected to Seam MCP at {client._seam_url}")

        # Join the session using the agent code with composition metadata
        join_params: dict = {
            "code": args.agent_code,
            "display_name": args.name,
            "client_name": "seam-agent",
            "client_version": "0.1.0",
        }
        if args.model:
            join_params["model"] = args.model
        join_result = client.call_tool("join_session", join_params)
        print(f"Joined session: {join_result}")

        if args.workflow:
            # Workflow mode: route goal to best workflow
            from seam_agents.workflows.router import run_workflow as run_wf
            from seam_agents.agents.session_agent import _build_llm
            from seam_agents.tools import mcp_tools_from_client
            llm_raw, profile = _build_llm(cli_requirement)
            try:
                client.call_tool("update_composition", {"model": profile.name})
            except Exception:
                pass
            tools = mcp_tools_from_client(client)
            print(f"Routing workflow with {profile.name}...")
            result = run_wf(args.workflow, llm_raw, tools)
            pipe_output = result.get("pipe_output")
            if pipe_output:
                print(pipe_output.as_context())
            else:
                print("(workflow produced no output)")
        elif args.message:
            # Single-shot mode
            result = run_agent(
                client, args.message,
                skill_name=args.skill, requirement=cli_requirement,
                coder_client=coder_client,
            )
            print(result)
        else:
            # Interactive REPL
            _repl(client, args.skill, cli_requirement, coder_client=coder_client)
    except KeyboardInterrupt:
        pass
    finally:
        client.disconnect()
        if coder_client:
            coder_client.disconnect()


def _try_connect_coder() -> CoderMCPClient | None:
    """Connect to Coder MCP server if configured. Returns None if unavailable."""
    from seam_agents.config import settings
    if not settings.coder_url or not settings.coder_session_token:
        return None
    try:
        client = CoderMCPClient()
        client.connect()
        return client
    except Exception as e:
        print(f"Coder MCP unavailable: {e}")
        return None


def _repl(
    client: SeamMCPClient,
    default_skill: str | None = None,
    cli_requirement: ModelRequirement | None = None,
    coder_client: CoderMCPClient | None = None,
):
    skills = {s.name: s for s in list_skills()}
    print("\nSeam Agent REPL — type /help for commands, Ctrl+C to exit\n")

    while True:
        try:
            user_input = input("seam> ").strip()
        except EOFError:
            break

        if not user_input:
            continue

        if user_input == "/help":
            print("Commands:")
            print("  /skills          — List available skills")
            print("  /models          — Show available models")
            print("  /workflow <goal>  — Route goal to best workflow")
            print("  /<skill_name>    — Run a skill (e.g. /triage, /w:research)")
            print("  /quit            — Exit")
            print("  <anything else>  — Send to agent")
            continue

        if user_input == "/skills":
            for s in skills.values():
                req_info = ""
                if s.model_requirement and s.model_requirement.capabilities:
                    caps = ", ".join(c.value for c in s.model_requirement.capabilities)
                    req_info = f" [needs: {caps}]"
                print(f"  /{s.name:15s} — {s.description}{req_info}")
            continue

        if user_input == "/models":
            from seam_agents.config import build_model_registry
            registry = build_model_registry()
            for m in registry.available:
                caps = ", ".join(f"{c.value}={v:.1f}" for c, v in sorted(m.capabilities.items(), key=lambda x: -x[1])[:3])
                print(f"  {m.name:25s} {m.provider:10s} {m.budget.value:10s} {m.context_window:>6d} ctx  ~{m.tok_per_sec:.0f} tok/s  [{caps}]")
            continue

        if user_input == "/quit":
            break

        # Check for workflow routing command
        if user_input.startswith("/workflow "):
            goal = user_input[len("/workflow "):].strip()
            if goal:
                from seam_agents.workflows.router import run_workflow as run_wf
                from seam_agents.agents.session_agent import _build_llm
                from seam_agents.tools import mcp_tools_from_client
                llm_raw, profile = _build_llm(cli_requirement)
                tools = mcp_tools_from_client(client)
                print(f"Routing with {profile.name}...")
                result = run_wf(goal, llm_raw, tools)
                pipe_output = result.get("pipe_output")
                if pipe_output:
                    print(f"\n{pipe_output.as_context()}\n")
                else:
                    print("(workflow produced no output)")
            else:
                print("Usage: /workflow <goal description>")
            continue

        # Check if it's a skill invocation
        skill_name = None
        message = user_input
        if user_input.startswith("/"):
            parts = user_input.split(None, 1)
            candidate = parts[0][1:]  # strip leading /
            if candidate in skills:
                skill_name = candidate
                message = parts[1] if len(parts) > 1 else f"Run the {candidate} skill"

        result = run_agent(
            client, message,
            skill_name=skill_name or default_skill,
            requirement=cli_requirement,
            coder_client=coder_client,
        )
        print(f"\n{result}\n")


if __name__ == "__main__":
    main()
