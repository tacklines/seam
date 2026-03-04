mod models;

use clap::Parser;
use rmcp::{
    ErrorData as McpError,
    ServerHandler,
    ServiceExt,
    handler::server::tool::ToolRouter,
    model::{CallToolResult, Content},
    tool, tool_router, tool_handler,
    handler::server::wrapper::Parameters,
    schemars::JsonSchema,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;
use chrono::Utc;
use models::{Task, TaskComment, TaskStatus};

use models::{AgentJoinCode, Participant, Session, User};

#[derive(Parser)]
#[command(name = "seam-mcp", about = "Seam MCP server for agent session access")]
struct Cli {
    /// Agent join code (8-character)
    #[arg(long)]
    agent_code: Option<String>,

    /// Display name for the agent
    #[arg(long)]
    agent_name: Option<String>,

    /// Database URL
    #[arg(long, env = "DATABASE_URL", default_value = "postgres://seam:seam@localhost:5433/seam")]
    database_url: String,
}

// --- Tool parameter schemas ---

#[derive(Debug, Deserialize, JsonSchema)]
struct JoinSessionParams {
    /// 8-character agent join code
    code: String,
    /// Display name for the agent in the session
    display_name: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetSessionParams {
    /// Session code (6-character). Omit to use your current session.
    code: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CreateTaskParams {
    /// Task type: epic, story, task, subtask, or bug
    task_type: String,
    /// Task title
    title: String,
    /// Detailed description (markdown supported)
    description: Option<String>,
    /// Parent task ID for hierarchy (e.g. story under epic)
    parent_id: Option<String>,
    /// Participant ID to assign to
    assigned_to: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListTasksParams {
    /// Filter by task type: epic, story, task, subtask, bug
    task_type: Option<String>,
    /// Filter by status: open, in_progress, done, closed
    status: Option<String>,
    /// Filter by parent task ID (get children of a task)
    parent_id: Option<String>,
    /// Filter by assigned participant ID
    assigned_to: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetTaskParams {
    /// Task ID
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateTaskParams {
    /// Task ID to update
    id: String,
    /// New title
    title: Option<String>,
    /// New description
    description: Option<String>,
    /// New status: open, in_progress, done, closed
    status: Option<String>,
    /// New assignee participant ID (use "none" to unassign)
    assigned_to: Option<String>,
    /// New parent task ID (use "none" to remove parent)
    parent_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct AddCommentParams {
    /// Task ID to comment on
    task_id: String,
    /// Comment content (markdown supported, use for evidence, code refs, etc.)
    content: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CloseTaskParams {
    /// Task ID to close
    id: String,
    /// Git commit SHA to link (for traceability)
    commit_sha: Option<String>,
}

// --- MCP Server ---

#[derive(Clone)]
struct SeamMcp {
    db: PgPool,
    session_code: Option<String>,
    participant_id: Option<Uuid>,
    sponsor_name: Option<String>,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl SeamMcp {
    fn new(db: PgPool) -> Self {
        Self {
            db,
            session_code: None,
            participant_id: None,
            sponsor_name: None,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(description = "Join a Seam session using an agent join code. The code identifies both the session and your sponsoring user.")]
    async fn join_session(
        &self,
        Parameters(params): Parameters<JoinSessionParams>,
    ) -> Result<CallToolResult, McpError> {
        match self.do_agent_join(&params.code, params.display_name.as_deref()).await {
            Ok(result) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&result).unwrap(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(description = "Get session state including all participants. Provide session code or omit to use your current session.")]
    async fn get_session(
        &self,
        Parameters(params): Parameters<GetSessionParams>,
    ) -> Result<CallToolResult, McpError> {
        let code = match params.code.or_else(|| self.session_code.clone()) {
            Some(c) => c,
            None => return Ok(CallToolResult::error(vec![Content::text(
                "No session code provided and not currently in a session. Use join_session first.",
            )])),
        };

        match self.fetch_session(&code).await {
            Ok(session) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&session).unwrap(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(description = "Get your own participant info including ID, session code, and sponsor name. Only available after joining a session.")]
    async fn my_info(&self) -> Result<CallToolResult, McpError> {
        let Some(ref session_code) = self.session_code else {
            return Ok(CallToolResult::error(vec![Content::text(
                "Not in a session. Use join_session first.",
            )]));
        };

        let info = serde_json::json!({
            "participant_id": self.participant_id,
            "session_code": session_code,
            "sponsor_name": self.sponsor_name,
        });

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&info).unwrap(),
        )]))
    }

    #[tool(description = "Create a task in the current session. Types: epic, story, task, subtask, bug. Use parent_id for hierarchy (e.g. stories under epics).")]
    async fn create_task(
        &self,
        Parameters(params): Parameters<CreateTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let valid_types = ["epic", "story", "task", "subtask", "bug"];
        if !valid_types.contains(&params.task_type.as_str()) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Invalid task_type '{}'. Must be one of: {}", params.task_type, valid_types.join(", ")),
            )]));
        }

        let parent_id = match params.parent_id {
            Some(ref s) => Some(Uuid::parse_str(s).map_err(|_| ())
                .map_err(|_| ())
                .ok()
                .ok_or("Invalid parent_id UUID")),
            None => None,
        };
        let parent_id = match parent_id {
            Some(Ok(id)) => Some(id),
            Some(Err(e)) => return Ok(CallToolResult::error(vec![Content::text(e)])),
            None => None,
        };

        let assigned_to = match params.assigned_to {
            Some(ref s) => Some(Uuid::parse_str(s).map_err(|_| "Invalid assigned_to UUID")),
            None => None,
        };
        let assigned_to = match assigned_to {
            Some(Ok(id)) => Some(id),
            Some(Err(e)) => return Ok(CallToolResult::error(vec![Content::text(e)])),
            None => None,
        };

        let task_id = Uuid::new_v4();
        match sqlx::query(
            "INSERT INTO tasks (id, session_id, parent_id, task_type, title, description, status, assigned_to, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, NOW(), NOW())"
        )
        .bind(task_id)
        .bind(session_id)
        .bind(parent_id)
        .bind(&params.task_type)
        .bind(&params.title)
        .bind(&params.description)
        .bind(assigned_to)
        .bind(participant_id)
        .execute(&self.db)
        .await {
            Ok(_) => {
                let task = self.fetch_task(task_id).await;
                match task {
                    Ok(t) => Ok(CallToolResult::success(vec![Content::text(
                        serde_json::to_string_pretty(&t).unwrap(),
                    )])),
                    Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
                }
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed to create task: {e}"))])),
        }
    }

    #[tool(description = "List tasks in the current session. Filter by task_type, status, parent_id, or assigned_to.")]
    async fn list_tasks(
        &self,
        Parameters(params): Parameters<ListTasksParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let mut query = String::from("SELECT * FROM tasks WHERE session_id = $1");
        let mut param_idx = 2u32;

        // Build dynamic query with filters
        let mut bind_values: Vec<String> = vec![];

        if let Some(ref tt) = params.task_type {
            query.push_str(&format!(" AND task_type = ${param_idx}"));
            bind_values.push(tt.clone());
            param_idx += 1;
        }
        if let Some(ref st) = params.status {
            query.push_str(&format!(" AND status = ${param_idx}"));
            bind_values.push(st.clone());
            param_idx += 1;
        }
        if let Some(ref pid) = params.parent_id {
            if pid == "none" || pid == "null" {
                query.push_str(" AND parent_id IS NULL");
            } else {
                query.push_str(&format!(" AND parent_id = ${param_idx}"));
                bind_values.push(pid.clone());
                param_idx += 1;
            }
        }
        if let Some(ref at) = params.assigned_to {
            query.push_str(&format!(" AND assigned_to = ${param_idx}"));
            bind_values.push(at.clone());
            let _ = param_idx; // suppress unused warning
        }

        query.push_str(" ORDER BY created_at");

        // Use raw query with dynamic bindings
        let mut q = sqlx::query_as::<_, Task>(&query).bind(session_id);
        for val in &bind_values {
            q = q.bind(val);
        }

        match q.fetch_all(&self.db).await {
            Ok(tasks) => {
                let summary: Vec<serde_json::Value> = tasks.iter().map(|t| {
                    serde_json::json!({
                        "id": t.id,
                        "task_type": serde_json::to_value(&t.task_type).unwrap(),
                        "title": t.title,
                        "status": serde_json::to_value(&t.status).unwrap(),
                        "parent_id": t.parent_id,
                        "assigned_to": t.assigned_to,
                        "created_at": t.created_at,
                    })
                }).collect();
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&summary).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Query error: {e}"))])),
        }
    }

    #[tool(description = "Get a task by ID with full details including description and comments.")]
    async fn get_task(
        &self,
        Parameters(params): Parameters<GetTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let task_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task ID")])),
        };

        match self.fetch_task_with_comments(task_id).await {
            Ok(result) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&result).unwrap(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(description = "Update a task's title, description, status, assignee, or parent. Only provided fields are changed.")]
    async fn update_task(
        &self,
        Parameters(params): Parameters<UpdateTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let task_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task ID")])),
        };

        // Fetch current task
        let task: Task = match sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
            .bind(task_id)
            .fetch_optional(&self.db)
            .await
        {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(CallToolResult::error(vec![Content::text("Task not found")])),
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Database error: {e}"))])),
        };

        let title = params.title.as_deref().unwrap_or(&task.title);
        let description = match &params.description {
            Some(d) => Some(d.as_str()),
            None => task.description.as_deref(),
        };

        let status = params.status.as_deref().unwrap_or(
            match task.status {
                TaskStatus::Open => "open",
                TaskStatus::InProgress => "in_progress",
                TaskStatus::Done => "done",
                TaskStatus::Closed => "closed",
            }
        );

        let valid_statuses = ["open", "in_progress", "done", "closed"];
        if !valid_statuses.contains(&status) {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Invalid status '{}'. Must be one of: {}", status, valid_statuses.join(", ")),
            )]));
        }

        let assigned_to = match &params.assigned_to {
            Some(s) if s == "none" || s == "null" => None,
            Some(s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid assigned_to UUID")])),
            },
            None => task.assigned_to,
        };

        let parent_id = match &params.parent_id {
            Some(s) if s == "none" || s == "null" => None,
            Some(s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid parent_id UUID")])),
            },
            None => task.parent_id,
        };

        let closed_at = if status == "closed" || status == "done" {
            Some(Utc::now())
        } else {
            None
        };

        match sqlx::query(
            "UPDATE tasks SET title = $1, description = $2, status = $3, assigned_to = $4, parent_id = $5, closed_at = COALESCE($6, closed_at), updated_at = NOW() WHERE id = $7"
        )
        .bind(title)
        .bind(description)
        .bind(status)
        .bind(assigned_to)
        .bind(parent_id)
        .bind(closed_at)
        .bind(task_id)
        .execute(&self.db)
        .await {
            Ok(_) => {
                let updated = self.fetch_task(task_id).await;
                match updated {
                    Ok(t) => Ok(CallToolResult::success(vec![Content::text(
                        serde_json::to_string_pretty(&t).unwrap(),
                    )])),
                    Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
                }
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Update failed: {e}"))])),
        }
    }

    #[tool(description = "Add a comment to a task. Use for evidence, code references, discussion, or status updates.")]
    async fn add_comment(
        &self,
        Parameters(params): Parameters<AddCommentParams>,
    ) -> Result<CallToolResult, McpError> {
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let task_id = match Uuid::parse_str(&params.task_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task_id")])),
        };

        // Verify task exists
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)")
            .bind(task_id)
            .fetch_one(&self.db)
            .await
            .unwrap_or(false);

        if !exists {
            return Ok(CallToolResult::error(vec![Content::text("Task not found")]));
        }

        let comment_id = Uuid::new_v4();
        match sqlx::query(
            "INSERT INTO task_comments (id, task_id, author_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())"
        )
        .bind(comment_id)
        .bind(task_id)
        .bind(participant_id)
        .bind(&params.content)
        .execute(&self.db)
        .await {
            Ok(_) => {
                let comment = serde_json::json!({
                    "id": comment_id,
                    "task_id": task_id,
                    "author_id": participant_id,
                    "content": params.content,
                });
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&comment).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed to add comment: {e}"))])),
        }
    }

    #[tool(description = "Close a task and optionally link it to a git commit SHA for traceability.")]
    async fn close_task(
        &self,
        Parameters(params): Parameters<CloseTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let task_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task ID")])),
        };

        match sqlx::query(
            "UPDATE tasks SET status = 'closed', commit_sha = COALESCE($1, commit_sha), closed_at = NOW(), updated_at = NOW() WHERE id = $2"
        )
        .bind(&params.commit_sha)
        .bind(task_id)
        .execute(&self.db)
        .await {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text("Task not found")]))
            }
            Ok(_) => {
                let task = self.fetch_task(task_id).await;
                match task {
                    Ok(t) => Ok(CallToolResult::success(vec![Content::text(
                        serde_json::to_string_pretty(&t).unwrap(),
                    )])),
                    Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
                }
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Close failed: {e}"))])),
        }
    }

    #[tool(description = "Delete a task and all its children. Use with caution — this is irreversible.")]
    async fn delete_task(
        &self,
        Parameters(params): Parameters<GetTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let task_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task ID")])),
        };

        match sqlx::query("DELETE FROM tasks WHERE id = $1")
            .bind(task_id)
            .execute(&self.db)
            .await
        {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text("Task not found")]))
            }
            Ok(_) => Ok(CallToolResult::success(vec![Content::text("Task deleted")])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Delete failed: {e}"))])),
        }
    }
}

