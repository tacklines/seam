"""Session agent — the main LangGraph agent that works within a Seam session."""

from __future__ import annotations

import logging

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import MessagesState, StateGraph, START, END
from langgraph.prebuilt import ToolNode

from seam_agents.config import settings, build_model_registry
from seam_agents.coder_client import CoderMCPClient
from seam_agents.mcp_client import SeamMCPClient
from seam_agents.models import ModelProfile, ModelRequirement, ModelRouter
from seam_agents.skills import get_skill, list_skills
from seam_agents.tools import mcp_tools_from_client
from seam_agents.tracing import get_langfuse_handler

log = logging.getLogger(__name__)


SYSTEM_PROMPT = """\
You are a Seam session agent — an AI participant in a collaborative work session.

You have access to Seam MCP tools for managing tasks, notes, questions, and session state.
{coder_context}
You can be directed to run specific skills or work autonomously on the session's goals.

Available skills: {skills}

When asked to run a skill, follow its system prompt closely.
When working autonomously, focus on what advances the session's goals.
Be concise and action-oriented. Use tools proactively.
"""


def _build_llm(requirement: ModelRequirement | None = None) -> tuple[BaseChatModel, ModelProfile]:
    """Build the LLM by routing a requirement to the best available model.

    Returns both the LLM instance and the resolved profile for logging.
    """
    registry = build_model_registry()
    router = ModelRouter(registry)

    if requirement is None:
        requirement = ModelRequirement()

    profile = router.resolve(requirement)
    log.info("Model router: %s", router.explain(requirement))

    if profile.provider == "ollama":
        from langchain_ollama import ChatOllama
        llm = ChatOllama(
            model=profile.name,
            base_url=settings.ollama_base_url,
        )
    elif profile.provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(
            model=profile.name,
            api_key=settings.anthropic_api_key,
            max_tokens=4096,
        )
    else:
        raise ValueError(f"Unknown provider: {profile.provider}")

    return llm, profile


async def _try_connect_coder() -> CoderMCPClient | None:
    """Connect to Coder MCP server if configured. Returns None if unavailable."""
    if not settings.coder_url or not settings.coder_session_token:
        return None
    try:
        client = CoderMCPClient()
        await client.connect()
        return client
    except Exception as e:
        log.warning("Coder MCP unavailable: %s", e)
        return None


def build_session_agent(
    mcp_client: SeamMCPClient,
    coder_client: CoderMCPClient | None = None,
    requirement: ModelRequirement | None = None,
):
    """Build a compiled LangGraph agent wired to Seam and optionally Coder MCP tools."""

    # Convert MCP tools to LangChain tools
    tools = mcp_tools_from_client(mcp_client)
    if coder_client is not None:
        coder_tools = mcp_tools_from_client(coder_client)
        # Prefix coder tool names to avoid collisions
        for tool in coder_tools:
            tool.name = f"coder_{tool.name}"
        tools.extend(coder_tools)
    tool_node = ToolNode(tools)

    # Route to best model and bind tools
    llm_raw, profile = _build_llm(requirement)
    llm = llm_raw.bind_tools(tools)
    log.info("Agent using model: %s (%s, %d ctx, ~%.0f tok/s)",
             profile.name, profile.provider, profile.context_window, profile.tok_per_sec)

    skill_list = ", ".join(f"/{s.name} — {s.description}" for s in list_skills())
    coder_context = (
        "You also have Coder workspace tools (prefixed coder_) for creating, managing, "
        "and executing commands in sandboxed workspaces."
        if coder_client is not None
        else ""
    )

    def agent_node(state: MessagesState):
        system = SystemMessage(content=SYSTEM_PROMPT.format(
            skills=skill_list, coder_context=coder_context,
        ))
        messages = [system] + state["messages"]
        response = llm.invoke(messages)
        return {"messages": [response]}

    def should_continue(state: MessagesState) -> str:
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        return END

    # Build the graph
    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")

    return graph.compile()


def run_agent(
    mcp_client: SeamMCPClient,
    message: str,
    skill_name: str | None = None,
    requirement: ModelRequirement | None = None,
    coder_client: CoderMCPClient | None = None,
) -> str:
    """Run the session agent with a message, optionally using a skill's system prompt.

    Model selection priority:
    1. Explicit requirement parameter (if provided)
    2. Skill's model_requirement (if skill specifies one)
    3. Default (router picks best general-purpose model)
    """
    # Let skill override model requirement if not explicitly provided
    if skill_name and requirement is None:
        skill = get_skill(skill_name)
        if skill and skill.model_requirement:
            requirement = skill.model_requirement

    agent = build_session_agent(mcp_client, coder_client=coder_client, requirement=requirement)

    # If a skill is specified, prepend its system prompt
    if skill_name:
        skill = get_skill(skill_name)
        if skill:
            message = f"[Running skill: {skill.name}]\n\n{skill.system_prompt}\n\nUser request: {message}"

    config = {}
    handler = get_langfuse_handler(
        session_id=f"seam-{mcp_client.agent_code}",
        tags=["seam-agent", skill_name or "freeform"],
    )
    if handler:
        config["callbacks"] = [handler]

    result = agent.invoke(
        {"messages": [HumanMessage(content=message)]},
        config=config,
    )

    # Return the last AI message that isn't a tool call
    for msg in reversed(result["messages"]):
        if hasattr(msg, "content") and msg.content:
            if not getattr(msg, "tool_calls", None):
                return msg.content
    return "(no response)"
