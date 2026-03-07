# Seam Workspace: Task Management via MCP

When `SEAM_TOKEN` is set (running as a Seam agent), all task management goes through Seam MCP tools.

## Task Management

| Action | MCP tool |
|---|---|
| Create a task | `create_task` |
| List tasks | `list_tasks` |
| View task details | `get_task` |
| Update a task | `update_task` |
| Close a task | `close_task` |
| Find available work | `list_tasks` with status filters + `task_summary` |
| Add dependency | `add_dependency` |

## Communication

| Action | MCP tool |
|---|---|
| Progress updates / notes | `add_comment` |
| Ask human for clarification | `ask_question` |
| Check for human messages | `check_messages` |
| Send message to participant | `send_message` |

## When This Applies

- `SEAM_TOKEN` is set: use MCP tools above (this rule)
- `SEAM_TOKEN` is NOT set (local dev): use your preferred task tracking approach
