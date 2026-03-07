# Research: Tool Scaling for Local LLMs

**Date**: 2026-03-05
**Context**: 32 MCP tools with complex schemas overwhelm qwen3-coder-30b on llama.cpp

## Problem

1. **anyOf in JSON Schema breaks llama.cpp grammar**: Pydantic `str | None` produces `anyOf: [{type: "string"}, {type: "null"}]`. llama.cpp's grammar-constrained generation has [known limitations with anyOf/oneOf](https://github.com/ggml-org/llama.cpp/issues/7703) — can't mix properties with anyOf in the same type.

2. **32 tools = massive prompt**: Each tool's schema (name, description, parameters with descriptions) consumes ~200-500 tokens. 32 tools ≈ 10-15k tokens just for tool definitions. At ~25 tok/s local inference, prompt processing alone takes significant time.

3. **Tool selection degrades with count**: LangChain docs state "too many tools may overwhelm the model" — accuracy drops as tools increase, especially for smaller models.

## Solutions (ranked by effort)

### 1. Schema Sanitization (DONE)
Strip `anyOf` from nullable fields — use base types with type-appropriate defaults instead of Union types. Already implemented in `tools.py`.

### 2. Dynamic Tool Filtering (RECOMMENDED)
LangChain 1.x middleware (`@wrap_model_call`) supports filtering tools per step:

```python
@wrap_model_call
def select_tools(request: ModelRequest, handler):
    relevant_tools = select_relevant_tools(request.state, request.runtime)
    return handler(request.override(tools=relevant_tools))
```

For our case, simpler approach — filter at graph construction time:

```python
CORE_TOOLS = {"list_tasks", "get_task", "claim_task", "close_task",
              "update_task", "add_comment", "task_summary", "my_info",
              "create_task", "ask_question", "list_activity"}

tools = [t for t in all_tools if t.name in CORE_TOOLS]
```

This drops from 32 to ~11 tools, cutting prompt size by ~60%.

### 3. Tool Routing / Multi-Agent (FUTURE)
Split tools into domain groups, each with a specialized sub-agent:
- **Task agent**: list_tasks, get_task, create_task, update_task, claim_task, close_task
- **Session agent**: get_session, my_info, list_activity, send_message_to
- **Knowledge agent**: list_notes, get_note, update_note, list_requirements

A router agent picks which sub-agent to invoke. LangChain recommends this for 20+ tools — "create a specialized agent for each task or domain and route tasks to the correct expert." Reduces per-agent tool count to 5-8.

### 4. Schema Compression (OPTIONAL)
Strip descriptions from tool parameters to reduce token count. Descriptions help accuracy but cost tokens. For well-named params (e.g., `session_code`, `task_id`), names alone may suffice.

## LangChain Ecosystem Recommendations

- **LangChain 1.x Middleware** (Aug 2025): `wrap_model_call` + `wrap_tool_call` decorators for dynamic tool filtering. Works with `create_agent()`.
- **LangGraph Multi-Agent**: Supervisor/router pattern for domain-specific sub-agents.
- **Context isolation**: Sub-agents process 67% fewer tokens than monolithic agents (LangChain blog).

## llama.cpp Specifics

- Tool calling uses "peg-constructed" chat format with grammar constraints
- Qwen3 has native handler in llama.cpp (`chat.h` PR #9639)
- `reasoning_format: "deepseek"` is active — model does chain-of-thought before tool calls
- Extreme KV quantizations degrade tool calling quality
- `anyOf`/`oneOf` mixed with properties is a known grammar limitation

## Decision

Implement **#2 (Dynamic Tool Filtering)** as the immediate fix. This is the lowest-effort high-impact change — filter to core tools at agent construction time. The schema sanitization (#1) is already done and helps regardless.

#3 (Multi-Agent routing) is the right long-term architecture but requires more work. File as future task.

## Sources

- [LangChain Dynamic Tool Calling](https://changelog.langchain.com/announcements/dynamic-tool-calling-in-langgraph-agents)
- [LangChain Agents Docs](https://docs.langchain.com/oss/python/langchain/agents)
- [LangChain Middleware](https://docs.langchain.com/oss/python/langchain/middleware/custom)
- [llama.cpp Function Calling](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md)
- [llama.cpp anyOf Bug #7703](https://github.com/ggml-org/llama.cpp/issues/7703)
- [Choosing Multi-Agent Architecture](https://blog.langchain.com/choosing-the-right-multi-agent-architecture/)
