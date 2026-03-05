use rmcp::{
    ErrorData as McpError,
    ServerHandler,
    handler::server::tool::ToolRouter,
    model::{CallToolResult, Content, ServerCapabilities, ServerInfo},
    tool, tool_router, tool_handler,
    handler::server::wrapper::Parameters,
    schemars::JsonSchema,
};
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::Mutex;
use uuid::Uuid;
use chrono::Utc;
use crate::models::{Task, TaskComment, TaskStatus};
use crate::models::{AgentJoinCode, Participant, Session, User};

// --- Tool parameter schemas ---

#[derive(Debug, Deserialize, JsonSchema)]
struct JoinSessionParams {
    /// 8-character agent join code
    code: String,
    /// Display name for the agent in the session
    display_name: Option<String>,
    /// MCP client name (e.g., "claude-code", "cursor")
    client_name: Option<String>,
    /// MCP client version (e.g., "1.2.3")
    client_version: Option<String>,
    /// Model being used (e.g., "claude-opus-4-6", "gpt-4o")
    model: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateCompositionParams {
    /// MCP client name (e.g., "claude-code", "seam-agent")
    client_name: Option<String>,
    /// MCP client version (e.g., "1.2.3")
    client_version: Option<String>,
    /// Model being used (e.g., "claude-opus-4-6", "devstral-tuned")
    model: Option<String>,
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
    /// Priority: critical, high, medium (default), low
    priority: Option<String>,
    /// Complexity: xl, large, medium (default), small, trivial
    complexity: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListTasksParams {
    /// Filter by task type: epic, story, task, subtask, bug
    task_type: Option<String>,
    /// Filter by status: open, in_progress, done, closed
    status: Option<String>,
    /// Filter by priority: critical, high, medium, low
    priority: Option<String>,
    /// Filter by complexity: xl, large, medium, small, trivial
    complexity: Option<String>,
    /// Filter by parent task ID (get children of a task)
    parent_id: Option<String>,
    /// Filter by assigned participant ID
    assigned_to: Option<String>,
    /// Search text (searches title and description, case-insensitive)
    search: Option<String>,
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
    /// New priority: critical, high, medium, low
    priority: Option<String>,
    /// New complexity: xl, large, medium, small, trivial
    complexity: Option<String>,
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

#[derive(Debug, Deserialize, JsonSchema)]
struct ClaimTaskParams {
    /// Task ID to claim (assigns to yourself)
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListActivityParams {
    /// Maximum number of events to return (default 20, max 100)
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct AskQuestionParams {
    /// The question text to ask
    question: String,
    /// Participant ID to direct the question to (omit for open question to any human)
    directed_to: Option<String>,
    /// Optional context JSON (e.g. {"task_id": "...", "topic": "..."})
    context: Option<String>,
    /// Optional TTL in seconds (question expires after this duration, max 3600)
    expires_in_seconds: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CancelQuestionParams {
    /// Question ID to cancel
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CheckAnswerParams {
    /// Question ID to check
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetNoteParams {
    /// Note slug (e.g. "scratchpad", "decisions", "findings")
    slug: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateNoteParams {
    /// Note slug (e.g. "scratchpad", "decisions", "findings")
    slug: String,
    /// Note title (defaults to the slug if not provided)
    title: Option<String>,
    /// Full content to set (replaces existing content)
    content: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListQuestionsParams {
    /// Filter by status: pending, answered, or all (default: pending)
    status: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CheckMessagesParams {
    /// Maximum number of messages to return (default 20, max 100)
    limit: Option<i64>,
    /// If true, only return unread messages (default: true)
    unread_only: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct SendMessageParams {
    /// Recipient participant ID
    recipient_id: String,
    /// Message content
    content: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct AddDependencyParams {
    /// The task ID that blocks another task (the blocker)
    blocker_id: String,
    /// The task ID that is blocked (the blocked task)
    blocked_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct RemoveDependencyParams {
    /// The task ID that blocks another task (the blocker)
    blocker_id: String,
    /// The task ID that is blocked
    blocked_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CreateRequirementParams {
    /// Requirement title — a high-level goal (e.g. "Ensure full WCAG 2.1 AA compliance")
    title: String,
    /// Detailed description of what this requirement means (markdown supported)
    description: Option<String>,
    /// Priority: critical, high, medium (default), low
    priority: Option<String>,
    /// Parent requirement ID for decomposition hierarchy
    parent_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListRequirementsParams {
    /// Filter by status: draft, active, satisfied, archived
    status: Option<String>,
    /// Filter by priority: critical, high, medium, low
    priority: Option<String>,
    /// Filter by parent requirement ID (get children of a requirement)
    parent_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetRequirementParams {
    /// Requirement ID
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateRequirementParams {
    /// Requirement ID to update
    id: String,
    /// New title
    title: Option<String>,
    /// New description
    description: Option<String>,
    /// New status: draft, active, satisfied, archived
    status: Option<String>,
    /// New priority: critical, high, medium, low
    priority: Option<String>,
    /// New parent requirement ID (use "none" to remove parent)
    parent_id: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct LinkRequirementTaskParams {
    /// Requirement ID
    requirement_id: String,
    /// Task ID to link to this requirement
    task_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UnlinkRequirementTaskParams {
    /// Requirement ID
    requirement_id: String,
    /// Task ID to unlink
    task_id: String,
}

// --- MCP Server ---

#[derive(Default)]
pub(crate) struct SessionState {
    pub session_code: Option<String>,
    pub participant_id: Option<Uuid>,
    pub sponsor_name: Option<String>,
    pub project_id: Option<Uuid>,
    pub ticket_prefix: Option<String>,
}

pub struct SeamMcp {
    pub(crate) db: PgPool,
    pub(crate) state: Mutex<SessionState>,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl SeamMcp {
    pub fn new(db: PgPool) -> Self {
        Self {
            db,
            state: Mutex::new(SessionState::default()),
            tool_router: Self::tool_router(),
        }
    }

    #[tool(description = "Join a Seam session using an agent join code. The code identifies both the session and your sponsoring user.")]
    async fn join_session(
        &self,
        Parameters(params): Parameters<JoinSessionParams>,
    ) -> Result<CallToolResult, McpError> {
        match self.do_agent_join(
            &params.code,
            params.display_name.as_deref(),
            params.client_name.as_deref(),
            params.client_version.as_deref(),
            params.model.as_deref(),
        ).await {
            Ok(result) => {
                // Persist session state so subsequent tools work
                let session_code = result["session"]["code"].as_str().map(|s| s.to_string());
                let participant_id = result["participant_id"].as_str()
                    .and_then(|s| Uuid::parse_str(s).ok());
                let sponsor_name = result["sponsor_name"].as_str().map(|s| s.to_string());

                // Fetch project info from session
                let mut project_id = None;
                let mut ticket_prefix = None;
                if let Some(ref code) = session_code {
                    if let Ok(Some(session)) = sqlx::query_as::<_, Session>(
                        "SELECT * FROM sessions WHERE code = $1"
                    ).bind(code).fetch_optional(&self.db).await {
                        if let Ok(Some(project)) = sqlx::query_as::<_, crate::models::Project>(
                            "SELECT * FROM projects WHERE id = $1"
                        ).bind(session.project_id).fetch_optional(&self.db).await {
                            project_id = Some(project.id);
                            ticket_prefix = Some(project.ticket_prefix);
                        }
                    }
                }

                if let Ok(mut state) = self.state.lock() {
                    state.session_code = session_code;
                    state.participant_id = participant_id;
                    state.sponsor_name = sponsor_name;
                    state.project_id = project_id;
                    state.ticket_prefix = ticket_prefix;
                }

                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(description = "Update your agent's composition metadata (model, client info). Call after model routing to report which model you are using.")]
    async fn update_composition(
        &self,
        Parameters(params): Parameters<UpdateCompositionParams>,
    ) -> Result<CallToolResult, McpError> {
        let pid = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        // Build dynamic SET clauses for non-null fields
        let mut sets = Vec::new();
        let mut idx = 2u32; // $1 is participant_id

        if params.client_name.is_some() {
            sets.push(format!("client_name = ${idx}"));
            idx += 1;
        }
        if params.client_version.is_some() {
            sets.push(format!("client_version = ${idx}"));
            idx += 1;
        }
        if params.model.is_some() {
            sets.push(format!("model = ${idx}"));
        }

        if sets.is_empty() {
            return Ok(CallToolResult::success(vec![Content::text(
                "No fields to update",
            )]));
        }

        let sql = format!(
            "UPDATE participants SET {} WHERE id = $1",
            sets.join(", "),
        );

        let mut query = sqlx::query(&sql).bind(pid);
        if let Some(ref v) = params.client_name {
            query = query.bind(v);
        }
        if let Some(ref v) = params.client_version {
            query = query.bind(v);
        }
        if let Some(ref v) = params.model {
            query = query.bind(v);
        }

        query.execute(&self.db).await.map_err(|e| {
            McpError::internal_error(format!("Failed to update composition: {e}"), None)
        })?;

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::json!({
                "updated": true,
                "participant_id": pid,
            }).to_string(),
        )]))
    }

    #[tool(description = "Get session state including all participants. Provide session code or omit to use your current session.")]
    async fn get_session(
        &self,
        Parameters(params): Parameters<GetSessionParams>,
    ) -> Result<CallToolResult, McpError> {
        let code = match params.code.or_else(|| self.state.lock().ok().and_then(|s| s.session_code.clone())) {
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
        let state = self.state.lock().map_err(|_| McpError::internal_error("Lock poisoned", None))?;
        let Some(ref session_code) = state.session_code else {
            return Ok(CallToolResult::error(vec![Content::text(
                "Not in a session. Use join_session first.",
            )]));
        };

        let info = serde_json::json!({
            "participant_id": state.participant_id,
            "session_code": session_code,
            "sponsor_name": state.sponsor_name,
        });

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&info).unwrap(),
        )]))
    }

    #[tool(description = "Create a task in the current session's project. Types: epic, story, task, subtask, bug. Use parent_id for hierarchy (e.g. stories under epics).")]
    async fn create_task(
        &self,
        Parameters(params): Parameters<CreateTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let project_id = match self.require_project() {
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
            Some(ref s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid parent_id UUID")])),
            },
            None => None,
        };

        let assigned_to = match params.assigned_to {
            Some(ref s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid assigned_to UUID")])),
            },
            None => None,
        };

        // Atomically allocate next ticket number
        let ticket_number: i32 = match sqlx::query_scalar(
            "UPDATE projects SET next_ticket_number = next_ticket_number + 1 WHERE id = $1 RETURNING next_ticket_number - 1"
        )
        .bind(project_id)
        .fetch_one(&self.db)
        .await {
            Ok(n) => n,
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Failed to allocate ticket number: {e}"))])),
        };

        let priority = params.priority.as_deref().unwrap_or("medium");
        let complexity = params.complexity.as_deref().unwrap_or("medium");

        let task_id = Uuid::new_v4();
        match sqlx::query(
            "INSERT INTO tasks (id, session_id, project_id, ticket_number, parent_id, task_type, title, description, status, priority, complexity, assigned_to, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11, $12, NOW(), NOW())"
        )
        .bind(task_id)
        .bind(session_id)
        .bind(project_id)
        .bind(ticket_number)
        .bind(parent_id)
        .bind(&params.task_type)
        .bind(&params.title)
        .bind(&params.description)
        .bind(priority)
        .bind(complexity)
        .bind(assigned_to)
        .bind(participant_id)
        .execute(&self.db)
        .await {
            Ok(_) => {
                // Record activity
                let prefix = self.get_ticket_prefix();
                let ticket_id = format!("{}-{}", prefix, ticket_number);
                self.record_activity(
                    project_id, Some(session_id), participant_id,
                    "task_created", "task", task_id,
                    &format!("created {} {}", params.task_type, ticket_id),
                    serde_json::json!({ "ticket_id": ticket_id, "task_type": params.task_type, "title": params.title }),
                ).await;

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

    #[tool(description = "List tasks in the current project. Filter by task_type, status, parent_id, or assigned_to.")]
    async fn list_tasks(
        &self,
        Parameters(params): Parameters<ListTasksParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let ticket_prefix = self.get_ticket_prefix();

        let mut query = String::from("SELECT * FROM tasks WHERE project_id = $1");
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
        if let Some(ref pr) = params.priority {
            query.push_str(&format!(" AND priority = ${param_idx}"));
            bind_values.push(pr.clone());
            param_idx += 1;
        }
        if let Some(ref cx) = params.complexity {
            query.push_str(&format!(" AND complexity = ${param_idx}"));
            bind_values.push(cx.clone());
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
            param_idx += 1;
        }
        if let Some(ref search) = params.search {
            query.push_str(&format!(
                " AND (title ILIKE ${param_idx} OR description ILIKE ${param_idx})"
            ));
            bind_values.push(format!("%{search}%"));
            let _ = param_idx;
        }

        query.push_str(" ORDER BY created_at");

        // Use raw query with dynamic bindings
        let mut q = sqlx::query_as::<_, Task>(&query).bind(project_id);
        for val in &bind_values {
            q = q.bind(val);
        }

        match q.fetch_all(&self.db).await {
            Ok(tasks) => {
                let task_ids: Vec<Uuid> = tasks.iter().map(|t| t.id).collect();

                // Batch child counts
                let child_counts: Vec<(Uuid, i64)> = sqlx::query_as(
                    "SELECT parent_id, COUNT(*) FROM tasks WHERE parent_id = ANY($1) GROUP BY parent_id"
                )
                .bind(&task_ids)
                .fetch_all(&self.db)
                .await
                .unwrap_or_default();
                let child_map: std::collections::HashMap<Uuid, i64> = child_counts.into_iter().collect();

                // Batch comment counts
                let comment_counts: Vec<(Uuid, i64)> = sqlx::query_as(
                    "SELECT task_id, COUNT(*) FROM task_comments WHERE task_id = ANY($1) GROUP BY task_id"
                )
                .bind(&task_ids)
                .fetch_all(&self.db)
                .await
                .unwrap_or_default();
                let comment_map: std::collections::HashMap<Uuid, i64> = comment_counts.into_iter().collect();

                let summary: Vec<serde_json::Value> = tasks.iter().map(|t| {
                    serde_json::json!({
                        "id": t.id,
                        "ticket_id": format!("{}-{}", ticket_prefix, t.ticket_number),
                        "ticket_number": t.ticket_number,
                        "task_type": serde_json::to_value(&t.task_type).unwrap(),
                        "title": t.title,
                        "status": serde_json::to_value(&t.status).unwrap(),
                        "priority": serde_json::to_value(&t.priority).unwrap(),
                        "complexity": serde_json::to_value(&t.complexity).unwrap(),
                        "parent_id": t.parent_id,
                        "assigned_to": t.assigned_to,
                        "created_at": t.created_at,
                        "child_count": child_map.get(&t.id).unwrap_or(&0),
                        "comment_count": comment_map.get(&t.id).unwrap_or(&0),
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
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

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

        let priority = params.priority.as_deref().unwrap_or(
            match task.priority {
                crate::models::TaskPriority::Critical => "critical",
                crate::models::TaskPriority::High => "high",
                crate::models::TaskPriority::Medium => "medium",
                crate::models::TaskPriority::Low => "low",
            }
        );

        let complexity = params.complexity.as_deref().unwrap_or(
            match task.complexity {
                crate::models::TaskComplexity::Xl => "xl",
                crate::models::TaskComplexity::Large => "large",
                crate::models::TaskComplexity::Medium => "medium",
                crate::models::TaskComplexity::Small => "small",
                crate::models::TaskComplexity::Trivial => "trivial",
            }
        );

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
            "UPDATE tasks SET title = $1, description = $2, status = $3, priority = $4, complexity = $5, assigned_to = $6, parent_id = $7, closed_at = COALESCE($8, closed_at), updated_at = NOW() WHERE id = $9"
        )
        .bind(title)
        .bind(description)
        .bind(status)
        .bind(priority)
        .bind(complexity)
        .bind(assigned_to)
        .bind(parent_id)
        .bind(closed_at)
        .bind(task_id)
        .execute(&self.db)
        .await {
            Ok(_) => {
                // Record activity
                let prefix = self.get_ticket_prefix();
                let ticket_id = format!("{}-{}", prefix, task.ticket_number);
                let event_type = if (status == "closed" || status == "done") && task.closed_at.is_none() {
                    "task_closed"
                } else {
                    "task_updated"
                };
                let summary = if event_type == "task_closed" {
                    format!("closed {}", ticket_id)
                } else {
                    format!("updated {}", ticket_id)
                };
                self.record_activity(
                    project_id, Some(session_id), participant_id,
                    event_type, "task", task_id,
                    &summary,
                    serde_json::json!({ "ticket_id": ticket_id }),
                ).await;

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
                // Extract @mentions and create mention records
                if let Ok(session_id) = self.require_session().await {
                    self.extract_mentions(session_id, comment_id, task_id, &params.content, participant_id).await;
                }

                // Record activity
                if let (Ok(project_id), Ok(session_id)) = (self.require_project(), self.require_session().await) {
                    let task: Option<Task> = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
                        .bind(task_id)
                        .fetch_optional(&self.db)
                        .await
                        .ok()
                        .flatten();
                    if let Some(t) = task {
                        let prefix = self.get_ticket_prefix();
                        let ticket_id = format!("{}-{}", prefix, t.ticket_number);
                        self.record_activity(
                            project_id, Some(session_id), participant_id,
                            "comment_added", "comment", comment_id,
                            &format!("commented on {}", ticket_id),
                            serde_json::json!({ "ticket_id": ticket_id, "preview": &params.content[..params.content.len().min(100)] }),
                        ).await;
                    }
                }

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

    #[tool(description = "Claim a task — assigns it to yourself. Useful for preventing duplicate work in multi-agent sessions.")]
    async fn claim_task(
        &self,
        Parameters(params): Parameters<ClaimTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let task_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task ID")])),
        };

        // Check task exists and isn't already claimed by someone else
        let task: Task = match sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
            .bind(task_id)
            .fetch_optional(&self.db)
            .await
        {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(CallToolResult::error(vec![Content::text("Task not found")])),
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Database error: {e}"))])),
        };

        if task.assigned_to == Some(participant_id) {
            return Ok(CallToolResult::success(vec![Content::text("Already assigned to you")]));
        }

        if task.assigned_to.is_some() {
            return Ok(CallToolResult::error(vec![Content::text(
                format!("Task is already assigned to {}. Use update_task to reassign.", task.assigned_to.unwrap()),
            )]));
        }

        match sqlx::query("UPDATE tasks SET assigned_to = $1, updated_at = NOW() WHERE id = $2")
            .bind(participant_id)
            .bind(task_id)
            .execute(&self.db)
            .await
        {
            Ok(_) => {
                let prefix = self.get_ticket_prefix();
                let ticket_id = format!("{}-{}", prefix, task.ticket_number);
                self.record_activity(
                    project_id, Some(session_id), participant_id,
                    "task_updated", "task", task_id,
                    &format!("claimed {}", ticket_id),
                    serde_json::json!({ "ticket_id": ticket_id, "assigned_to": participant_id }),
                ).await;

                let updated = self.fetch_task(task_id).await;
                match updated {
                    Ok(t) => Ok(CallToolResult::success(vec![Content::text(
                        serde_json::to_string_pretty(&t).unwrap(),
                    )])),
                    Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
                }
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Claim failed: {e}"))])),
        }
    }

    #[tool(description = "Unclaim a task — removes your assignment. Only works if you are the current assignee.")]
    async fn unclaim_task(
        &self,
        Parameters(params): Parameters<ClaimTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let task_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task ID")])),
        };

        let task: Task = match sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
            .bind(task_id)
            .fetch_optional(&self.db)
            .await
        {
            Ok(Some(t)) => t,
            Ok(None) => return Ok(CallToolResult::error(vec![Content::text("Task not found")])),
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Database error: {e}"))])),
        };

        if task.assigned_to != Some(participant_id) {
            return Ok(CallToolResult::error(vec![Content::text("You are not assigned to this task")]));
        }

        match sqlx::query("UPDATE tasks SET assigned_to = NULL, updated_at = NOW() WHERE id = $1")
            .bind(task_id)
            .execute(&self.db)
            .await
        {
            Ok(_) => {
                let prefix = self.get_ticket_prefix();
                let ticket_id = format!("{}-{}", prefix, task.ticket_number);
                self.record_activity(
                    project_id, Some(session_id), participant_id,
                    "task_updated", "task", task_id,
                    &format!("unclaimed {}", ticket_id),
                    serde_json::json!({ "ticket_id": ticket_id }),
                ).await;

                let updated = self.fetch_task(task_id).await;
                match updated {
                    Ok(t) => Ok(CallToolResult::success(vec![Content::text(
                        serde_json::to_string_pretty(&t).unwrap(),
                    )])),
                    Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
                }
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Unclaim failed: {e}"))])),
        }
    }

    #[tool(description = "Get a summary of task counts by status and type for the current project. Useful for orientation.")]
    async fn task_summary(&self) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let by_status: Vec<(String, i64)> = sqlx::query_as(
            "SELECT status::text, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY status"
        )
        .bind(project_id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let by_type: Vec<(String, i64)> = sqlx::query_as(
            "SELECT task_type::text, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY task_type"
        )
        .bind(project_id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let total: i64 = by_status.iter().map(|(_, c)| c).sum();

        let status_map: serde_json::Map<String, serde_json::Value> = by_status
            .into_iter()
            .map(|(s, c)| (s, serde_json::Value::Number(c.into())))
            .collect();

        let type_map: serde_json::Map<String, serde_json::Value> = by_type
            .into_iter()
            .map(|(t, c)| (t, serde_json::Value::Number(c.into())))
            .collect();

        let summary = serde_json::json!({
            "total": total,
            "by_status": status_map,
            "by_type": type_map,
        });

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&summary).unwrap(),
        )]))
    }

    #[tool(description = "List recent activity events in the project. Shows who did what and when — task creates, updates, comments, etc.")]
    async fn list_activity(
        &self,
        Parameters(params): Parameters<ListActivityParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let limit = params.limit.unwrap_or(20).min(100);

        let events: Vec<(Uuid, Uuid, String, String, String, Uuid, String, serde_json::Value, chrono::DateTime<Utc>)> = match sqlx::query_as(
            "SELECT ae.id, ae.actor_id, p.display_name, ae.event_type, ae.target_type, ae.target_id, ae.summary, ae.metadata, ae.created_at
             FROM activity_events ae
             JOIN participants p ON p.id = ae.actor_id
             WHERE ae.project_id = $1
             ORDER BY ae.created_at DESC
             LIMIT $2"
        )
        .bind(project_id)
        .bind(limit)
        .fetch_all(&self.db)
        .await
        {
            Ok(rows) => rows,
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Failed to fetch activity: {e}"))])),
        };

        let items: Vec<serde_json::Value> = events.into_iter().map(|(id, actor_id, actor_name, event_type, _target_type, target_id, summary, metadata, created_at)| {
            serde_json::json!({
                "id": id,
                "actor_id": actor_id,
                "actor_name": actor_name,
                "event_type": event_type,
                "target_id": target_id,
                "summary": summary,
                "metadata": metadata,
                "created_at": created_at.to_rfc3339(),
            })
        }).collect();

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&items).unwrap(),
        )]))
    }

    #[tool(description = "Ask a question that humans in the session can answer. Returns the question ID — use check_answer to poll for the response.")]
    async fn ask_question(
        &self,
        Parameters(params): Parameters<AskQuestionParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let directed_to = match &params.directed_to {
            Some(id_str) => match Uuid::parse_str(id_str) {
                Ok(id) => Some(id),
                Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid directed_to participant ID")])),
            },
            None => None,
        };

        let context_json: Option<serde_json::Value> = match &params.context {
            Some(ctx) => match serde_json::from_str(ctx) {
                Ok(v) => Some(v),
                Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid context JSON")])),
            },
            None => None,
        };

        let expires_at = params.expires_in_seconds.map(|secs| {
            let secs = secs.min(3600).max(10);
            Utc::now() + chrono::Duration::seconds(secs)
        });

        let question_id = Uuid::new_v4();
        match sqlx::query(
            "INSERT INTO questions (id, session_id, project_id, asked_by, directed_to, question_text, context, status, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)"
        )
        .bind(question_id)
        .bind(session_id)
        .bind(project_id)
        .bind(participant_id)
        .bind(directed_to)
        .bind(&params.question)
        .bind(&context_json)
        .bind(expires_at)
        .execute(&self.db)
        .await
        {
            Ok(_) => {
                self.record_activity(
                    project_id, Some(session_id), participant_id,
                    "question_asked", "question", question_id,
                    &params.question, serde_json::json!({}),
                ).await;

                let result = serde_json::json!({
                    "id": question_id,
                    "status": "pending",
                    "message": "Question submitted. Use check_answer to poll for the response, or the human will see it in their session UI."
                });
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed to create question: {e}"))])),
        }
    }

    #[tool(description = "Check if a question has been answered. Returns the current status and answer if available.")]
    async fn check_answer(
        &self,
        Parameters(params): Parameters<CheckAnswerParams>,
    ) -> Result<CallToolResult, McpError> {
        let question_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid question ID")])),
        };

        // Lazy expiry
        let _ = sqlx::query(
            "UPDATE questions SET status = 'expired' WHERE id = $1 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()"
        ).bind(question_id).execute(&self.db).await;

        let row: Option<(Uuid, String, String, Option<String>, Option<Uuid>, chrono::DateTime<Utc>, Option<chrono::DateTime<Utc>>)> = match sqlx::query_as(
            "SELECT q.id, q.question_text, q.status, q.answer_text, q.answered_by, q.created_at, q.answered_at
             FROM questions q WHERE q.id = $1"
        )
        .bind(question_id)
        .fetch_optional(&self.db)
        .await
        {
            Ok(r) => r,
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Database error: {e}"))])),
        };

        match row {
            Some((id, question_text, status, answer_text, answered_by, created_at, answered_at)) => {
                let mut result = serde_json::json!({
                    "id": id,
                    "question_text": question_text,
                    "status": status,
                    "created_at": created_at.to_rfc3339(),
                });

                if let Some(answer) = &answer_text {
                    result["answer_text"] = serde_json::json!(answer);
                }
                if let Some(by) = answered_by {
                    // Look up the answerer's display name
                    if let Ok(Some(p)) = sqlx::query_as::<_, Participant>(
                        "SELECT * FROM participants WHERE id = $1"
                    ).bind(by).fetch_optional(&self.db).await {
                        result["answered_by_name"] = serde_json::json!(p.display_name);
                    }
                    result["answered_by"] = serde_json::json!(by);
                }
                if let Some(at) = answered_at {
                    result["answered_at"] = serde_json::json!(at.to_rfc3339());
                }

                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            None => Ok(CallToolResult::error(vec![Content::text("Question not found")])),
        }
    }

    #[tool(description = "List questions in the current session. Defaults to pending questions. Use status='all' to see everything.")]
    async fn list_questions(
        &self,
        Parameters(params): Parameters<ListQuestionsParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let status_filter = params.status.as_deref().unwrap_or("pending");

        let questions: Vec<(Uuid, String, String, Option<String>, Uuid, Option<Uuid>, Option<Uuid>, chrono::DateTime<Utc>, Option<chrono::DateTime<Utc>>)> = match status_filter {
            "all" => {
                sqlx::query_as(
                    "SELECT q.id, q.question_text, q.status, q.answer_text, q.asked_by, q.directed_to, q.answered_by, q.created_at, q.answered_at
                     FROM questions q WHERE q.session_id = $1
                     ORDER BY q.created_at DESC"
                )
                .bind(session_id)
                .fetch_all(&self.db)
                .await
            }
            _ => {
                sqlx::query_as(
                    "SELECT q.id, q.question_text, q.status, q.answer_text, q.asked_by, q.directed_to, q.answered_by, q.created_at, q.answered_at
                     FROM questions q WHERE q.session_id = $1 AND q.status = $2
                     ORDER BY q.created_at DESC"
                )
                .bind(session_id)
                .bind(status_filter)
                .fetch_all(&self.db)
                .await
            }
        }.map_err(|e| {
            McpError::internal_error(format!("Database error: {e}"), None)
        })?;

        let mut items: Vec<serde_json::Value> = Vec::new();
        for (id, question_text, status, answer_text, asked_by, directed_to, answered_by, created_at, answered_at) in questions {
            let mut item = serde_json::json!({
                "id": id,
                "question_text": question_text,
                "status": status,
                "asked_by": asked_by,
                "created_at": created_at.to_rfc3339(),
            });
            if let Some(dt) = directed_to {
                item["directed_to"] = serde_json::json!(dt);
            }
            if let Some(answer) = &answer_text {
                item["answer_text"] = serde_json::json!(answer);
            }
            if let Some(by) = answered_by {
                item["answered_by"] = serde_json::json!(by);
            }
            if let Some(at) = answered_at {
                item["answered_at"] = serde_json::json!(at.to_rfc3339());
            }
            items.push(item);
        }

        let result = serde_json::json!({
            "count": items.len(),
            "questions": items,
        });

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(description = "Cancel one of your own pending questions. The question will no longer appear as pending for humans.")]
    async fn cancel_question(
        &self,
        Parameters(params): Parameters<CancelQuestionParams>,
    ) -> Result<CallToolResult, McpError> {
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let question_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid question ID")])),
        };

        let result = sqlx::query(
            "UPDATE questions SET status = 'cancelled' WHERE id = $1 AND asked_by = $2 AND status = 'pending'"
        )
        .bind(question_id)
        .bind(participant_id)
        .execute(&self.db)
        .await;

        match result {
            Ok(r) if r.rows_affected() > 0 => {
                Ok(CallToolResult::success(vec![Content::text("Question cancelled")]))
            }
            Ok(_) => Ok(CallToolResult::error(vec![Content::text("Question not found, not yours, or not pending")])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Database error: {e}"))])),
        }
    }

    #[tool(description = "Get a shared note by slug. Notes are session-scoped collaborative documents for sharing context, decisions, and findings.")]
    async fn get_note(
        &self,
        Parameters(params): Parameters<GetNoteParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let note: Option<crate::models::Note> = sqlx::query_as(
            "SELECT * FROM notes WHERE session_id = $1 AND slug = $2"
        )
        .bind(session_id)
        .bind(&params.slug)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Database error: {e}"), None))?;

        match note {
            Some(n) => {
                let result = serde_json::json!({
                    "slug": n.slug,
                    "title": n.title,
                    "content": n.content,
                    "updated_at": n.updated_at.to_rfc3339(),
                });
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            None => Ok(CallToolResult::error(vec![Content::text(
                format!("Note '{}' not found. Use update_note to create it.", params.slug)
            )])),
        }
    }

    #[tool(description = "Create or update a shared note. Notes are session-scoped markdown documents. Use slugs like 'scratchpad', 'decisions', 'findings', etc.")]
    async fn update_note(
        &self,
        Parameters(params): Parameters<UpdateNoteParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let title = params.title.unwrap_or_else(|| params.slug.clone());

        let note: crate::models::Note = sqlx::query_as(
            "INSERT INTO notes (id, session_id, slug, title, content, updated_by, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (session_id, slug) DO UPDATE
             SET content = EXCLUDED.content, title = EXCLUDED.title, updated_by = EXCLUDED.updated_by, updated_at = NOW()
             RETURNING *"
        )
        .bind(session_id)
        .bind(&params.slug)
        .bind(&title)
        .bind(&params.content)
        .bind(participant_id)
        .fetch_one(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Database error: {e}"), None))?;

        let result = serde_json::json!({
            "slug": note.slug,
            "title": note.title,
            "content": note.content,
            "updated_at": note.updated_at.to_rfc3339(),
            "message": "Note saved",
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(description = "List all shared notes in the current session.")]
    async fn list_notes(&self) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let notes: Vec<crate::models::Note> = sqlx::query_as(
            "SELECT * FROM notes WHERE session_id = $1 ORDER BY created_at"
        )
        .bind(session_id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Database error: {e}"), None))?;

        let items: Vec<serde_json::Value> = notes.iter().map(|n| {
            serde_json::json!({
                "slug": n.slug,
                "title": n.title,
                "content_length": n.content.len(),
                "updated_at": n.updated_at.to_rfc3339(),
            })
        }).collect();

        let result = serde_json::json!({
            "count": items.len(),
            "notes": items,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
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

    #[tool(description = "Add a dependency: blocker_id blocks blocked_id. The blocked task cannot be started until the blocker is done. Prevents circular dependencies.")]
    async fn add_dependency(
        &self,
        Parameters(params): Parameters<AddDependencyParams>,
    ) -> Result<CallToolResult, McpError> {
        let blocker_id = match Uuid::parse_str(&params.blocker_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid blocker_id")])),
        };
        let blocked_id = match Uuid::parse_str(&params.blocked_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid blocked_id")])),
        };

        if blocker_id == blocked_id {
            return Ok(CallToolResult::error(vec![Content::text("A task cannot block itself")]));
        }

        // Check for circular dependency
        let would_cycle: bool = sqlx::query_scalar(
            "WITH RECURSIVE chain AS (
                SELECT blocker_id FROM task_dependencies WHERE blocked_id = $1
                UNION
                SELECT d.blocker_id FROM task_dependencies d JOIN chain c ON d.blocked_id = c.blocker_id
            )
            SELECT EXISTS(SELECT 1 FROM chain WHERE blocker_id = $2)"
        )
        .bind(blocker_id)
        .bind(blocked_id)
        .fetch_one(&self.db)
        .await
        .unwrap_or(false);

        if would_cycle {
            return Ok(CallToolResult::error(vec![Content::text("Cannot add dependency: would create a cycle")]));
        }

        match sqlx::query(
            "INSERT INTO task_dependencies (id, blocker_id, blocked_id, created_at) VALUES ($1, $2, $3, NOW())"
        )
        .bind(Uuid::new_v4())
        .bind(blocker_id)
        .bind(blocked_id)
        .execute(&self.db)
        .await
        {
            Ok(_) => {
                let prefix = self.get_ticket_prefix();
                // Fetch ticket numbers for the response
                let blocker_num: Option<i32> = sqlx::query_scalar("SELECT ticket_number FROM tasks WHERE id = $1")
                    .bind(blocker_id).fetch_optional(&self.db).await.ok().flatten();
                let blocked_num: Option<i32> = sqlx::query_scalar("SELECT ticket_number FROM tasks WHERE id = $1")
                    .bind(blocked_id).fetch_optional(&self.db).await.ok().flatten();

                let msg = format!(
                    "Dependency added: {}-{} blocks {}-{}",
                    prefix, blocker_num.unwrap_or(0),
                    prefix, blocked_num.unwrap_or(0),
                );
                Ok(CallToolResult::success(vec![Content::text(msg)]))
            }
            Err(e) if e.to_string().contains("unique_dependency") => {
                Ok(CallToolResult::error(vec![Content::text("This dependency already exists")]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed to add dependency: {e}"))])),
        }
    }

    #[tool(description = "Remove a dependency between two tasks.")]
    async fn remove_dependency(
        &self,
        Parameters(params): Parameters<RemoveDependencyParams>,
    ) -> Result<CallToolResult, McpError> {
        let blocker_id = match Uuid::parse_str(&params.blocker_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid blocker_id")])),
        };
        let blocked_id = match Uuid::parse_str(&params.blocked_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid blocked_id")])),
        };

        match sqlx::query("DELETE FROM task_dependencies WHERE blocker_id = $1 AND blocked_id = $2")
            .bind(blocker_id)
            .bind(blocked_id)
            .execute(&self.db)
            .await
        {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text("Dependency not found")]))
            }
            Ok(_) => Ok(CallToolResult::success(vec![Content::text("Dependency removed")])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed: {e}"))])),
        }
    }

    // --- Requirements tools ---

    #[tool(description = "Create a requirement — a high-level goal that drives research and task creation. Examples: 'Ensure full i18n coverage', 'Achieve WCAG 2.1 AA compliance'. Use parent_id for decomposition.")]
    async fn create_requirement(
        &self,
        Parameters(params): Parameters<CreateRequirementParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let priority = params.priority.as_deref().unwrap_or("medium");
        let description = params.description.as_deref().unwrap_or("");

        let parent_id = if let Some(ref pid) = params.parent_id {
            match Uuid::parse_str(pid) {
                Ok(id) => Some(id),
                Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid parent_id")])),
            }
        } else {
            None
        };

        // Look up the user_id for this participant
        let user_id: Option<(Uuid,)> = sqlx::query_as(
            "SELECT user_id FROM participants WHERE id = $1"
        )
        .bind(participant_id)
        .fetch_optional(&self.db)
        .await
        .unwrap_or(None);

        let user_id = match user_id {
            Some((uid,)) => uid,
            None => return Ok(CallToolResult::error(vec![Content::text("Participant not found")])),
        };

        match sqlx::query_as::<_, crate::models::Requirement>(
            "INSERT INTO requirements (project_id, parent_id, title, description, priority, created_by, session_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *"
        )
        .bind(project_id)
        .bind(parent_id)
        .bind(&params.title)
        .bind(description)
        .bind(priority)
        .bind(user_id)
        .bind(session_id)
        .fetch_one(&self.db)
        .await
        {
            Ok(req) => {
                let result = serde_json::json!({
                    "id": req.id,
                    "project_id": req.project_id,
                    "parent_id": req.parent_id,
                    "title": req.title,
                    "description": req.description,
                    "status": req.status,
                    "priority": req.priority,
                    "created_at": req.created_at,
                });
                self.record_activity(project_id, Some(session_id), participant_id,
                    "requirement_created", "requirement", req.id,
                    &format!("created requirement: {}", req.title),
                    serde_json::json!({"title": req.title}),
                ).await;
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed to create requirement: {e}"))])),
        }
    }

    #[tool(description = "List requirements in the current project. Defaults to top-level requirements (no parent). Use parent_id to list children of a specific requirement.")]
    async fn list_requirements(
        &self,
        Parameters(params): Parameters<ListRequirementsParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let mut sql = "SELECT r.*,
            (SELECT COUNT(*) FROM requirements c WHERE c.parent_id = r.id) as child_count,
            (SELECT COUNT(*) FROM requirement_tasks rt WHERE rt.requirement_id = r.id) as task_count
            FROM requirements r WHERE r.project_id = $1".to_string();

        let mut conditions = Vec::new();
        let mut bind_idx = 2u32;

        if let Some(ref status) = params.status {
            conditions.push(format!("r.status = ${bind_idx}"));
            bind_idx += 1;
            let _ = status;
        }
        if let Some(ref priority) = params.priority {
            conditions.push(format!("r.priority = ${bind_idx}"));
            bind_idx += 1;
            let _ = priority;
        }
        if let Some(ref parent_id) = params.parent_id {
            conditions.push(format!("r.parent_id = ${bind_idx}"));
            let _ = parent_id;
        } else if params.status.is_none() && params.priority.is_none() {
            conditions.push("r.parent_id IS NULL".to_string());
        }

        for c in &conditions {
            sql.push_str(&format!(" AND {c}"));
        }
        sql.push_str(" ORDER BY r.priority, r.created_at");

        // Build query string with lifetime that outlasts the query
        let mut sql = "SELECT * FROM requirements WHERE project_id = $1".to_string();
        let mut idx = 2u32;
        if params.status.is_some() {
            sql.push_str(&format!(" AND status = ${idx}"));
            idx += 1;
        }
        if params.priority.is_some() {
            sql.push_str(&format!(" AND priority = ${idx}"));
            idx += 1;
        }
        if params.parent_id.is_some() {
            sql.push_str(&format!(" AND parent_id = ${idx}"));
        } else if params.status.is_none() && params.priority.is_none() {
            sql.push_str(" AND parent_id IS NULL");
        }
        sql.push_str(" ORDER BY priority, created_at");

        let mut q = sqlx::query_as::<_, crate::models::Requirement>(&sql)
            .bind(project_id);
        if let Some(ref status) = params.status {
            q = q.bind(status);
        }
        if let Some(ref priority) = params.priority {
            q = q.bind(priority);
        }
        if let Some(ref parent_id) = params.parent_id {
            match Uuid::parse_str(parent_id) {
                Ok(pid) => q = q.bind(pid),
                Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid parent_id")])),
            }
        }

        match q.fetch_all(&self.db).await {
            Ok(reqs) => {
                let mut items = Vec::new();
                for r in &reqs {
                    let child_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM requirements WHERE parent_id = $1"
                    ).bind(r.id).fetch_one(&self.db).await.unwrap_or(0);

                    let task_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM requirement_tasks WHERE requirement_id = $1"
                    ).bind(r.id).fetch_one(&self.db).await.unwrap_or(0);

                    items.push(serde_json::json!({
                        "id": r.id,
                        "title": r.title,
                        "status": r.status,
                        "priority": r.priority,
                        "parent_id": r.parent_id,
                        "child_count": child_count,
                        "task_count": task_count,
                        "created_at": r.created_at,
                        "updated_at": r.updated_at,
                    }));
                }
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&items).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed: {e}"))])),
        }
    }

    #[tool(description = "Get a requirement by ID with full details including description, children, and linked tasks.")]
    async fn get_requirement(
        &self,
        Parameters(params): Parameters<GetRequirementParams>,
    ) -> Result<CallToolResult, McpError> {
        let req_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid requirement ID")])),
        };

        let req = match sqlx::query_as::<_, crate::models::Requirement>(
            "SELECT * FROM requirements WHERE id = $1"
        ).bind(req_id).fetch_optional(&self.db).await {
            Ok(Some(r)) => r,
            Ok(None) => return Ok(CallToolResult::error(vec![Content::text("Requirement not found")])),
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Database error: {e}"))])),
        };

        let children = sqlx::query_as::<_, crate::models::Requirement>(
            "SELECT * FROM requirements WHERE parent_id = $1 ORDER BY priority, created_at"
        ).bind(req_id).fetch_all(&self.db).await.unwrap_or_default();

        let linked_tasks: Vec<(Uuid,)> = sqlx::query_as(
            "SELECT task_id FROM requirement_tasks WHERE requirement_id = $1"
        ).bind(req_id).fetch_all(&self.db).await.unwrap_or_default();

        let child_items: Vec<_> = children.iter().map(|c| serde_json::json!({
            "id": c.id,
            "title": c.title,
            "status": c.status,
            "priority": c.priority,
        })).collect();

        let result = serde_json::json!({
            "id": req.id,
            "project_id": req.project_id,
            "parent_id": req.parent_id,
            "title": req.title,
            "description": req.description,
            "status": req.status,
            "priority": req.priority,
            "created_by": req.created_by,
            "session_id": req.session_id,
            "children": child_items,
            "linked_task_ids": linked_tasks.iter().map(|(id,)| id).collect::<Vec<_>>(),
            "created_at": req.created_at,
            "updated_at": req.updated_at,
        });

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(description = "Update a requirement's title, description, status, priority, or parent. Only provided fields are changed. Status transitions: draft→active, active→satisfied/archived, satisfied→active/archived, archived→draft.")]
    async fn update_requirement(
        &self,
        Parameters(params): Parameters<UpdateRequirementParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let req_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid requirement ID")])),
        };

        let current = match sqlx::query_as::<_, crate::models::Requirement>(
            "SELECT * FROM requirements WHERE id = $1 AND project_id = $2"
        ).bind(req_id).bind(project_id).fetch_optional(&self.db).await {
            Ok(Some(r)) => r,
            Ok(None) => return Ok(CallToolResult::error(vec![Content::text("Requirement not found")])),
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Database error: {e}"))])),
        };

        // Build dynamic update
        let mut set_clauses = vec!["updated_at = NOW()".to_string()];
        let mut bind_idx = 3u32;

        if params.title.is_some() {
            set_clauses.push(format!("title = ${bind_idx}"));
            bind_idx += 1;
        }
        if params.description.is_some() {
            set_clauses.push(format!("description = ${bind_idx}"));
            bind_idx += 1;
        }
        if params.status.is_some() {
            set_clauses.push(format!("status = ${bind_idx}"));
            bind_idx += 1;
        }
        if params.priority.is_some() {
            set_clauses.push(format!("priority = ${bind_idx}"));
            bind_idx += 1;
        }
        if params.parent_id.is_some() {
            set_clauses.push(format!("parent_id = ${bind_idx}"));
        }

        if set_clauses.len() == 1 {
            return Ok(CallToolResult::error(vec![Content::text("No fields to update")]));
        }

        let query = format!(
            "UPDATE requirements SET {} WHERE id = $1 AND project_id = $2 RETURNING *",
            set_clauses.join(", ")
        );

        let mut q = sqlx::query_as::<_, crate::models::Requirement>(&query)
            .bind(req_id)
            .bind(project_id);

        if let Some(ref title) = params.title {
            q = q.bind(title);
        }
        if let Some(ref desc) = params.description {
            q = q.bind(desc);
        }
        if let Some(ref status) = params.status {
            // Validate transition
            let valid = match (current.status, status.as_str()) {
                (crate::models::RequirementStatus::Draft, "active" | "archived") => true,
                (crate::models::RequirementStatus::Active, "satisfied" | "archived") => true,
                (crate::models::RequirementStatus::Satisfied, "active" | "archived") => true,
                (crate::models::RequirementStatus::Archived, "draft") => true,
                _ => false,
            };
            if !valid {
                return Ok(CallToolResult::error(vec![Content::text(
                    format!("Invalid status transition: {:?} → {status}", current.status)
                )]));
            }
            q = q.bind(status);
        }
        if let Some(ref priority) = params.priority {
            q = q.bind(priority);
        }
        if let Some(ref parent_id) = params.parent_id {
            if parent_id == "none" {
                q = q.bind(None::<Uuid>);
            } else {
                match Uuid::parse_str(parent_id) {
                    Ok(pid) => {
                        if pid == req_id {
                            return Ok(CallToolResult::error(vec![Content::text("A requirement cannot be its own parent")]));
                        }
                        q = q.bind(Some(pid));
                    }
                    Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid parent_id")])),
                }
            }
        }

        match q.fetch_one(&self.db).await {
            Ok(req) => {
                let result = serde_json::json!({
                    "id": req.id,
                    "title": req.title,
                    "description": req.description,
                    "status": req.status,
                    "priority": req.priority,
                    "parent_id": req.parent_id,
                    "updated_at": req.updated_at,
                });
                self.record_activity(project_id, Some(session_id), participant_id,
                    "requirement_updated", "requirement", req.id,
                    &format!("updated requirement: {}", req.title),
                    serde_json::json!({"title": req.title}),
                ).await;
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed: {e}"))])),
        }
    }

    #[tool(description = "Link a task to a requirement, indicating the task was created to satisfy this requirement.")]
    async fn link_requirement_task(
        &self,
        Parameters(params): Parameters<LinkRequirementTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let req_id = match Uuid::parse_str(&params.requirement_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid requirement_id")])),
        };
        let task_id = match Uuid::parse_str(&params.task_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task_id")])),
        };

        match sqlx::query(
            "INSERT INTO requirement_tasks (requirement_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
        )
        .bind(req_id)
        .bind(task_id)
        .execute(&self.db)
        .await
        {
            Ok(_) => Ok(CallToolResult::success(vec![Content::text("Task linked to requirement")])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed: {e}"))])),
        }
    }

    #[tool(description = "Unlink a task from a requirement.")]
    async fn unlink_requirement_task(
        &self,
        Parameters(params): Parameters<UnlinkRequirementTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let req_id = match Uuid::parse_str(&params.requirement_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid requirement_id")])),
        };
        let task_id = match Uuid::parse_str(&params.task_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid task_id")])),
        };

        match sqlx::query(
            "DELETE FROM requirement_tasks WHERE requirement_id = $1 AND task_id = $2"
        )
        .bind(req_id)
        .bind(task_id)
        .execute(&self.db)
        .await
        {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text("Link not found")]))
            }
            Ok(_) => Ok(CallToolResult::success(vec![Content::text("Task unlinked from requirement")])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed: {e}"))])),
        }
    }

    #[tool(description = "Check for directed messages sent to you by humans in the session. Returns messages in chronological order.")]
    async fn check_messages(
        &self,
        Parameters(params): Parameters<CheckMessagesParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let limit = params.limit.unwrap_or(20).min(100);
        let unread_only = params.unread_only.unwrap_or(true);

        let query = if unread_only {
            "SELECT m.id, m.sender_id, p.display_name, m.content, m.created_at
             FROM messages m
             JOIN participants p ON p.id = m.sender_id
             WHERE m.session_id = $1 AND m.recipient_id = $2 AND m.read_at IS NULL
             ORDER BY m.created_at ASC
             LIMIT $3"
        } else {
            "SELECT m.id, m.sender_id, p.display_name, m.content, m.created_at
             FROM messages m
             JOIN participants p ON p.id = m.sender_id
             WHERE m.session_id = $1 AND m.recipient_id = $2
             ORDER BY m.created_at DESC
             LIMIT $3"
        };

        let rows: Vec<(Uuid, Uuid, String, String, chrono::DateTime<Utc>)> = match sqlx::query_as(query)
            .bind(session_id)
            .bind(participant_id)
            .bind(limit)
            .fetch_all(&self.db)
            .await
        {
            Ok(r) => r,
            Err(e) => return Ok(CallToolResult::error(vec![Content::text(format!("Failed: {e}"))])),
        };

        if rows.is_empty() {
            return Ok(CallToolResult::success(vec![Content::text("No messages.")]));
        }

        // Mark messages as read
        let msg_ids: Vec<Uuid> = rows.iter().map(|r| r.0).collect();
        let _ = sqlx::query(
            "UPDATE messages SET read_at = now() WHERE id = ANY($1)"
        )
        .bind(&msg_ids)
        .execute(&self.db)
        .await;

        let items: Vec<serde_json::Value> = rows.into_iter().map(|(id, sender_id, sender_name, content, created_at)| {
            serde_json::json!({
                "id": id,
                "from_id": sender_id,
                "from": sender_name,
                "content": content,
                "created_at": created_at.to_rfc3339(),
            })
        }).collect();

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&items).unwrap(),
        )]))
    }

    #[tool(description = "Send a message to another participant in the session (human or agent).")]
    async fn send_message_to(
        &self,
        Parameters(params): Parameters<SendMessageParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let recipient_id = match Uuid::parse_str(&params.recipient_id) {
            Ok(id) => id,
            Err(_) => return Ok(CallToolResult::error(vec![Content::text("Invalid recipient_id")])),
        };

        if params.content.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text("Message content cannot be empty")]));
        }

        match sqlx::query_as::<_, (Uuid, chrono::DateTime<Utc>)>(
            "INSERT INTO messages (session_id, sender_id, recipient_id, content)
             VALUES ($1, $2, $3, $4)
             RETURNING id, created_at"
        )
        .bind(session_id)
        .bind(participant_id)
        .bind(recipient_id)
        .bind(&params.content)
        .fetch_one(&self.db)
        .await
        {
            Ok((id, created_at)) => {
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&serde_json::json!({
                        "id": id,
                        "status": "sent",
                        "created_at": created_at.to_rfc3339(),
                    })).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!("Failed to send: {e}"))])),
        }
    }
}

#[tool_handler]
impl ServerHandler for SeamMcp {
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        info.capabilities = ServerCapabilities::builder()
            .enable_tools()
            .build();
        info.server_info.name = "seam-mcp".into();
        info.server_info.version = env!("CARGO_PKG_VERSION").into();
        info.instructions = Some(
            "Seam collaborative session server. Use join_session with an agent code to connect, then manage tasks with create_task, list_tasks, update_task, etc.".into()
        );
        info
    }
}

// --- Internal helpers ---
impl SeamMcp {
    fn require_project(&self) -> Result<Uuid, CallToolResult> {
        self.state.lock()
            .ok()
            .and_then(|s| s.project_id)
            .ok_or_else(|| {
                CallToolResult::error(vec![Content::text(
                    "Not in a session. Use join_session first.",
                )])
            })
    }

    fn get_ticket_prefix(&self) -> String {
        self.state.lock()
            .ok()
            .and_then(|s| s.ticket_prefix.clone())
            .unwrap_or_else(|| "TASK".to_string())
    }

    fn require_participant(&self) -> Result<Uuid, CallToolResult> {
        self.state.lock()
            .ok()
            .and_then(|s| s.participant_id)
            .ok_or_else(|| {
                CallToolResult::error(vec![Content::text(
                    "Not in a session. Use join_session first.",
                )])
            })
    }

    async fn require_session(&self) -> Result<Uuid, CallToolResult> {
        let code = self.state.lock()
            .ok()
            .and_then(|s| s.session_code.clone())
            .ok_or_else(|| CallToolResult::error(vec![Content::text(
                "Not in a session. Use join_session first.",
            )]))?;

        let session: Option<Session> = sqlx::query_as(
            "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL",
        )
        .bind(&code)
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

        let ticket_prefix = self.get_ticket_prefix();
        let ticket_id = format!("{}-{}", ticket_prefix, task.ticket_number);

        Ok(serde_json::json!({
            "id": task.id,
            "ticket_id": ticket_id,
            "ticket_number": task.ticket_number,
            "project_id": task.project_id,
            "session_id": task.session_id,
            "parent_id": task.parent_id,
            "task_type": serde_json::to_value(&task.task_type).unwrap(),
            "title": task.title,
            "description": task.description,
            "status": serde_json::to_value(&task.status).unwrap(),
            "priority": serde_json::to_value(&task.priority).unwrap(),
            "complexity": serde_json::to_value(&task.complexity).unwrap(),
            "assigned_to": task.assigned_to,
            "created_by": task.created_by,
            "commit_sha": task.commit_sha,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            "closed_at": task.closed_at,
        }))
    }

    async fn fetch_task_with_comments(&self, id: Uuid) -> Result<serde_json::Value, String> {
        let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.db)
            .await
            .map_err(|e| format!("Database error: {e}"))?
            .ok_or_else(|| "Task not found".to_string())?;

        let ticket_prefix = self.get_ticket_prefix();
        let ticket_id = format!("{}-{}", ticket_prefix, task.ticket_number);

        let mut task_json = serde_json::json!({
            "id": task.id,
            "ticket_id": ticket_id,
            "ticket_number": task.ticket_number,
            "project_id": task.project_id,
            "session_id": task.session_id,
            "parent_id": task.parent_id,
            "task_type": serde_json::to_value(&task.task_type).unwrap(),
            "title": task.title,
            "description": task.description,
            "status": serde_json::to_value(&task.status).unwrap(),
            "priority": serde_json::to_value(&task.priority).unwrap(),
            "complexity": serde_json::to_value(&task.complexity).unwrap(),
            "assigned_to": task.assigned_to,
            "created_by": task.created_by,
            "commit_sha": task.commit_sha,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            "closed_at": task.closed_at,
        });

        // Fetch parent if exists
        if let Some(pid) = task.parent_id {
            if let Ok(Some(parent)) = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = $1")
                .bind(pid)
                .fetch_optional(&self.db)
                .await
            {
                task_json["parent"] = serde_json::json!({
                    "id": parent.id,
                    "ticket_id": format!("{}-{}", ticket_prefix, parent.ticket_number),
                    "task_type": serde_json::to_value(&parent.task_type).unwrap(),
                    "title": parent.title,
                    "status": serde_json::to_value(&parent.status).unwrap(),
                    "assigned_to": parent.assigned_to,
                });
            }
        }

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
                "ticket_id": format!("{}-{}", ticket_prefix, t.ticket_number),
                "task_type": serde_json::to_value(&t.task_type).unwrap(),
                "title": t.title,
                "status": serde_json::to_value(&t.status).unwrap(),
                "assigned_to": t.assigned_to,
            })
        }).collect();

        // Fetch dependencies: tasks this task blocks
        let blocks: Vec<Task> = sqlx::query_as(
            "SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocked_id = t.id WHERE d.blocker_id = $1 ORDER BY t.created_at"
        )
        .bind(id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let blocks_views: Vec<serde_json::Value> = blocks.iter().map(|t| {
            serde_json::json!({
                "id": t.id,
                "ticket_id": format!("{}-{}", ticket_prefix, t.ticket_number),
                "title": t.title,
                "status": serde_json::to_value(&t.status).unwrap(),
            })
        }).collect();

        // Fetch dependencies: tasks that block this task
        let blocked_by: Vec<Task> = sqlx::query_as(
            "SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocker_id = t.id WHERE d.blocked_id = $1 ORDER BY t.created_at"
        )
        .bind(id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let blocked_by_views: Vec<serde_json::Value> = blocked_by.iter().map(|t| {
            serde_json::json!({
                "id": t.id,
                "ticket_id": format!("{}-{}", ticket_prefix, t.ticket_number),
                "title": t.title,
                "status": serde_json::to_value(&t.status).unwrap(),
            })
        }).collect();

        task_json["comments"] = serde_json::json!(comment_views);
        task_json["children"] = serde_json::json!(child_views);
        task_json["blocks"] = serde_json::json!(blocks_views);
        task_json["blocked_by"] = serde_json::json!(blocked_by_views);
        Ok(task_json)
    }

    async fn record_activity(
        &self,
        project_id: Uuid,
        session_id: Option<Uuid>,
        actor_id: Uuid,
        event_type: &str,
        target_type: &str,
        target_id: Uuid,
        summary: &str,
        metadata: serde_json::Value,
    ) {
        if let Err(e) = sqlx::query(
            "INSERT INTO activity_events (project_id, session_id, actor_id, event_type, target_type, target_id, summary, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
        )
        .bind(project_id)
        .bind(session_id)
        .bind(actor_id)
        .bind(event_type)
        .bind(target_type)
        .bind(target_id)
        .bind(summary)
        .bind(metadata)
        .execute(&self.db)
        .await
        {
            eprintln!("[seam-mcp] Failed to record activity: {e}");
        }
    }

    async fn extract_mentions(
        &self,
        session_id: Uuid,
        comment_id: Uuid,
        task_id: Uuid,
        content: &str,
        author_id: Uuid,
    ) {
        let mention_re = regex::Regex::new(r"@([\w.\-]+(?:\s[\w.\-]+)?)").unwrap();
        let mention_names: Vec<String> = mention_re
            .captures_iter(content)
            .map(|c| c[1].to_string())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        if mention_names.is_empty() {
            return;
        }

        let participants: Vec<(Uuid, String)> = sqlx::query_as(
            "SELECT id, display_name FROM participants WHERE session_id = $1"
        )
        .bind(session_id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        for (pid, name) in &participants {
            if *pid == author_id {
                continue;
            }
            let name_lower = name.to_lowercase();
            let matched = mention_names.iter().any(|m| {
                name_lower == m.to_lowercase() || name_lower.starts_with(&m.to_lowercase())
            });
            if !matched {
                continue;
            }

            let _ = sqlx::query(
                "INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
            )
            .bind(comment_id)
            .bind(pid)
            .execute(&self.db)
            .await;

            let _ = sqlx::query(
                "INSERT INTO unread_mentions (participant_id, comment_id, task_id, session_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING"
            )
            .bind(pid)
            .bind(comment_id)
            .bind(task_id)
            .bind(session_id)
            .execute(&self.db)
            .await;
        }
    }

    pub async fn do_agent_join(
        &self,
        code: &str,
        display_name: Option<&str>,
        client_name: Option<&str>,
        client_version: Option<&str>,
        model: Option<&str>,
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

        // Mark any existing agent participants from this sponsor as disconnected
        sqlx::query(
            "UPDATE participants SET disconnected_at = NOW()
             WHERE session_id = $1 AND sponsor_id = $2 AND participant_type = 'agent' AND disconnected_at IS NULL",
        )
        .bind(session.id)
        .bind(sponsor.id)
        .execute(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        // Always create a new participant — agents are ephemeral compositions
        let name = display_name
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("{}'s Agent", sponsor_user.display_name));
        let pid = Uuid::new_v4();

        sqlx::query(
            "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at, client_name, client_version, model)
             VALUES ($1, $2, $3, $4, 'agent', $5, NOW(), $6, $7, $8)",
        )
        .bind(pid)
        .bind(session.id)
        .bind(agent_code.user_id)
        .bind(&name)
        .bind(sponsor.id)
        .bind(client_name)
        .bind(client_version)
        .bind(model)
        .execute(&self.db)
        .await
        .map_err(|e| format!("Failed to create participant: {e}"))?;

        let participants: Vec<Participant> = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 AND disconnected_at IS NULL ORDER BY joined_at",
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
            "participant_id": pid,
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
            "SELECT * FROM participants WHERE session_id = $1 AND disconnected_at IS NULL ORDER BY joined_at",
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

