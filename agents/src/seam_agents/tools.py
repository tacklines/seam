"""LangChain tools that wrap Seam MCP operations."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from seam_agents.mcp_client import SeamMCPClient


# Core tools sufficient for most agent tasks. Keeps prompt small for local LLMs.
CORE_TOOLS = {
    "list_tasks", "get_task", "create_task", "update_task",
    "claim_task", "close_task", "unclaim_task", "delete_task",
    "add_comment", "task_summary", "my_info",
    "get_session", "list_activity",
    "ask_question", "list_questions",
    "send_message_to",
}


def mcp_tools_from_client(
    client: SeamMCPClient,
    allowed: set[str] | None = None,
) -> list[StructuredTool]:
    """Convert MCP tool definitions into LangChain StructuredTools.

    Args:
        client: Connected MCP client.
        allowed: If provided, only include tools with these names.
                 Pass CORE_TOOLS for local LLMs to reduce prompt size.
    """
    mcp_tools = client.list_tools()

    lc_tools = []
    for tool_def in mcp_tools:
        name = tool_def["name"]
        if allowed is not None and name not in allowed:
            continue
        description = tool_def["description"] or name
        schema = tool_def.get("input_schema", {})

        # Build a dynamic Pydantic model from the JSON schema properties.
        # Avoid Union types (str | None) — they produce anyOf in JSON Schema,
        # which breaks grammar-constrained tool calling in llama.cpp.
        # Instead, use base types with type-appropriate defaults.
        fields: dict[str, Any] = {}
        props = schema.get("properties", {})
        required = set(schema.get("required", []))
        for prop_name, prop_schema in props.items():
            prop_type = _json_type_to_python(prop_schema.get("type", "string"))
            prop_desc = prop_schema.get("description", "")
            if prop_name in required:
                fields[prop_name] = (prop_type, Field(description=prop_desc))
            else:
                default = _default_for_type(prop_type)
                fields[prop_name] = (prop_type, Field(default=default, description=prop_desc))

        ArgsModel = type(f"{name}_args", (BaseModel,), {"__annotations__": {k: v[0] for k, v in fields.items()}, **{k: v[1] for k, v in fields.items()}})

        optional_fields = set(props.keys()) - required

        def _make_fn(tool_name: str, opt_fields: set[str]):
            def fn(**kwargs) -> str:
                # Strip optional params at their default sentinel value
                args = {}
                for k, v in kwargs.items():
                    if k in opt_fields and v == _default_for_type(type(v)):
                        continue
                    args[k] = v
                return client.call_tool(tool_name, args)
            return fn

        lc_tools.append(
            StructuredTool(
                name=name,
                description=description,
                func=_make_fn(name, optional_fields),
                args_schema=ArgsModel,
            )
        )

    return lc_tools


def _default_for_type(python_type: type) -> Any:
    """Return a sentinel default for an optional field that avoids anyOf in JSON Schema."""
    return {str: "", int: 0, float: 0.0, bool: False}.get(python_type, "")


def _json_type_to_python(json_type: str | list) -> type:
    # JSON Schema nullable types come as ["string", "null"]
    if isinstance(json_type, list):
        non_null = [t for t in json_type if t != "null"]
        json_type = non_null[0] if non_null else "string"
    return {
        "string": str,
        "integer": int,
        "number": float,
        "boolean": bool,
    }.get(json_type, str)