#[tool_handler]
impl ServerHandler for SeamMcp {}

// --- Internal helpers ---
impl SeamMcp {
    fn require_participant(&self) -> Result<Uuid, CallToolResult> {
        self.participant_id.ok_or_else(|| {
            CallToolResult::error(vec![Content::text(
                "Not in a session. Use join_session first.",
            )])
        })
    }

    async fn require_session(&self) -> Result<Uuid, CallToolResult> {
        let Some(ref code) = self.session_code else {
            return Err(CallToolResult::error(vec![Content::text(
                "Not in a session. Use join_session first.",
            )]));
        };

        let session: Option<Session> = sqlx::query_as(
            "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL",
        )
        .bind(code)
        .fetch_optional(&self.db)
        .await
        .map_err(|_| CallToolResult::error(vec![Content::text("Database error")]))?;

        session.map(|s| s.id).ok_or_else(|| {
            CallToolResult::error(vec![Content::text("Session not found or closed")])
        })
    }

    async fn fetch_task(&self, id: Uuid) -> Result<serde_json::Value, String> {
        let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.db)
            .await
            .map_err(|e| format!("Database error: {e}"))?
            .ok_or_else(|| "Task not found".to_string())?;

        Ok(serde_json::json!({
            "id": task.id,
            "session_id": task.session_id,
            "parent_id": task.parent_id,
            "task_type": serde_json::to_value(&task.task_type).unwrap(),
            "title": task.title,
            "description": task.description,
            "status": serde_json::to_value(&task.status).unwrap(),
            "assigned_to": task.assigned_to,
            "created_by": task.created_by,
            "commit_sha": task.commit_sha,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            "closed_at": task.closed_at,
        }))
    }

    async fn fetch_task_with_comments(&self, id: Uuid) -> Result<serde_json::Value, String> {
        let mut task_json = self.fetch_task(id).await?;

        let comments: Vec<TaskComment> = sqlx::query_as(
            "SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at",
        )
        .bind(id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let comment_views: Vec<serde_json::Value> = comments.iter().map(|c| {
            serde_json::json!({
                "id": c.id,
                "author_id": c.author_id,
                "content": c.content,
                "created_at": c.created_at,
            })
        }).collect();

        // Also fetch children
        let children: Vec<Task> = sqlx::query_as(
            "SELECT * FROM tasks WHERE parent_id = $1 ORDER BY created_at",
        )
        .bind(id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let child_views: Vec<serde_json::Value> = children.iter().map(|t| {
            serde_json::json!({
                "id": t.id,
                "task_type": serde_json::to_value(&t.task_type).unwrap(),
                "title": t.title,
                "status": serde_json::to_value(&t.status).unwrap(),
                "assigned_to": t.assigned_to,
            })
        }).collect();

        task_json["comments"] = serde_json::json!(comment_views);
        task_json["children"] = serde_json::json!(child_views);
        Ok(task_json)
    }

    async fn do_agent_join(
        &self,
        code: &str,
        display_name: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let agent_code: AgentJoinCode = sqlx::query_as(
            "SELECT * FROM agent_join_codes WHERE code = $1",
        )
        .bind(code)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Invalid agent code".to_string())?;

        let session: Session = sqlx::query_as(
            "SELECT * FROM sessions WHERE id = $1 AND closed_at IS NULL",
        )
        .bind(agent_code.session_id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Session is closed or not found".to_string())?;

        let sponsor: Participant = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2 AND participant_type = 'human'",
        )
        .bind(session.id)
        .bind(agent_code.user_id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Sponsor participant not found".to_string())?;

        let sponsor_user: User = sqlx::query_as(
            "SELECT * FROM users WHERE id = $1",
        )
        .bind(agent_code.user_id)
        .fetch_one(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let existing_agent: Option<Participant> = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 AND sponsor_id = $2 AND participant_type = 'agent'",
        )
        .bind(session.id)
        .bind(sponsor.id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let participant_id = if let Some(existing) = existing_agent {
            existing.id
        } else {
            let name = display_name
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("{}'s Agent", sponsor_user.display_name));
            let pid = Uuid::new_v4();

            sqlx::query(
                "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at)
                 VALUES ($1, $2, $3, $4, 'agent', $5, NOW())",
            )
            .bind(pid)
            .bind(session.id)
            .bind(agent_code.user_id)
            .bind(&name)
            .bind(sponsor.id)
            .execute(&self.db)
            .await
            .map_err(|e| format!("Failed to create participant: {e}"))?;

            pid
        };

        let participants: Vec<Participant> = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at",
        )
        .bind(session.id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let participant_views: Vec<serde_json::Value> = participants
            .into_iter()
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "display_name": p.display_name,
                    "participant_type": p.participant_type,
                    "sponsor_id": p.sponsor_id,
                    "joined_at": p.joined_at,
                })
            })
            .collect();

        Ok(serde_json::json!({
            "session": {
                "id": session.id,
                "code": session.code,
                "name": session.name,
                "created_at": session.created_at,
                "participants": participant_views,
            },
            "participant_id": participant_id,
            "sponsor_name": sponsor_user.display_name,
        }))
    }

    async fn fetch_session(&self, code: &str) -> Result<serde_json::Value, String> {
        let session: Session = sqlx::query_as(
            "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL",
        )
        .bind(code)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Session not found".to_string())?;

        let participants: Vec<Participant> = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at",
        )
        .bind(session.id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let participant_views: Vec<serde_json::Value> = participants
            .into_iter()
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "display_name": p.display_name,
                    "participant_type": p.participant_type,
                    "sponsor_id": p.sponsor_id,
                    "joined_at": p.joined_at,
                })
            })
            .collect();

        Ok(serde_json::json!({
            "id": session.id,
            "code": session.code,
            "name": session.name,
            "created_at": session.created_at,
            "participants": participant_views,
        }))
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let cli = Cli::parse();

    eprintln!("[seam-mcp] Connecting to database...");
    let db = PgPool::connect(&cli.database_url)
        .await
        .expect("Failed to connect to database");

    let mut mcp = SeamMcp::new(db);

    // Auto-join if agent code provided
    if let Some(ref code) = cli.agent_code {
        eprintln!("[seam-mcp] Joining session with agent code {}...", &code[..3.min(code.len())]);
        match mcp.do_agent_join(code, cli.agent_name.as_deref()).await {
            Ok(result) => {
                let session_code = result["session"]["code"].as_str().unwrap().to_string();
                let participant_id = result["participant_id"].as_str()
                    .and_then(|s| Uuid::parse_str(s).ok());
                let sponsor_name = result["sponsor_name"].as_str().map(|s| s.to_string());

                eprintln!("[seam-mcp] Joined session {}", session_code);
                if let Some(ref name) = sponsor_name {
                    eprintln!("[seam-mcp] Sponsored by: {}", name);
                }

                mcp.session_code = Some(session_code);
                mcp.participant_id = participant_id;
                mcp.sponsor_name = sponsor_name;
            }
            Err(e) => {
                eprintln!("[seam-mcp] Failed to auto-join: {e}");
                eprintln!("[seam-mcp] Continuing — use join_session tool manually");
            }
        }
    }

    eprintln!("[seam-mcp] Starting stdio transport...");
    let transport = rmcp::transport::io::stdio();

    match mcp.serve(transport).await {
        Ok(server) => {
            if let Err(e) = server.waiting().await {
                eprintln!("[seam-mcp] Server stopped: {e}");
            }
        }
        Err(e) => {
            eprintln!("[seam-mcp] Failed to start: {e}");
            std::process::exit(1);
        }
    }
}
