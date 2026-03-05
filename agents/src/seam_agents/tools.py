"""LangChain tools that wrap Seam MCP operations."""

from __future__ import annotations

import asyncio
from typing import Any

import nest_asyncio
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from seam_agents.mcp_client import SeamMCPClient

# Allow nested event loop usage — needed because LangGraph's ToolNode
# calls sync tool functions from within an already-running event loop.
nest_asyncio.apply()


def mcp_tools_from_client(client: SeamMCPClient, loop: asyncio.AbstractEventLoop | None = None) -> list[StructuredTool]:
    """Convert MCP tool definitions into LangChain StructuredTools."""
    if loop is None:
        loop = asyncio.get_event_loop()
    mcp_tools = loop.run_until_complete(client.list_tools())

    lc_tools = []
    for tool_def in mcp_tools:
        name = tool_def["name"]
        description = tool_def["description"] or name
        schema = tool_def.get("input_schema", {})

        # Build a dynamic Pydantic model from the JSON schema properties
        fields: dict[str, Any] = {}
        props = schema.get("properties", {})
        required = set(schema.get("required", []))
        for prop_name, prop_schema in props.items():
            prop_type = _json_type_to_python(prop_schema.get("type", "string"))
            prop_desc = prop_schema.get("description", "")
            if prop_name in required:
                fields[prop_name] = (prop_type, Field(description=prop_desc))
            else:
                fields[prop_name] = (prop_type | None, Field(default=None, description=prop_desc))

        ArgsModel = type(f"{name}_args", (BaseModel,), {"__annotations__": {k: v[0] for k, v in fields.items()}, **{k: v[1] for k, v in fields.items()}})

        def _make_fn(tool_name: str):
            def fn(**kwargs) -> str:
                args = {k: v for k, v in kwargs.items() if v is not None}
                return loop.run_until_complete(client.call_tool(tool_name, args))
            return fn

        lc_tools.append(
            StructuredTool(
                name=name,
                description=description,
                func=_make_fn(name),
                args_schema=ArgsModel,
            )
        )

    return lc_tools


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
