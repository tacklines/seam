use crate::knowledge;
use crate::mcp_auth::McpIdentity;
use crate::models::{AgentJoinCode, Participant, Session, User};
use crate::models::{Plan, Task, TaskComment, TaskStatus};
use chrono::Utc;
use rmcp::{
    handler::server::tool::{ToolCallContext, ToolRouter},
    handler::server::wrapper::Parameters,
    model::{
        CallToolRequestParams, CallToolResult, Content, ListToolsResult, PaginatedRequestParams,
        ServerCapabilities, ServerInfo,
    },
    schemars::JsonSchema,
    service::RequestContext,
    tool, tool_router, ErrorData as McpError, RoleServer, ServerHandler,
};
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

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
    /// Source task ID — the task whose work produced this new task (provenance tracking)
    source_task_id: Option<String>,
    /// Model hint for invocations on this task (e.g. "claude-opus-4-5")
    model_hint: Option<String>,
    /// Budget tier for invocations on this task (e.g. "high", "medium", "low")
    budget_tier: Option<String>,
    /// Provider for invocations on this task (e.g. "anthropic", "ollama")
    provider: Option<String>,
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
    /// If true (default), only show tasks in the current session. Set to false to see all project tasks.
    session_only: Option<bool>,
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
    /// Git commit SHAs to link (append to existing)
    commit_hashes: Option<Vec<String>>,
    /// Mark as no-code-change task (required if closing without commits)
    no_code_change: Option<bool>,
    /// Model hint for invocations on this task (e.g. "claude-opus-4-5")
    model_hint: Option<String>,
    /// Budget tier for invocations on this task (e.g. "high", "medium", "low")
    budget_tier: Option<String>,
    /// Provider for invocations on this task (e.g. "anthropic", "ollama")
    provider: Option<String>,
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
    /// Git commit SHAs to link (for traceability). Required unless no_code_change is true.
    commit_hashes: Option<Vec<String>>,
    /// Mark as no-code-change task (e.g. documentation, planning). Required if no commit_hashes.
    no_code_change: Option<bool>,
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

// --- Request params ---

#[derive(Debug, Deserialize, JsonSchema)]
struct CreateRequestParams {
    /// Short summary of the request
    title: String,
    /// Full request text — the human's original words (markdown supported)
    body: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListRequestsParams {
    /// Filter by status: pending, analyzing, decomposed, archived
    status: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetRequestParams {
    /// Request ID
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateRequestParams {
    /// Request ID to update
    id: String,
    /// New title
    title: Option<String>,
    /// New body text
    body: Option<String>,
    /// New status: pending, analyzing, decomposed, archived
    status: Option<String>,
    /// Agent analysis text (markdown)
    analysis: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct LinkRequestRequirementParams {
    /// Request ID
    request_id: String,
    /// Requirement ID to link
    requirement_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UnlinkRequestRequirementParams {
    /// Request ID
    request_id: String,
    /// Requirement ID to unlink
    requirement_id: String,
}

// --- Workspace params ---

#[derive(Debug, Deserialize, JsonSchema)]
struct ListWorkspacesParams {
    /// Filter by status: pending, creating, running, stopping, stopped, failed, destroyed
    status: Option<String>,
    /// Maximum number of results to return (default 20)
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetWorkspaceParams {
    /// Workspace ID (UUID)
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct StopWorkspaceParams {
    /// Workspace ID (UUID) of the running workspace to stop
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CreateWorkspaceParams {
    /// Git branch to check out in the workspace (auto-generated if not specified)
    branch: Option<String>,
    /// Coder template name (default: "seam-agent")
    template_name: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct DestroyWorkspaceParams {
    /// Workspace ID (UUID) of the workspace to destroy
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CheckCredentialsParams {
    /// Filter by credential type (e.g. "anthropic_api_key", "git_token"). Omit to list all.
    credential_type: Option<String>,
}

// --- Invocation params ---

#[derive(Debug, Deserialize, JsonSchema)]
struct ListInvocationsParams {
    /// Filter by status: pending, running, completed, failed
    status: Option<String>,
    /// Filter by workspace ID (UUID)
    workspace_id: Option<String>,
    /// Maximum number of results to return (default 20)
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetInvocationParams {
    /// Invocation ID (UUID)
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CreateInvocationParams {
    /// The prompt or task description for the agent
    prompt: String,
    /// Agent perspective to use: coder (default), reviewer, planner, tester, researcher
    agent_perspective: Option<String>,
    /// Git branch to work on (auto-generated from task if not specified)
    branch: Option<String>,
    /// Additional system prompt context to append
    system_prompt_append: Option<String>,
    /// Task ID to associate with this invocation (UUID)
    task_id: Option<String>,
    /// Claude session ID to resume (from a prior completed invocation)
    resume_session_id: Option<String>,
    /// Model preference (e.g. "claude-opus-4-5", "claude-sonnet-4-5")
    model_hint: Option<String>,
    /// Budget tier: free, economy, moderate, unlimited
    budget_tier: Option<String>,
    /// Provider preference: anthropic, openrouter, ollama
    provider: Option<String>,
}

// --- Model preference params ---

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateModelPreferencesParams {
    /// Default model to use for agent invocations (e.g. "claude-opus-4-6", "claude-sonnet-4-6")
    default_model: Option<String>,
    /// Default budget tier: "free", "economy", "moderate", "unlimited"
    default_budget: Option<String>,
    /// Default provider: "anthropic", "openrouter", "ollama"
    default_provider: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct ListAvailableModelsParams {
    /// Filter by provider: "anthropic", "openrouter" (default: all built-in providers)
    provider: Option<String>,
}

// --- Metrics params ---

#[derive(Debug, Deserialize, JsonSchema)]
struct GetMetricsSummaryParams {
    /// Time period for metrics: "1h", "24h" (default), "7d", "30d"
    period: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetCostSummaryParams {
    /// Time period for cost data: "1h", "24h", "7d" (default), "30d"
    period: Option<String>,
}

// --- Knowledge params ---

#[derive(Debug, Deserialize, JsonSchema)]
struct SearchKnowledgeParams {
    /// Search query text
    query: String,
    /// Optional filter by content type: "task", "plan", "comment"
    content_type: Option<String>,
    /// Maximum number of results to return (default 10, max 50)
    limit: Option<i64>,
    /// When true, search all projects in the org instead of only the current project
    project_wide: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetKnowledgeDetailParams {
    /// UUID of the source entity (task, plan, etc.) to retrieve chunks for
    source_id: String,
}

// --- Code search params ---

#[derive(Debug, Deserialize, JsonSchema)]
struct SearchCodeParams {
    /// Code search query (supports keywords, function names, identifiers, etc.)
    query: String,
    /// Filter by programming language (e.g., "rust", "typescript", "python")
    language: Option<String>,
    /// Maximum results (default 10, max 30)
    limit: Option<i64>,
}

// --- Plan params ---

#[derive(Debug, Deserialize, JsonSchema)]
struct ListPlansParams {
    /// Maximum number of plans to return (default 20)
    limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetPlanParams {
    /// Plan ID (UUID)
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CreatePlanParams {
    /// Plan title
    title: String,
    /// Plan content (markdown)
    content: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdatePlanParams {
    /// Plan ID (UUID)
    id: String,
    /// New title (optional)
    title: Option<String>,
    /// New content (markdown, optional)
    content: Option<String>,
}

// --- MCP Server ---

#[derive(Default)]
pub(crate) struct SessionState {
    pub session_code: Option<String>,
    pub session_id: Option<Uuid>,
    pub participant_id: Option<Uuid>,
    pub sponsor_name: Option<String>,
    pub project_id: Option<Uuid>,
    pub ticket_prefix: Option<String>,
}

pub struct SeamMcp {
    pub(crate) db: PgPool,
    pub(crate) state: Mutex<SessionState>,
    pub(crate) code_index: Option<Arc<crate::code_search::CodeIndex>>,
    pub(crate) connections: Option<Arc<crate::ws::ConnectionManager>>,
    pub(crate) log_buffer: Option<Arc<crate::log_buffer::LogBuffer>>,
    /// Whether MCP auth is enabled. When true, tool calls without a valid
    /// McpIdentity in the request context return an authentication error
    /// instead of a misleading "Session not found" from downstream handlers.
    pub(crate) auth_enabled: bool,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl SeamMcp {
    pub fn with_connections(
        db: PgPool,
        code_index: Option<Arc<crate::code_search::CodeIndex>>,
        connections: Arc<crate::ws::ConnectionManager>,
        log_buffer: Arc<crate::log_buffer::LogBuffer>,
        auth_enabled: bool,
    ) -> Self {
        Self {
            db,
            state: Mutex::new(SessionState::default()),
            code_index,
            connections: Some(connections),
            log_buffer: Some(log_buffer),
            auth_enabled,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Join a Seam session using an agent join code. The code identifies both the session and your sponsoring user."
    )]
    async fn join_session(
        &self,
        Parameters(params): Parameters<JoinSessionParams>,
    ) -> Result<CallToolResult, McpError> {
        match self
            .do_agent_join(
                &params.code,
                params.display_name.as_deref(),
                params.client_name.as_deref(),
                params.client_version.as_deref(),
                params.model.as_deref(),
            )
            .await
        {
            Ok(result) => {
                // Persist session state so subsequent tools work
                let session_code = result["session"]["code"].as_str().map(|s| s.to_string());
                let participant_id = result["participant_id"]
                    .as_str()
                    .and_then(|s| Uuid::parse_str(s).ok());
                let sponsor_name = result["sponsor_name"].as_str().map(|s| s.to_string());

                // Fetch project info from session
                let mut project_id = None;
                let mut ticket_prefix = None;
                if let Some(ref code) = session_code {
                    if let Ok(Some(session)) =
                        sqlx::query_as::<_, Session>("SELECT * FROM sessions WHERE code = $1")
                            .bind(code)
                            .fetch_optional(&self.db)
                            .await
                    {
                        if let Ok(Some(project)) = sqlx::query_as::<_, crate::models::Project>(
                            "SELECT * FROM projects WHERE id = $1",
                        )
                        .bind(session.project_id)
                        .fetch_optional(&self.db)
                        .await
                        {
                            project_id = Some(project.id);
                            ticket_prefix = Some(project.ticket_prefix);
                        }
                    }
                }

                let session_id = result["session"]["id"]
                    .as_str()
                    .and_then(|s| Uuid::parse_str(s).ok());

                if let Ok(mut state) = self.state.lock() {
                    state.session_code = session_code;
                    state.session_id = session_id;
                    state.participant_id = participant_id;
                    state.sponsor_name = sponsor_name;
                    state.project_id = project_id;
                    state.ticket_prefix = ticket_prefix;
                }

                self.notify_agent_state("joined", "Session joined").await;

                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(
        description = "Update your agent's composition metadata (model, client info). Call after model routing to report which model you are using."
    )]
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

        let sql = format!("UPDATE participants SET {} WHERE id = $1", sets.join(", "),);

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
            })
            .to_string(),
        )]))
    }

    #[tool(
        description = "Get session state including all participants. Provide session code or omit to use your current session."
    )]
    async fn get_session(
        &self,
        Parameters(params): Parameters<GetSessionParams>,
    ) -> Result<CallToolResult, McpError> {
        let code = match params
            .code
            .or_else(|| self.state.lock().ok().and_then(|s| s.session_code.clone()))
        {
            Some(c) => c,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                "No session code provided and not currently in a session. Use join_session first.",
            )]))
            }
        };

        match self.fetch_session(&code).await {
            Ok(session) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&session).unwrap(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(
        description = "Get your own participant info including ID, session code, and sponsor name. Only available after joining a session."
    )]
    async fn my_info(&self) -> Result<CallToolResult, McpError> {
        let state = self
            .state
            .lock()
            .map_err(|_| McpError::internal_error("Lock poisoned", None))?;
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

    #[tool(
        description = "Create a task in the current session's project. Types: epic, story, task, subtask, bug. Use parent_id for hierarchy (e.g. stories under epics)."
    )]
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

        if params.title.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Title cannot be empty",
            )]));
        }

        let valid_types = ["epic", "story", "task", "subtask", "bug"];
        if !valid_types.contains(&params.task_type.as_str()) {
            return Ok(CallToolResult::error(vec![Content::text(format!(
                "Invalid task_type '{}'. Must be one of: {}",
                params.task_type,
                valid_types.join(", ")
            ))]));
        }

        let parent_id = match params.parent_id {
            Some(ref s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid parent_id UUID",
                    )]))
                }
            },
            None => None,
        };

        let assigned_to = match params.assigned_to {
            Some(ref s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid assigned_to UUID",
                    )]))
                }
            },
            None => None,
        };

        let source_task_id = match params.source_task_id {
            Some(ref s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid source_task_id UUID",
                    )]))
                }
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
            "INSERT INTO tasks (id, session_id, project_id, ticket_number, parent_id, task_type, title, description, status, priority, complexity, assigned_to, created_by, source_task_id, model_hint, budget_tier, provider, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())"
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
        .bind(source_task_id)
        .bind(&params.model_hint)
        .bind(&params.budget_tier)
        .bind(&params.provider)
        .execute(&self.db)
        .await {
            Ok(_) => {
                // Auto-add task to session
                sqlx::query("INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
                    .bind(session_id)
                    .bind(task_id)
                    .execute(&self.db)
                    .await
                    .ok();

                // Record activity
                let prefix = self.get_ticket_prefix();
                let ticket_id = format!("{}-{}", prefix, ticket_number);
                self.record_activity(
                    project_id, Some(session_id), participant_id,
                    "task_created", "task", task_id,
                    &format!("created {} {}", params.task_type, ticket_id),
                    serde_json::json!({ "ticket_id": ticket_id, "task_type": params.task_type, "title": params.title }),
                ).await;

                // Emit domain event for event bridge (automated reactions)
                let event = crate::events::DomainEvent::new(
                    "task.created", "task", task_id, Some(participant_id),
                    serde_json::json!({
                        "project_id": project_id,
                        "session_id": session_id,
                        "ticket_id": ticket_id,
                        "task_type": params.task_type,
                        "title": params.title,
                    }),
                );
                if let Err(e) = crate::events::emit(&self.db, &event).await {
                    tracing::warn!("Failed to emit task_created domain event: {e}");
                }

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

    #[tool(
        description = "List tasks in the current project. Filter by task_type, status, parent_id, or assigned_to."
    )]
    async fn list_tasks(
        &self,
        Parameters(params): Parameters<ListTasksParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let ticket_prefix = self.get_ticket_prefix();

        // Default to session-scoped unless explicitly opted out
        let filter_by_session = params.session_only != Some(false);

        let session_id_opt = if filter_by_session {
            match self.require_session().await {
                Ok(id) => Some(id),
                Err(e) => return Ok(e),
            }
        } else {
            None
        };

        let mut query = if filter_by_session {
            String::from(
                "SELECT t.* FROM tasks t \
                 INNER JOIN session_tasks st ON st.task_id = t.id AND st.session_id = $2 \
                 WHERE t.project_id = $1",
            )
        } else {
            String::from("SELECT * FROM tasks WHERE project_id = $1")
        };
        let mut param_idx = if filter_by_session { 3u32 } else { 2u32 };

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
        if let Some(session_id) = session_id_opt {
            q = q.bind(session_id);
        }
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
                let child_map: std::collections::HashMap<Uuid, i64> =
                    child_counts.into_iter().collect();

                // Batch comment counts
                let comment_counts: Vec<(Uuid, i64)> = sqlx::query_as(
                    "SELECT task_id, COUNT(*) FROM task_comments WHERE task_id = ANY($1) GROUP BY task_id"
                )
                .bind(&task_ids)
                .fetch_all(&self.db)
                .await
                .unwrap_or_default();
                let comment_map: std::collections::HashMap<Uuid, i64> =
                    comment_counts.into_iter().collect();

                let summary: Vec<serde_json::Value> = tasks
                    .iter()
                    .map(|t| {
                        serde_json::json!({
                            "id": t.id,
                            "ticket_id": format!("{}-{}", ticket_prefix, t.ticket_number),
                            "ticket_number": t.ticket_number,
                            "task_type": serde_json::to_value(t.task_type).unwrap(),
                            "title": t.title,
                            "status": serde_json::to_value(t.status).unwrap(),
                            "priority": serde_json::to_value(t.priority).unwrap(),
                            "complexity": serde_json::to_value(t.complexity).unwrap(),
                            "parent_id": t.parent_id,
                            "assigned_to": t.assigned_to,
                            "created_at": t.created_at,
                            "child_count": child_map.get(&t.id).unwrap_or(&0),
                            "comment_count": comment_map.get(&t.id).unwrap_or(&0),
                        })
                    })
                    .collect();
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&summary).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Query error: {e}"
            ))])),
        }
    }

    #[tool(description = "Get a task by ID with full details including description and comments.")]
    async fn get_task(
        &self,
        Parameters(params): Parameters<GetTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let task_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task ID",
                )]))
            }
        };

        match self.fetch_task_with_comments(task_id).await {
            Ok(result) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&result).unwrap(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(
        description = "Update a task's title, description, status, assignee, or parent. Only provided fields are changed."
    )]
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
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task ID",
                )]))
            }
        };

        // Fetch current task (scoped to project for cross-project security)
        let task: Task =
            match sqlx::query_as("SELECT * FROM tasks WHERE id = $1 AND project_id = $2")
                .bind(task_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
            {
                Ok(Some(t)) => t,
                Ok(None) => {
                    return Ok(CallToolResult::error(vec![Content::text("Task not found")]))
                }
                Err(e) => {
                    return Ok(CallToolResult::error(vec![Content::text(format!(
                        "Database error: {e}"
                    ))]))
                }
            };

        let title = params.title.as_deref().unwrap_or(&task.title);
        let description = match &params.description {
            Some(d) => Some(d.as_str()),
            None => task.description.as_deref(),
        };

        let status = params.status.as_deref().unwrap_or(match task.status {
            TaskStatus::Open => "open",
            TaskStatus::InProgress => "in_progress",
            TaskStatus::Done => "done",
            TaskStatus::Closed => "closed",
        });

        let valid_statuses = ["open", "in_progress", "done", "closed"];
        if !valid_statuses.contains(&status) {
            return Ok(CallToolResult::error(vec![Content::text(format!(
                "Invalid status '{}'. Must be one of: {}",
                status,
                valid_statuses.join(", ")
            ))]));
        }

        let priority = params.priority.as_deref().unwrap_or(match task.priority {
            crate::models::TaskPriority::Critical => "critical",
            crate::models::TaskPriority::High => "high",
            crate::models::TaskPriority::Medium => "medium",
            crate::models::TaskPriority::Low => "low",
        });

        let complexity = params
            .complexity
            .as_deref()
            .unwrap_or(match task.complexity {
                crate::models::TaskComplexity::Xl => "xl",
                crate::models::TaskComplexity::Large => "large",
                crate::models::TaskComplexity::Medium => "medium",
                crate::models::TaskComplexity::Small => "small",
                crate::models::TaskComplexity::Trivial => "trivial",
            });

        let assigned_to = match &params.assigned_to {
            Some(s) if s == "none" || s == "null" => None,
            Some(s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid assigned_to UUID",
                    )]))
                }
            },
            None => task.assigned_to,
        };

        let parent_id = match &params.parent_id {
            Some(s) if s == "none" || s == "null" => None,
            Some(s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid parent_id UUID",
                    )]))
                }
            },
            None => task.parent_id,
        };

        // Merge model config (request value wins; fall back to current)
        let model_hint = params
            .model_hint
            .clone()
            .or_else(|| task.model_hint.clone());
        let budget_tier = params
            .budget_tier
            .clone()
            .or_else(|| task.budget_tier.clone());
        let provider = params.provider.clone().or_else(|| task.provider.clone());

        // Merge commit_hashes
        let mut commit_hashes = task.commit_hashes.clone();
        if let Some(ref new_hashes) = params.commit_hashes {
            for h in new_hashes {
                if !commit_hashes.contains(h) {
                    commit_hashes.push(h.clone());
                }
            }
        }
        let no_code_change = params.no_code_change.unwrap_or(task.no_code_change);

        let is_closing = (status == "closed" || status == "done") && task.closed_at.is_none();

        // Enforce: closing requires either commits or no_code_change
        if is_closing && !no_code_change && commit_hashes.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Cannot close task without commits. Provide commit_hashes or set no_code_change=true."
            )]));
        }

        let closed_at = if is_closing { Some(Utc::now()) } else { None };

        match sqlx::query(
            "UPDATE tasks SET title = $1, description = $2, status = $3, priority = $4, complexity = $5, assigned_to = $6, parent_id = $7, commit_hashes = $8, no_code_change = $9, closed_at = COALESCE($10, closed_at), model_hint = $11, budget_tier = $12, provider = $13, updated_at = NOW() WHERE id = $14 AND project_id = $15"
        )
        .bind(title)
        .bind(description)
        .bind(status)
        .bind(priority)
        .bind(complexity)
        .bind(assigned_to)
        .bind(parent_id)
        .bind(&commit_hashes)
        .bind(no_code_change)
        .bind(closed_at)
        .bind(&model_hint)
        .bind(&budget_tier)
        .bind(&provider)
        .bind(task_id)
        .bind(project_id)
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

                // Emit domain event for event bridge
                let domain_event_type = if event_type == "task_closed" { "task.closed" } else { "task.updated" };
                let event = crate::events::DomainEvent::new(
                    domain_event_type, "task", task_id, Some(participant_id),
                    serde_json::json!({
                        "project_id": project_id,
                        "ticket_id": ticket_id,
                        "status": status,
                    }),
                );
                if let Err(e) = crate::events::emit(&self.db, &event).await {
                    tracing::warn!("Failed to emit {domain_event_type} domain event: {e}");
                }

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

    #[tool(
        description = "Add a comment to a task. Use for evidence, code references, discussion, or status updates."
    )]
    async fn add_comment(
        &self,
        Parameters(params): Parameters<AddCommentParams>,
    ) -> Result<CallToolResult, McpError> {
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        if params.content.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Comment content cannot be empty",
            )]));
        }

        let task_id = match Uuid::parse_str(&params.task_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task_id",
                )]))
            }
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

                // Emit comment.added domain event (matching routes/tasks.rs)
                let comment_event = crate::events::DomainEvent::new(
                    "comment.added",
                    "task",
                    task_id,
                    Some(participant_id),
                    serde_json::json!({
                        "comment_id": comment_id,
                        "preview": &params.content[..params.content.len().min(100)],
                    }),
                );
                if let Err(e) = crate::events::emit(&self.db, &comment_event).await {
                    tracing::warn!("Failed to emit domain event: {e}");
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

    #[tool(
        description = "Close a task. Requires either commit_hashes (git SHAs for traceability) or no_code_change=true (for tasks that don't produce code, e.g. planning, docs review)."
    )]
    async fn close_task(
        &self,
        Parameters(params): Parameters<CloseTaskParams>,
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
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task ID",
                )]))
            }
        };

        let no_code_change = params.no_code_change.unwrap_or(false);
        let new_hashes = params.commit_hashes.unwrap_or_default();

        // Fetch current task to merge commit_hashes (scoped to project for cross-project security)
        let current: Task =
            match sqlx::query_as("SELECT * FROM tasks WHERE id = $1 AND project_id = $2")
                .bind(task_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
            {
                Ok(Some(t)) => t,
                Ok(None) => {
                    return Ok(CallToolResult::error(vec![Content::text("Task not found")]))
                }
                Err(e) => {
                    return Ok(CallToolResult::error(vec![Content::text(format!(
                        "DB error: {e}"
                    ))]))
                }
            };

        let mut merged_hashes = current.commit_hashes.clone();
        for h in &new_hashes {
            if !merged_hashes.contains(h) {
                merged_hashes.push(h.clone());
            }
        }

        // Enforce: closing requires either commits or no_code_change
        if !no_code_change && merged_hashes.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Cannot close task without commits. Provide commit_hashes or set no_code_change=true."
            )]));
        }

        match sqlx::query(
            "UPDATE tasks SET status = 'closed', commit_hashes = $1, no_code_change = $2, closed_at = NOW(), updated_at = NOW() WHERE id = $3 AND project_id = $4"
        )
        .bind(&merged_hashes)
        .bind(no_code_change)
        .bind(task_id)
        .bind(project_id)
        .execute(&self.db)
        .await {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text("Task not found")]))
            }
            Ok(_) => {
                // Record activity + domain event
                let prefix = self.get_ticket_prefix();
                let ticket_id = format!("{}-{}", prefix, current.ticket_number);
                self.record_activity(
                    project_id, Some(session_id), participant_id,
                    "task_closed", "task", task_id,
                    &format!("closed {}", ticket_id),
                    serde_json::json!({ "ticket_id": ticket_id }),
                ).await;

                let event = crate::events::DomainEvent::new(
                    "task.closed", "task", task_id, Some(participant_id),
                    serde_json::json!({
                        "project_id": project_id,
                        "ticket_id": ticket_id,
                        "commit_hashes": merged_hashes,
                        "no_code_change": no_code_change,
                    }),
                );
                if let Err(e) = crate::events::emit(&self.db, &event).await {
                    tracing::warn!("Failed to emit task_closed domain event: {e}");
                }

                self.notify_agent_state("idle", &format!("Closed task {}", params.id)).await;
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

    #[tool(
        description = "Claim a task — assigns it to yourself. Useful for preventing duplicate work in multi-agent sessions."
    )]
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
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task ID",
                )]))
            }
        };

        // Check task exists and isn't already claimed by someone else (scoped to project)
        let task: Task =
            match sqlx::query_as("SELECT * FROM tasks WHERE id = $1 AND project_id = $2")
                .bind(task_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
            {
                Ok(Some(t)) => t,
                Ok(None) => {
                    return Ok(CallToolResult::error(vec![Content::text("Task not found")]))
                }
                Err(e) => {
                    return Ok(CallToolResult::error(vec![Content::text(format!(
                        "Database error: {e}"
                    ))]))
                }
            };

        if task.assigned_to == Some(participant_id) {
            return Ok(CallToolResult::success(vec![Content::text(
                "Already assigned to you",
            )]));
        }

        if task.assigned_to.is_some() {
            return Ok(CallToolResult::error(vec![Content::text(format!(
                "Task is already assigned to {}. Use update_task to reassign.",
                task.assigned_to.unwrap()
            ))]));
        }

        match sqlx::query("UPDATE tasks SET assigned_to = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3")
            .bind(participant_id)
            .bind(task_id)
            .bind(project_id)
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

                self.notify_agent_state("working", &format!("Claimed {}", ticket_id)).await;

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

    #[tool(
        description = "Unclaim a task — removes your assignment. Only works if you are the current assignee."
    )]
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
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task ID",
                )]))
            }
        };

        let task: Task =
            match sqlx::query_as("SELECT * FROM tasks WHERE id = $1 AND project_id = $2")
                .bind(task_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
            {
                Ok(Some(t)) => t,
                Ok(None) => {
                    return Ok(CallToolResult::error(vec![Content::text("Task not found")]))
                }
                Err(e) => {
                    return Ok(CallToolResult::error(vec![Content::text(format!(
                        "Database error: {e}"
                    ))]))
                }
            };

        if task.assigned_to != Some(participant_id) {
            return Ok(CallToolResult::error(vec![Content::text(
                "You are not assigned to this task",
            )]));
        }

        match sqlx::query("UPDATE tasks SET assigned_to = NULL, updated_at = NOW() WHERE id = $1 AND project_id = $2")
            .bind(task_id)
            .bind(project_id)
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

    #[tool(
        description = "Get a summary of task counts by status and type for the current project. Useful for orientation."
    )]
    async fn task_summary(&self) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let by_status: Vec<(String, i64)> = sqlx::query_as(
            "SELECT status::text, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY status",
        )
        .bind(project_id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let by_type: Vec<(String, i64)> = sqlx::query_as(
            "SELECT task_type::text, COUNT(*) FROM tasks WHERE project_id = $1 GROUP BY task_type",
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

    #[tool(
        description = "List recent activity events in the project. Shows who did what and when — task creates, updates, comments, etc."
    )]
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

        let items: Vec<serde_json::Value> = events
            .into_iter()
            .map(
                |(
                    id,
                    actor_id,
                    actor_name,
                    event_type,
                    _target_type,
                    target_id,
                    summary,
                    metadata,
                    created_at,
                )| {
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
                },
            )
            .collect();

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&items).unwrap(),
        )]))
    }

    #[tool(
        description = "Ask a question that humans in the session can answer. Returns the question ID — use check_answer to poll for the response."
    )]
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

        if params.question.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Question cannot be empty",
            )]));
        }

        let directed_to = match &params.directed_to {
            Some(id_str) => match Uuid::parse_str(id_str) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid directed_to participant ID",
                    )]))
                }
            },
            None => None,
        };

        let context_json: Option<serde_json::Value> = match &params.context {
            Some(ctx) => match serde_json::from_str(ctx) {
                Ok(v) => Some(v),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid context JSON",
                    )]))
                }
            },
            None => None,
        };

        let expires_at = params.expires_in_seconds.map(|secs| {
            let secs = secs.clamp(10, 3600);
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

    #[tool(
        description = "Check if a question has been answered. Returns the current status and answer if available."
    )]
    async fn check_answer(
        &self,
        Parameters(params): Parameters<CheckAnswerParams>,
    ) -> Result<CallToolResult, McpError> {
        let question_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid question ID",
                )]))
            }
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
            Some((
                id,
                question_text,
                status,
                answer_text,
                answered_by,
                created_at,
                answered_at,
            )) => {
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
                    if let Ok(Some(p)) =
                        sqlx::query_as::<_, Participant>("SELECT * FROM participants WHERE id = $1")
                            .bind(by)
                            .fetch_optional(&self.db)
                            .await
                    {
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
            None => Ok(CallToolResult::error(vec![Content::text(
                "Question not found",
            )])),
        }
    }

    #[tool(
        description = "List questions in the current session. Defaults to pending questions. Use status='all' to see everything."
    )]
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
        for (
            id,
            question_text,
            status,
            answer_text,
            asked_by,
            directed_to,
            answered_by,
            created_at,
            answered_at,
        ) in questions
        {
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

    #[tool(
        description = "Cancel one of your own pending questions. The question will no longer appear as pending for humans."
    )]
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
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid question ID",
                )]))
            }
        };

        let result = sqlx::query(
            "UPDATE questions SET status = 'cancelled' WHERE id = $1 AND asked_by = $2 AND status = 'pending'"
        )
        .bind(question_id)
        .bind(participant_id)
        .execute(&self.db)
        .await;

        match result {
            Ok(r) if r.rows_affected() > 0 => Ok(CallToolResult::success(vec![Content::text(
                "Question cancelled",
            )])),
            Ok(_) => Ok(CallToolResult::error(vec![Content::text(
                "Question not found, not yours, or not pending",
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Database error: {e}"
            ))])),
        }
    }

    #[tool(
        description = "Get a shared note by slug. Notes are session-scoped collaborative documents for sharing context, decisions, and findings."
    )]
    async fn get_note(
        &self,
        Parameters(params): Parameters<GetNoteParams>,
    ) -> Result<CallToolResult, McpError> {
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let note: Option<crate::models::Note> =
            sqlx::query_as("SELECT * FROM notes WHERE session_id = $1 AND slug = $2")
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
            None => Ok(CallToolResult::error(vec![Content::text(format!(
                "Note '{}' not found. Use update_note to create it.",
                params.slug
            ))])),
        }
    }

    #[tool(
        description = "Create or update a shared note. Notes are session-scoped markdown documents. Use slugs like 'scratchpad', 'decisions', 'findings', etc."
    )]
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

        let notes: Vec<crate::models::Note> =
            sqlx::query_as("SELECT * FROM notes WHERE session_id = $1 ORDER BY created_at")
                .bind(session_id)
                .fetch_all(&self.db)
                .await
                .map_err(|e| McpError::internal_error(format!("Database error: {e}"), None))?;

        let items: Vec<serde_json::Value> = notes
            .iter()
            .map(|n| {
                serde_json::json!({
                    "slug": n.slug,
                    "title": n.title,
                    "content_length": n.content.len(),
                    "updated_at": n.updated_at.to_rfc3339(),
                })
            })
            .collect();

        let result = serde_json::json!({
            "count": items.len(),
            "notes": items,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "Delete a task and all its children. Use with caution — this is irreversible."
    )]
    async fn delete_task(
        &self,
        Parameters(params): Parameters<GetTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let task_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task ID",
                )]))
            }
        };

        // Fetch task data before deleting for the domain event payload
        // Scoped to project_id to prevent cross-project deletion
        let task: Option<(String, i32)> = sqlx::query_as(
            "SELECT title, ticket_number FROM tasks WHERE id = $1 AND project_id = $2",
        )
        .bind(task_id)
        .bind(project_id)
        .fetch_optional(&self.db)
        .await
        .ok()
        .flatten();

        match sqlx::query("DELETE FROM tasks WHERE id = $1 AND project_id = $2")
            .bind(task_id)
            .bind(project_id)
            .execute(&self.db)
            .await
        {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text("Task not found")]))
            }
            Ok(_) => {
                // Emit domain event after successful delete
                if let Some((title, ticket_number)) = task {
                    let (session_id, participant_id) = self
                        .state
                        .lock()
                        .map(|s| (s.session_id, s.participant_id))
                        .unwrap_or((None, None));
                    if let Some(sid) = session_id {
                        let event = crate::events::DomainEvent::new(
                            "task.deleted",
                            "task",
                            task_id,
                            participant_id,
                            serde_json::json!({
                                "task_id": task_id,
                                "title": title,
                                "ticket_number": ticket_number,
                                "session_id": sid,
                            }),
                        );
                        if let Err(e) = crate::events::emit(&self.db, &event).await {
                            tracing::warn!("Failed to emit task_deleted event: {e}");
                        }
                    }
                }
                Ok(CallToolResult::success(vec![Content::text("Task deleted")]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Delete failed: {e}"
            ))])),
        }
    }

    #[tool(
        description = "Add a dependency: blocker_id blocks blocked_id. The blocked task cannot be started until the blocker is done. Prevents circular dependencies."
    )]
    async fn add_dependency(
        &self,
        Parameters(params): Parameters<AddDependencyParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let blocker_id = match Uuid::parse_str(&params.blocker_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid blocker_id",
                )]))
            }
        };
        let blocked_id = match Uuid::parse_str(&params.blocked_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid blocked_id",
                )]))
            }
        };

        if blocker_id == blocked_id {
            return Ok(CallToolResult::error(vec![Content::text(
                "A task cannot block itself",
            )]));
        }

        // Verify both tasks belong to this project
        let task_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE id IN ($1, $2) AND project_id = $3",
        )
        .bind(blocker_id)
        .bind(blocked_id)
        .bind(project_id)
        .fetch_one(&self.db)
        .await
        .unwrap_or(0);

        if task_count != 2 {
            return Ok(CallToolResult::error(vec![Content::text(
                "One or both tasks not found in this project",
            )]));
        }

        // Check for circular dependency: walk upstream from the proposed blocker
        // to see if the proposed blocked task is already in the blocker's ancestry
        let would_cycle: bool = sqlx::query_scalar(
            "WITH RECURSIVE chain AS (
                SELECT blocker_id FROM task_dependencies WHERE blocked_id = $1
                UNION
                SELECT d.blocker_id FROM task_dependencies d JOIN chain c ON d.blocked_id = c.blocker_id
            )
            SELECT EXISTS(SELECT 1 FROM chain WHERE blocker_id = $2)"
        )
        .bind(blocker_id)   // $1 — walk upstream from the proposed blocker
        .bind(blocked_id)   // $2 — check if proposed blocked is already upstream
        .fetch_one(&self.db)
        .await
        .unwrap_or(false);

        if would_cycle {
            return Ok(CallToolResult::error(vec![Content::text(
                "Cannot add dependency: would create a cycle",
            )]));
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
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let blocker_id = match Uuid::parse_str(&params.blocker_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid blocker_id",
                )]))
            }
        };
        let blocked_id = match Uuid::parse_str(&params.blocked_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid blocked_id",
                )]))
            }
        };

        // Only delete if both tasks belong to this project
        match sqlx::query(
            "DELETE FROM task_dependencies WHERE blocker_id = $1 AND blocked_id = $2
             AND EXISTS (SELECT 1 FROM tasks WHERE id = $1 AND project_id = $3)
             AND EXISTS (SELECT 1 FROM tasks WHERE id = $2 AND project_id = $3)",
        )
        .bind(blocker_id)
        .bind(blocked_id)
        .bind(project_id)
        .execute(&self.db)
        .await
        {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text(
                    "Dependency not found",
                )]))
            }
            Ok(_) => Ok(CallToolResult::success(vec![Content::text(
                "Dependency removed",
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed: {e}"
            ))])),
        }
    }

    // --- Requirements tools ---

    #[tool(
        description = "Create a requirement — a high-level goal that drives research and task creation. Examples: 'Ensure full i18n coverage', 'Achieve WCAG 2.1 AA compliance'. Use parent_id for decomposition."
    )]
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

        if params.title.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Title cannot be empty",
            )]));
        }

        let priority = params.priority.as_deref().unwrap_or("medium");
        let valid_priorities = ["critical", "high", "medium", "low"];
        if !valid_priorities.contains(&priority) {
            return Ok(CallToolResult::error(vec![Content::text(format!(
                "Invalid priority '{}'. Must be one of: {}",
                priority,
                valid_priorities.join(", ")
            ))]));
        }

        let description = params.description.as_deref().unwrap_or("");

        let parent_id = if let Some(ref pid) = params.parent_id {
            match Uuid::parse_str(pid) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid parent_id",
                    )]))
                }
            }
        } else {
            None
        };

        // Look up the user_id for this participant
        let user_id: Option<(Uuid,)> =
            sqlx::query_as("SELECT user_id FROM participants WHERE id = $1")
                .bind(participant_id)
                .fetch_optional(&self.db)
                .await
                .unwrap_or(None);

        let user_id = match user_id {
            Some((uid,)) => uid,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Participant not found",
                )]))
            }
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

    #[tool(
        description = "List requirements in the current project. Defaults to top-level requirements (no parent). Use parent_id to list children of a specific requirement."
    )]
    async fn list_requirements(
        &self,
        Parameters(params): Parameters<ListRequirementsParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

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

        let mut q = sqlx::query_as::<_, crate::models::Requirement>(&sql).bind(project_id);
        if let Some(ref status) = params.status {
            q = q.bind(status);
        }
        if let Some(ref priority) = params.priority {
            q = q.bind(priority);
        }
        if let Some(ref parent_id) = params.parent_id {
            match Uuid::parse_str(parent_id) {
                Ok(pid) => q = q.bind(pid),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid parent_id",
                    )]))
                }
            }
        }

        match q.fetch_all(&self.db).await {
            Ok(reqs) => {
                let mut items = Vec::new();
                for r in &reqs {
                    let child_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM requirements WHERE parent_id = $1",
                    )
                    .bind(r.id)
                    .fetch_one(&self.db)
                    .await
                    .unwrap_or(0);

                    let task_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM requirement_tasks WHERE requirement_id = $1",
                    )
                    .bind(r.id)
                    .fetch_one(&self.db)
                    .await
                    .unwrap_or(0);

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
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed: {e}"
            ))])),
        }
    }

    #[tool(
        description = "Get a requirement by ID with full details including description, children, and linked tasks."
    )]
    async fn get_requirement(
        &self,
        Parameters(params): Parameters<GetRequirementParams>,
    ) -> Result<CallToolResult, McpError> {
        let req_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid requirement ID",
                )]))
            }
        };

        let req = match sqlx::query_as::<_, crate::models::Requirement>(
            "SELECT * FROM requirements WHERE id = $1",
        )
        .bind(req_id)
        .fetch_optional(&self.db)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Requirement not found",
                )]))
            }
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Database error: {e}"
                ))]))
            }
        };

        let children = sqlx::query_as::<_, crate::models::Requirement>(
            "SELECT * FROM requirements WHERE parent_id = $1 ORDER BY priority, created_at",
        )
        .bind(req_id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let linked_tasks: Vec<(Uuid,)> =
            sqlx::query_as("SELECT task_id FROM requirement_tasks WHERE requirement_id = $1")
                .bind(req_id)
                .fetch_all(&self.db)
                .await
                .unwrap_or_default();

        let child_items: Vec<_> = children
            .iter()
            .map(|c| {
                serde_json::json!({
                    "id": c.id,
                    "title": c.title,
                    "status": c.status,
                    "priority": c.priority,
                })
            })
            .collect();

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

    #[tool(
        description = "Update a requirement's title, description, status, priority, or parent. Only provided fields are changed. Status transitions: draft→active, active→satisfied/archived, satisfied→active/archived, archived→draft."
    )]
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
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid requirement ID",
                )]))
            }
        };

        let current = match sqlx::query_as::<_, crate::models::Requirement>(
            "SELECT * FROM requirements WHERE id = $1 AND project_id = $2",
        )
        .bind(req_id)
        .bind(project_id)
        .fetch_optional(&self.db)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Requirement not found",
                )]))
            }
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Database error: {e}"
                ))]))
            }
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
            return Ok(CallToolResult::error(vec![Content::text(
                "No fields to update",
            )]));
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
            let valid = matches!(
                (current.status, status.as_str()),
                (
                    crate::models::RequirementStatus::Draft,
                    "active" | "archived"
                ) | (
                    crate::models::RequirementStatus::Active,
                    "satisfied" | "archived"
                ) | (
                    crate::models::RequirementStatus::Satisfied,
                    "active" | "archived"
                ) | (crate::models::RequirementStatus::Archived, "draft")
            );
            if !valid {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Invalid status transition: {:?} → {status}",
                    current.status
                ))]));
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
                            return Ok(CallToolResult::error(vec![Content::text(
                                "A requirement cannot be its own parent",
                            )]));
                        }
                        q = q.bind(Some(pid));
                    }
                    Err(_) => {
                        return Ok(CallToolResult::error(vec![Content::text(
                            "Invalid parent_id",
                        )]))
                    }
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
                self.record_activity(
                    project_id,
                    Some(session_id),
                    participant_id,
                    "requirement_updated",
                    "requirement",
                    req.id,
                    &format!("updated requirement: {}", req.title),
                    serde_json::json!({"title": req.title}),
                )
                .await;
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed: {e}"
            ))])),
        }
    }

    #[tool(
        description = "Link a task to a requirement, indicating the task was created to satisfy this requirement."
    )]
    async fn link_requirement_task(
        &self,
        Parameters(params): Parameters<LinkRequirementTaskParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let req_id = match Uuid::parse_str(&params.requirement_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid requirement_id",
                )]))
            }
        };
        let task_id = match Uuid::parse_str(&params.task_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task_id",
                )]))
            }
        };

        // Verify both entities belong to this project
        let req_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM requirements WHERE id = $1 AND project_id = $2)",
        )
        .bind(req_id)
        .bind(project_id)
        .fetch_one(&self.db)
        .await
        .unwrap_or(false);

        let task_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1 AND project_id = $2)",
        )
        .bind(task_id)
        .bind(project_id)
        .fetch_one(&self.db)
        .await
        .unwrap_or(false);

        if !req_exists || !task_exists {
            return Ok(CallToolResult::error(vec![Content::text(
                "Requirement or task not found in this project",
            )]));
        }

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
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let req_id = match Uuid::parse_str(&params.requirement_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid requirement_id",
                )]))
            }
        };
        let task_id = match Uuid::parse_str(&params.task_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid task_id",
                )]))
            }
        };

        // Only delete if both entities belong to this project
        match sqlx::query(
            "DELETE FROM requirement_tasks WHERE requirement_id = $1 AND task_id = $2
             AND EXISTS (SELECT 1 FROM requirements WHERE id = $1 AND project_id = $3)
             AND EXISTS (SELECT 1 FROM tasks WHERE id = $2 AND project_id = $3)",
        )
        .bind(req_id)
        .bind(task_id)
        .bind(project_id)
        .execute(&self.db)
        .await
        {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text("Link not found")]))
            }
            Ok(_) => Ok(CallToolResult::success(vec![Content::text(
                "Task unlinked from requirement",
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed: {e}"
            ))])),
        }
    }

    // --- Request tools ---

    #[tool(
        description = "Create a feature request — captures human intent that drives requirement decomposition. The request will be analyzed and broken into requirements and tasks."
    )]
    async fn create_request(
        &self,
        Parameters(params): Parameters<CreateRequestParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let session_id = match self.require_session().await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        // Look up user_id for this participant
        let user_id: Option<(Uuid,)> =
            sqlx::query_as("SELECT user_id FROM participants WHERE id = $1")
                .bind(participant_id)
                .fetch_optional(&self.db)
                .await
                .unwrap_or(None);

        let user_id = match user_id {
            Some((uid,)) => uid,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Participant not found",
                )]))
            }
        };

        if params.title.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Title cannot be empty",
            )]));
        }

        match sqlx::query_as::<_, crate::models::Request>(
            "INSERT INTO requests (project_id, session_id, author_id, title, body)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *",
        )
        .bind(project_id)
        .bind(Some(session_id))
        .bind(user_id)
        .bind(&params.title)
        .bind(&params.body)
        .fetch_one(&self.db)
        .await
        {
            Ok(req) => {
                self.record_activity(
                    project_id,
                    Some(session_id),
                    participant_id,
                    "request_created",
                    "request",
                    req.id,
                    &format!("created request: {}", req.title),
                    serde_json::json!({"title": req.title}),
                )
                .await;

                // Also emit domain event for event bridge (automated dispatch)
                let event = crate::events::DomainEvent::new(
                    "request_created",
                    "request",
                    req.id,
                    Some(user_id),
                    serde_json::json!({
                        "project_id": project_id,
                        "title": req.title,
                        "body": req.body,
                        "session_id": session_id,
                    }),
                );
                if let Err(e) = crate::events::emit(&self.db, &event).await {
                    tracing::warn!("Failed to emit request_created domain event: {e}");
                }

                Ok(CallToolResult::success(vec![Content::text(format!(
                    "Created request '{}' (id: {}, status: pending)",
                    req.title, req.id
                ))]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed to create request: {e}"
            ))])),
        }
    }

    #[tool(
        description = "List feature requests in the current project. Optionally filter by status."
    )]
    async fn list_requests(
        &self,
        Parameters(params): Parameters<ListRequestsParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let reqs = if let Some(ref status) = params.status {
            sqlx::query_as::<_, crate::models::Request>(
                "SELECT * FROM requests WHERE project_id = $1 AND status = $2 ORDER BY created_at DESC",
            )
            .bind(project_id)
            .bind(status)
            .fetch_all(&self.db)
            .await
        } else {
            sqlx::query_as::<_, crate::models::Request>(
                "SELECT * FROM requests WHERE project_id = $1 ORDER BY created_at DESC",
            )
            .bind(project_id)
            .fetch_all(&self.db)
            .await
        };

        match reqs {
            Ok(reqs) if reqs.is_empty() => Ok(CallToolResult::success(vec![Content::text(
                "No requests found.",
            )])),
            Ok(reqs) => {
                let mut lines = Vec::new();
                for r in &reqs {
                    let req_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM request_requirements WHERE request_id = $1",
                    )
                    .bind(r.id)
                    .fetch_one(&self.db)
                    .await
                    .unwrap_or(0);

                    lines.push(format!(
                        "- [{}] {} (id: {}, requirements: {})",
                        match r.status {
                            crate::models::RequestStatus::Pending => "pending",
                            crate::models::RequestStatus::Analyzing => "analyzing",
                            crate::models::RequestStatus::Decomposed => "decomposed",
                            crate::models::RequestStatus::Archived => "archived",
                        },
                        r.title,
                        r.id,
                        req_count,
                    ));
                }
                Ok(CallToolResult::success(vec![Content::text(
                    lines.join("\n"),
                )]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed to list requests: {e}"
            ))])),
        }
    }

    #[tool(
        description = "Get a request by ID with full details including body, analysis, and linked requirements."
    )]
    async fn get_request(
        &self,
        Parameters(params): Parameters<GetRequestParams>,
    ) -> Result<CallToolResult, McpError> {
        let id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid request ID",
                )]))
            }
        };

        let req = match sqlx::query_as::<_, crate::models::Request>(
            "SELECT * FROM requests WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Request not found",
                )]))
            }
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Failed: {e}"
                ))]))
            }
        };

        let linked_req_ids: Vec<(Uuid,)> =
            sqlx::query_as("SELECT requirement_id FROM request_requirements WHERE request_id = $1")
                .bind(req.id)
                .fetch_all(&self.db)
                .await
                .unwrap_or_default();

        let status_str = match req.status {
            crate::models::RequestStatus::Pending => "pending",
            crate::models::RequestStatus::Analyzing => "analyzing",
            crate::models::RequestStatus::Decomposed => "decomposed",
            crate::models::RequestStatus::Archived => "archived",
        };

        let mut text = format!(
            "# {}\n\nID: {}\nStatus: {}\nCreated: {}\n\n## Body\n\n{}\n",
            req.title, req.id, status_str, req.created_at, req.body
        );

        if let Some(ref analysis) = req.analysis {
            text.push_str(&format!("\n## Analysis\n\n{}\n", analysis));
        }

        if let Some(ref duplicate_of) = req.duplicate_of {
            text.push_str(&format!("\n## Duplicate Of\n\n{}\n", duplicate_of));
        }

        if let Some(ref impact_analysis) = req.impact_analysis {
            text.push_str(&format!(
                "\n## Impact Analysis\n\n```json\n{}\n```\n",
                serde_json::to_string_pretty(impact_analysis).unwrap_or_default()
            ));
        }

        if !linked_req_ids.is_empty() {
            text.push_str("\n## Linked Requirements\n\n");
            for (rid,) in &linked_req_ids {
                text.push_str(&format!("- {}\n", rid));
            }
        }

        Ok(CallToolResult::success(vec![Content::text(text)]))
    }

    #[tool(
        description = "Update a request's title, body, status, or analysis. Status transitions: pending→analyzing/archived, analyzing→decomposed/pending/archived, decomposed→archived/pending, archived→pending."
    )]
    async fn update_request(
        &self,
        Parameters(params): Parameters<UpdateRequestParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let session_id = self.state.lock().ok().and_then(|s| s.session_id);

        let id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid request ID",
                )]))
            }
        };

        let current = match sqlx::query_as::<_, crate::models::Request>(
            "SELECT * FROM requests WHERE id = $1 AND project_id = $2",
        )
        .bind(id)
        .bind(project_id)
        .fetch_optional(&self.db)
        .await
        {
            Ok(Some(r)) => r,
            Ok(None) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Request not found",
                )]))
            }
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Failed: {e}"
                ))]))
            }
        };

        // Validate status transition
        if let Some(ref new_status) = params.status {
            let valid = matches!(
                (current.status, new_status.as_str()),
                (
                    crate::models::RequestStatus::Pending,
                    "analyzing" | "archived"
                ) | (
                    crate::models::RequestStatus::Analyzing,
                    "decomposed" | "pending" | "archived"
                ) | (
                    crate::models::RequestStatus::Decomposed,
                    "archived" | "pending"
                ) | (crate::models::RequestStatus::Archived, "pending")
            );
            if !valid {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Invalid status transition from {:?} to {}",
                    current.status, new_status
                ))]));
            }
        }

        let has_updates = params.title.is_some()
            || params.body.is_some()
            || params.status.is_some()
            || params.analysis.is_some();

        if !has_updates {
            return Ok(CallToolResult::success(vec![Content::text(
                "No changes provided",
            )]));
        }

        let mut set_clauses = vec!["updated_at = NOW()".to_string()];
        let mut bind_idx = 3u32;

        if params.title.is_some() {
            set_clauses.push(format!("title = ${bind_idx}"));
            bind_idx += 1;
        }
        if params.body.is_some() {
            set_clauses.push(format!("body = ${bind_idx}"));
            bind_idx += 1;
        }
        if params.status.is_some() {
            set_clauses.push(format!("status = ${bind_idx}"));
            bind_idx += 1;
        }
        if params.analysis.is_some() {
            set_clauses.push(format!("analysis = ${bind_idx}"));
        }

        let query = format!(
            "UPDATE requests SET {} WHERE id = $1 AND project_id = $2 RETURNING *",
            set_clauses.join(", ")
        );

        let mut q = sqlx::query_as::<_, crate::models::Request>(&query)
            .bind(id)
            .bind(project_id);

        if let Some(ref title) = params.title {
            q = q.bind(title);
        }
        if let Some(ref body) = params.body {
            q = q.bind(body);
        }
        if let Some(ref status) = params.status {
            q = q.bind(status);
        }
        if let Some(ref analysis) = params.analysis {
            q = q.bind(analysis);
        }

        match q.fetch_one(&self.db).await {
            Ok(req) => {
                self.record_activity(
                    project_id,
                    session_id,
                    participant_id,
                    "request_updated",
                    "request",
                    req.id,
                    &format!("updated request: {}", req.title),
                    serde_json::json!({"title": req.title, "status": params.status}),
                )
                .await;

                Ok(CallToolResult::success(vec![Content::text(format!(
                    "Updated request '{}' (id: {})",
                    req.title, req.id
                ))]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed to update request: {e}"
            ))])),
        }
    }

    #[tool(
        description = "Link a requirement to a request, indicating this requirement was created to satisfy the request."
    )]
    async fn link_request_requirement(
        &self,
        Parameters(params): Parameters<LinkRequestRequirementParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let request_id = match Uuid::parse_str(&params.request_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid request_id",
                )]))
            }
        };
        let requirement_id = match Uuid::parse_str(&params.requirement_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid requirement_id",
                )]))
            }
        };

        // Verify both entities belong to this project
        let req_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM requests WHERE id = $1 AND project_id = $2)",
        )
        .bind(request_id)
        .bind(project_id)
        .fetch_one(&self.db)
        .await
        .unwrap_or(false);

        let requirement_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM requirements WHERE id = $1 AND project_id = $2)",
        )
        .bind(requirement_id)
        .bind(project_id)
        .fetch_one(&self.db)
        .await
        .unwrap_or(false);

        if !req_exists || !requirement_exists {
            return Ok(CallToolResult::error(vec![Content::text(
                "Request or requirement not found in this project",
            )]));
        }

        match sqlx::query(
            "INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(request_id)
        .bind(requirement_id)
        .execute(&self.db)
        .await
        {
            Ok(_) => Ok(CallToolResult::success(vec![Content::text(
                "Requirement linked to request",
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed: {e}"
            ))])),
        }
    }

    #[tool(description = "Unlink a requirement from a request.")]
    async fn unlink_request_requirement(
        &self,
        Parameters(params): Parameters<UnlinkRequestRequirementParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let request_id = match Uuid::parse_str(&params.request_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid request_id",
                )]))
            }
        };
        let requirement_id = match Uuid::parse_str(&params.requirement_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid requirement_id",
                )]))
            }
        };

        // Only delete if both entities belong to this project
        match sqlx::query(
            "DELETE FROM request_requirements WHERE request_id = $1 AND requirement_id = $2
             AND EXISTS (SELECT 1 FROM requests WHERE id = $1 AND project_id = $3)
             AND EXISTS (SELECT 1 FROM requirements WHERE id = $2 AND project_id = $3)",
        )
        .bind(request_id)
        .bind(requirement_id)
        .bind(project_id)
        .execute(&self.db)
        .await
        {
            Ok(result) if result.rows_affected() == 0 => {
                Ok(CallToolResult::error(vec![Content::text("Link not found")]))
            }
            Ok(_) => Ok(CallToolResult::success(vec![Content::text(
                "Requirement unlinked from request",
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed: {e}"
            ))])),
        }
    }

    #[tool(
        description = "Check for directed messages sent to you by humans in the session. Returns messages in chronological order."
    )]
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

        let rows: Vec<(Uuid, Uuid, String, String, chrono::DateTime<Utc>)> =
            match sqlx::query_as(query)
                .bind(session_id)
                .bind(participant_id)
                .bind(limit)
                .fetch_all(&self.db)
                .await
            {
                Ok(r) => r,
                Err(e) => {
                    return Ok(CallToolResult::error(vec![Content::text(format!(
                        "Failed: {e}"
                    ))]))
                }
            };

        if rows.is_empty() {
            return Ok(CallToolResult::success(vec![Content::text("No messages.")]));
        }

        // Mark messages as read
        let msg_ids: Vec<Uuid> = rows.iter().map(|r| r.0).collect();
        let _ = sqlx::query("UPDATE messages SET read_at = now() WHERE id = ANY($1)")
            .bind(&msg_ids)
            .execute(&self.db)
            .await;

        let items: Vec<serde_json::Value> = rows
            .into_iter()
            .map(|(id, sender_id, sender_name, content, created_at)| {
                serde_json::json!({
                    "id": id,
                    "from_id": sender_id,
                    "from": sender_name,
                    "content": content,
                    "created_at": created_at.to_rfc3339(),
                })
            })
            .collect();

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
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid recipient_id",
                )]))
            }
        };

        if params.content.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Message content cannot be empty",
            )]));
        }

        match sqlx::query_as::<_, (Uuid, chrono::DateTime<Utc>)>(
            "INSERT INTO messages (session_id, sender_id, recipient_id, content)
             VALUES ($1, $2, $3, $4)
             RETURNING id, created_at",
        )
        .bind(session_id)
        .bind(participant_id)
        .bind(recipient_id)
        .bind(&params.content)
        .fetch_one(&self.db)
        .await
        {
            Ok((id, created_at)) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&serde_json::json!({
                    "id": id,
                    "status": "sent",
                    "created_at": created_at.to_rfc3339(),
                }))
                .unwrap(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed to send: {e}"
            ))])),
        }
    }

    #[tool(
        description = "Search the project knowledge base using full-text search. Returns relevant knowledge chunks (task descriptions, plan content, comments) ranked by relevance."
    )]
    async fn search_knowledge(
        &self,
        Parameters(params): Parameters<SearchKnowledgeParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let org_id =
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT org_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_one(&self.db)
                .await
                .map_err(|_| McpError::internal_error("Failed to look up project", None))?;

        let limit = params.limit.unwrap_or(10).clamp(1, 50);

        // project_wide=true searches the entire org; default is current-project only
        let search_project_id = if params.project_wide.unwrap_or(false) {
            None
        } else {
            Some(project_id)
        };

        let mut results = match knowledge::search_fts_only(
            &self.db,
            org_id,
            search_project_id,
            &params.query,
            limit * 5,
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Search failed: {e}"
                ))]))
            }
        };

        // Post-filter by content_type if specified
        if let Some(ref ct) = params.content_type {
            results.retain(|r| r.content_type == *ct);
        }

        results.truncate(limit as usize);

        let output: Vec<serde_json::Value> = results
            .into_iter()
            .map(|r| {
                let raw_snippet: String = r.chunk_text.chars().take(500).collect();
                // XML-delimit the snippet to establish a trust boundary and prevent
                // prompt injection from user-authored content being treated as instructions.
                let snippet = format!(
                    r#"<knowledge_result source_id="{}" content_type="{}" score="{:.4}">{}</knowledge_result>"#,
                    r.source_id, r.content_type, r.score, raw_snippet
                );
                serde_json::json!({
                    "id": r.id,
                    "content_type": r.content_type,
                    "source_id": r.source_id,
                    "snippet": snippet,
                    "score": r.score,
                    "metadata": r.metadata,
                })
            })
            .collect();

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&output).unwrap_or_default(),
        )]))
    }

    #[tool(
        description = "Retrieve the full knowledge base content for a specific source entity (task, plan, etc.) by its ID. Returns all indexed chunks with their full text."
    )]
    async fn get_knowledge_detail(
        &self,
        Parameters(params): Parameters<GetKnowledgeDetailParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let source_id = match Uuid::parse_str(&params.source_id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid source_id: must be a UUID",
                )]))
            }
        };

        let org_id =
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT org_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_one(&self.db)
                .await
                .map_err(|_| McpError::internal_error("Failed to look up project", None))?;

        #[derive(sqlx::FromRow)]
        struct ChunkRow {
            id: Uuid,
            chunk_text: String,
            source_field: Option<String>,
            content_type: String,
            metadata: serde_json::Value,
            created_at: chrono::DateTime<Utc>,
        }

        let chunks = sqlx::query_as::<_, ChunkRow>(
            "SELECT id, chunk_text, source_field, content_type, metadata, created_at
             FROM knowledge_chunks
             WHERE source_id = $1 AND org_id = $2
               AND ($3::uuid IS NULL OR project_id = $3)
             ORDER BY source_field",
        )
        .bind(source_id)
        .bind(org_id)
        .bind(project_id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Database error: {e}"), None))?;

        if chunks.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "No knowledge chunks found for this source_id",
            )]));
        }

        let content_type = chunks[0].content_type.clone();
        let sections: Vec<serde_json::Value> = chunks
            .iter()
            .map(|c| {
                // XML-delimit chunk text to establish a trust boundary and prevent
                // prompt injection from user-authored content being treated as instructions.
                let text = format!(
                    r#"<knowledge_chunk source_field="{}" content_type="{}">{}</knowledge_chunk>"#,
                    c.source_field.as_deref().unwrap_or(""),
                    c.content_type,
                    c.chunk_text
                );
                serde_json::json!({
                    "id": c.id,
                    "source_field": c.source_field,
                    "text": text,
                    "metadata": c.metadata,
                    "created_at": c.created_at.to_rfc3339(),
                })
            })
            .collect();

        let output = serde_json::json!({
            "source_id": source_id,
            "content_type": content_type,
            "chunks": sections,
        });

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&output).unwrap_or_default(),
        )]))
    }

    #[tool(
        description = "Search source code in the project repository. Returns matching files with relevant snippets. Useful for finding function definitions, usages, patterns, or any code construct."
    )]
    async fn search_code(
        &self,
        Parameters(params): Parameters<SearchCodeParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let code_index = match &self.code_index {
            Some(idx) => idx,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Code search is not available (index not initialized)",
                )]));
            }
        };

        let org_id =
            sqlx::query_scalar::<_, uuid::Uuid>("SELECT org_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_one(&self.db)
                .await
                .map_err(|_| McpError::internal_error("Failed to look up project", None))?;

        let limit = params.limit.unwrap_or(10).clamp(1, 30) as usize;
        // Fetch more to allow post-filtering by language
        let fetch_limit = if params.language.is_some() {
            limit * 3
        } else {
            limit
        };

        let mut results =
            match code_index.search(org_id, Some(project_id), &params.query, fetch_limit) {
                Ok(r) => r,
                Err(e) => {
                    return Ok(CallToolResult::error(vec![Content::text(format!(
                        "Search failed: {e}"
                    ))]));
                }
            };

        // Post-filter by language if specified
        if let Some(ref lang) = params.language {
            results.retain(|r| r.language.eq_ignore_ascii_case(lang));
        }

        results.truncate(limit);

        if results.is_empty() {
            return Ok(CallToolResult::success(vec![Content::text(
                "No code results found for your query.",
            )]));
        }

        let output = results
            .iter()
            .map(|r| {
                format!(
                    "<code_result path=\"{}\" language=\"{}\" score=\"{:.2}\">\n{}\n</code_result>",
                    r.path, r.language, r.score, r.snippet,
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        Ok(CallToolResult::success(vec![Content::text(output)]))
    }

    #[tool(description = "List design plans/documents for the current project.")]
    async fn list_plans(
        &self,
        Parameters(params): Parameters<ListPlansParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let limit = params.limit.unwrap_or(20).min(100);

        let plans: Vec<Plan> = sqlx::query_as(
            "SELECT * FROM plans WHERE project_id = $1 ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(project_id)
        .bind(limit)
        .fetch_all(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Failed to list plans: {e}"), None))?;

        let result: Vec<serde_json::Value> = plans
            .into_iter()
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "title": p.title,
                    "slug": p.slug,
                    "status": p.status,
                    "content_length": p.body.len(),
                    "updated_at": p.updated_at,
                    "created_at": p.created_at,
                })
            })
            .collect();

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(description = "Get full details of a design plan including its content.")]
    async fn get_plan(
        &self,
        Parameters(params): Parameters<GetPlanParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let plan_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid plan ID UUID",
                )]))
            }
        };

        let plan: Option<Plan> =
            sqlx::query_as("SELECT * FROM plans WHERE id = $1 AND project_id = $2")
                .bind(plan_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| McpError::internal_error(format!("Failed to get plan: {e}"), None))?;

        match plan {
            None => Ok(CallToolResult::error(vec![Content::text(
                "Plan not found or does not belong to the current project",
            )])),
            Some(p) => {
                let result = serde_json::json!({
                    "id": p.id,
                    "project_id": p.project_id,
                    "title": p.title,
                    "slug": p.slug,
                    "content": p.body,
                    "status": p.status,
                    "parent_id": p.parent_id,
                    "created_at": p.created_at,
                    "updated_at": p.updated_at,
                });
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
        }
    }

    #[tool(description = "Create a new design plan/document for the project.")]
    async fn create_plan(
        &self,
        Parameters(params): Parameters<CreatePlanParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        if params.title.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Title cannot be empty",
            )]));
        }

        // Generate slug from title
        let slug = params
            .title
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");

        let plan: Plan = sqlx::query_as(
            "INSERT INTO plans (project_id, author_id, title, slug, body)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *",
        )
        .bind(project_id)
        .bind(participant_id)
        .bind(&params.title)
        .bind(&slug)
        .bind(&params.content)
        .fetch_one(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Failed to create plan: {e}"), None))?;

        // Emit domain event
        let event = crate::events::DomainEvent::new(
            "plan.created",
            "plan",
            plan.id,
            Some(participant_id),
            serde_json::json!({
                "project_id": project_id,
                "title": plan.title,
                "slug": plan.slug,
            }),
        );
        if let Err(e) = crate::events::emit(&self.db, &event).await {
            tracing::warn!("Failed to emit plan_created domain event: {e}");
        }

        let result = serde_json::json!({
            "id": plan.id,
            "title": plan.title,
            "slug": plan.slug,
            "status": plan.status,
            "created_at": plan.created_at,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(description = "Update an existing design plan's title or content.")]
    async fn update_plan(
        &self,
        Parameters(params): Parameters<UpdatePlanParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let plan_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid plan ID UUID",
                )]))
            }
        };

        // Verify plan belongs to this project
        let current: Option<Plan> =
            sqlx::query_as("SELECT * FROM plans WHERE id = $1 AND project_id = $2")
                .bind(plan_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to fetch plan: {e}"), None)
                })?;

        let current = match current {
            Some(p) => p,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Plan not found or does not belong to the current project",
                )]))
            }
        };

        let has_updates = params.title.is_some() || params.content.is_some();
        let plan = if has_updates {
            let mut set_clauses = vec!["updated_at = NOW()".to_string()];
            let mut bind_idx = 3u32; // $1 = plan_id, $2 = project_id

            if params.title.is_some() {
                set_clauses.push(format!("title = ${bind_idx}"));
                bind_idx += 1;
            }
            if params.content.is_some() {
                set_clauses.push(format!("body = ${bind_idx}"));
            }

            let sql = format!(
                "UPDATE plans SET {} WHERE id = $1 AND project_id = $2 RETURNING *",
                set_clauses.join(", ")
            );

            let mut q = sqlx::query_as::<_, Plan>(&sql)
                .bind(plan_id)
                .bind(project_id);

            if let Some(ref title) = params.title {
                q = q.bind(title);
            }
            if let Some(ref content) = params.content {
                q = q.bind(content);
            }

            q.fetch_one(&self.db).await.map_err(|e| {
                McpError::internal_error(format!("Failed to update plan: {e}"), None)
            })?
        } else {
            current
        };

        // Emit domain event
        let event = crate::events::DomainEvent::new(
            "plan.updated",
            "plan",
            plan.id,
            Some(participant_id),
            serde_json::json!({
                "project_id": project_id,
                "title": plan.title,
                "slug": plan.slug,
            }),
        );
        if let Err(e) = crate::events::emit(&self.db, &event).await {
            tracing::warn!("Failed to emit plan_updated domain event: {e}");
        }

        let result = serde_json::json!({
            "id": plan.id,
            "title": plan.title,
            "slug": plan.slug,
            "content": plan.body,
            "status": plan.status,
            "updated_at": plan.updated_at,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "List invocations (claude -p agent runs) for the current project, optionally filtered by status or workspace."
    )]
    async fn list_invocations(
        &self,
        Parameters(params): Parameters<ListInvocationsParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let limit = params.limit.unwrap_or(20).min(100);

        let workspace_id = match params.workspace_id {
            Some(ref s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid workspace_id: must be a UUID",
                    )]))
                }
            },
            None => None,
        };

        let invocations: Vec<crate::models::Invocation> = sqlx::query_as(
            "SELECT * FROM invocations
             WHERE project_id = $1
               AND ($2::text IS NULL OR status = $2)
               AND ($3::uuid IS NULL OR workspace_id = $3)
             ORDER BY created_at DESC
             LIMIT $4",
        )
        .bind(project_id)
        .bind(&params.status)
        .bind(workspace_id)
        .bind(limit)
        .fetch_all(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Failed to list invocations: {e}"), None))?;

        let items: Vec<serde_json::Value> = invocations
            .into_iter()
            .map(|inv| {
                let prompt_preview = if inv.prompt.len() > 100 {
                    format!("{}...", &inv.prompt[..100])
                } else {
                    inv.prompt.clone()
                };
                serde_json::json!({
                    "id": inv.id,
                    "status": inv.status,
                    "agent_perspective": inv.agent_perspective,
                    "prompt": prompt_preview,
                    "workspace_id": inv.workspace_id,
                    "task_id": inv.task_id,
                    "created_at": inv.created_at,
                    "completed_at": inv.completed_at,
                    "error_category": inv.error_category,
                    "model_used": inv.model_used,
                    "cost_usd": inv.cost_usd,
                })
            })
            .collect();

        let result = serde_json::json!({
            "count": items.len(),
            "invocations": items,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "Get full details of a specific invocation including its output and result JSON."
    )]
    async fn get_invocation(
        &self,
        Parameters(params): Parameters<GetInvocationParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let invocation_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid invocation ID: must be a UUID",
                )]))
            }
        };

        let inv: Option<crate::models::Invocation> =
            sqlx::query_as("SELECT * FROM invocations WHERE id = $1 AND project_id = $2")
                .bind(invocation_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to fetch invocation: {e}"), None)
                })?;

        let inv = match inv {
            Some(i) => i,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invocation not found or does not belong to this project",
                )]))
            }
        };

        let result = serde_json::json!({
            "id": inv.id,
            "workspace_id": inv.workspace_id,
            "project_id": inv.project_id,
            "session_id": inv.session_id,
            "task_id": inv.task_id,
            "participant_id": inv.participant_id,
            "agent_perspective": inv.agent_perspective,
            "prompt": inv.prompt,
            "system_prompt_append": inv.system_prompt_append,
            "status": inv.status,
            "exit_code": inv.exit_code,
            "error_message": inv.error_message,
            "error_category": inv.error_category,
            "triggered_by": inv.triggered_by,
            "started_at": inv.started_at,
            "completed_at": inv.completed_at,
            "created_at": inv.created_at,
            "claude_session_id": inv.claude_session_id,
            "resume_session_id": inv.resume_session_id,
            "model_hint": inv.model_hint,
            "budget_tier": inv.budget_tier,
            "provider": inv.provider,
            "model_used": inv.model_used,
            "input_tokens": inv.input_tokens,
            "output_tokens": inv.output_tokens,
            "cost_usd": inv.cost_usd,
            "result_json": inv.result_json,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "Create and dispatch a new agent invocation (claude -p) in the project. The agent runs asynchronously in a Coder workspace."
    )]
    async fn create_invocation(
        &self,
        Parameters(params): Parameters<CreateInvocationParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        if params.prompt.trim().is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Prompt cannot be empty",
            )]));
        }

        let agent_perspective = params
            .agent_perspective
            .unwrap_or_else(|| "coder".to_string());

        let task_id = match params.task_id {
            Some(ref s) => match Uuid::parse_str(s) {
                Ok(id) => Some(id),
                Err(_) => {
                    return Ok(CallToolResult::error(vec![Content::text(
                        "Invalid task_id: must be a UUID",
                    )]))
                }
            },
            None => None,
        };

        // Auto-generate branch name from task when no branch specified
        let effective_branch = match &params.branch {
            Some(b) if !b.is_empty() => Some(b.clone()),
            _ => {
                if let Some(tid) = task_id {
                    // Generate branch from task
                    let row: Option<(String, String)> =
                        sqlx::query_as("SELECT ticket_id, title FROM tasks WHERE id = $1")
                            .bind(tid)
                            .fetch_optional(&self.db)
                            .await
                            .ok()
                            .flatten();
                    if let Some((ticket_id, title)) = row {
                        let raw_slug: String = title
                            .to_lowercase()
                            .chars()
                            .map(|c| if c.is_alphanumeric() { c } else { '-' })
                            .collect();
                        let slug = raw_slug
                            .split('-')
                            .filter(|s| !s.is_empty())
                            .collect::<Vec<_>>()
                            .join("-");
                        let slug = if slug.len() > 40 {
                            slug[..40].trim_end_matches('-').to_string()
                        } else {
                            slug
                        };
                        Some(format!("agent/{}-{}", ticket_id, slug))
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
        };

        // Look up the sponsor user id from the participant record (for workspace
        // credential injection).  This is a fast DB lookup done synchronously so we
        // can capture the result before spawning the background task.
        let sponsor_user_id: Uuid = {
            let participant_id = self.state.lock().ok().and_then(|s| s.participant_id);
            match participant_id {
                Some(pid) => {
                    let row: Option<(Uuid,)> =
                        sqlx::query_as("SELECT user_id FROM participants WHERE id = $1")
                            .bind(pid)
                            .fetch_optional(&self.db)
                            .await
                            .ok()
                            .flatten();
                    row.map(|(uid,)| uid).unwrap_or_else(Uuid::new_v4)
                }
                None => Uuid::new_v4(),
            }
        };

        // Resolve model config
        let (effective_model_hint, effective_budget_tier, effective_provider) =
            crate::dispatch::resolve_model_config(
                &self.db,
                project_id,
                None,
                task_id,
                params.model_hint.as_deref(),
                params.budget_tier.as_deref(),
                params.provider.as_deref(),
            )
            .await;

        // Append push instructions when a branch is specified
        let effective_prompt = if let Some(branch) = &effective_branch {
            format!(
                "{}\n\nWhen you are done with your changes, commit, push, and create a pull request:\n\
                 ```\n\
                 git add -A\n\
                 git commit -m \"<descriptive message>\"\n\
                 git push -u origin {branch}\n\
                 gh pr create --title \"<PR title>\" --body \"<summary of changes>\" --base main\n\
                 ```\n\
                 If `gh` is not available or PR creation fails, that's OK — the push is what matters.",
                params.prompt
            )
        } else {
            params.prompt.clone()
        };

        let session_id = self.get_session_id();

        // Insert with workspace_id = NULL (pending).  The background task will
        // resolve the workspace and then dispatch.
        let inv: crate::models::Invocation = sqlx::query_as(
            "INSERT INTO invocations
                (workspace_id, project_id, session_id, task_id,
                 agent_perspective, prompt, system_prompt_append, triggered_by,
                 resume_session_id, model_hint, budget_tier, provider)
             VALUES (NULL, $1, $2, $3, $4, $5, $6, 'agent', $7, $8, $9, $10)
             RETURNING *",
        )
        .bind(project_id)
        .bind(session_id)
        .bind(task_id)
        .bind(&agent_perspective)
        .bind(&effective_prompt)
        .bind(&params.system_prompt_append)
        .bind(&params.resume_session_id)
        .bind(&effective_model_hint)
        .bind(&effective_budget_tier)
        .bind(&effective_provider)
        .fetch_one(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Failed to create invocation: {e}"), None))?;

        tracing::info!(
            invocation_id = %inv.id,
            perspective = %inv.agent_perspective,
            task_id = ?inv.task_id,
            "MCP: Invocation created by agent (pending workspace resolution)"
        );

        // Background task: resolve workspace then dispatch.
        let dispatch_db = self.db.clone();
        let dispatch_connections = self.connections.clone();
        let dispatch_log_buffer = self.log_buffer.clone();
        let invocation_id = inv.id;
        let dispatch_branch = effective_branch.clone();

        tokio::spawn(async move {
            // Phase 1: resolve workspace
            let ws_result = crate::dispatch::resolve_workspace(
                &dispatch_db,
                project_id,
                dispatch_branch.as_deref(),
                sponsor_user_id,
            )
            .await;

            let workspace_id = match ws_result {
                Ok(ws_id) => {
                    // Stamp workspace_id on the record.
                    if let Err(e) = sqlx::query(
                        "UPDATE invocations SET workspace_id = $2, updated_at = NOW()
                         WHERE id = $1 AND status = 'pending'",
                    )
                    .bind(invocation_id)
                    .bind(ws_id)
                    .execute(&dispatch_db)
                    .await
                    {
                        tracing::error!(
                            invocation_id = %invocation_id,
                            error = %e,
                            "MCP: failed to set workspace_id on invocation"
                        );
                        let _ = sqlx::query(
                            "UPDATE invocations SET status = 'failed', \
                             error_message = $2, error_category = 'system_error', \
                             completed_at = NOW(), updated_at = NOW() \
                             WHERE id = $1 AND status = 'pending'",
                        )
                        .bind(invocation_id)
                        .bind(format!("Failed to persist workspace_id: {e}"))
                        .execute(&dispatch_db)
                        .await;
                        return;
                    }
                    ws_id
                }
                Err(e) => {
                    tracing::error!(
                        invocation_id = %invocation_id,
                        error = %e,
                        "MCP: workspace resolution failed"
                    );
                    let _ = sqlx::query(
                        "UPDATE invocations SET status = 'failed', \
                         error_message = $2, error_category = 'workspace_error', \
                         completed_at = NOW(), updated_at = NOW() \
                         WHERE id = $1 AND status = 'pending'",
                    )
                    .bind(invocation_id)
                    .bind(format!("Workspace resolution failed: {e}"))
                    .execute(&dispatch_db)
                    .await;
                    return;
                }
            };

            tracing::info!(
                invocation_id = %invocation_id,
                workspace_id = %workspace_id,
                "MCP: dispatching invocation"
            );

            // Phase 2: dispatch
            if let (Some(connections), Some(log_buffer)) =
                (dispatch_connections, dispatch_log_buffer)
            {
                if let Err(e) = crate::dispatch::dispatch_invocation(
                    &dispatch_db,
                    &log_buffer,
                    &connections,
                    invocation_id,
                )
                .await
                {
                    tracing::error!(invocation_id = %invocation_id, "MCP: dispatch failed: {e}");
                    let _ = sqlx::query(
                        "UPDATE invocations SET status = 'failed', \
                         error_message = $2, error_category = 'system_error', \
                         completed_at = NOW(), updated_at = NOW() \
                         WHERE id = $1 AND status = 'running'",
                    )
                    .bind(invocation_id)
                    .bind(format!("Dispatch error: {e}"))
                    .execute(&dispatch_db)
                    .await;
                }
            } else {
                tracing::warn!(
                    invocation_id = %invocation_id,
                    "MCP: dispatch skipped: connections or log_buffer not available"
                );
                let _ = sqlx::query(
                    "UPDATE invocations SET status = 'failed', \
                     error_message = $2, error_category = 'system_error', \
                     completed_at = NOW(), updated_at = NOW() \
                     WHERE id = $1 AND status = 'pending'",
                )
                .bind(invocation_id)
                .bind("Dispatch infrastructure not available")
                .execute(&dispatch_db)
                .await;
            }
        });

        let result = serde_json::json!({
            "id": inv.id,
            "workspace_id": inv.workspace_id,
            "project_id": inv.project_id,
            "session_id": inv.session_id,
            "task_id": inv.task_id,
            "agent_perspective": inv.agent_perspective,
            "prompt": inv.prompt,
            "status": inv.status,
            "created_at": inv.created_at,
            "model_hint": inv.model_hint,
            "budget_tier": inv.budget_tier,
            "provider": inv.provider,
            "resume_session_id": inv.resume_session_id,
            "message": "Invocation created and dispatched",
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "List Coder workspaces for the current project, optionally filtered by status."
    )]
    async fn list_workspaces(
        &self,
        Parameters(params): Parameters<ListWorkspacesParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let limit = params.limit.unwrap_or(20).min(100);

        let workspaces: Vec<crate::models::Workspace> = sqlx::query_as(
            "SELECT * FROM workspaces
             WHERE project_id = $1
               AND ($2::text IS NULL OR status = $2)
             ORDER BY created_at DESC
             LIMIT $3",
        )
        .bind(project_id)
        .bind(&params.status)
        .bind(limit)
        .fetch_all(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Failed to list workspaces: {e}"), None))?;

        let items: Vec<serde_json::Value> = workspaces
            .iter()
            .map(|w| {
                serde_json::json!({
                    "id": w.id,
                    "coder_workspace_name": w.coder_workspace_name,
                    "status": w.status,
                    "pool_key": w.pool_key,
                    "branch": w.branch,
                    "task_id": w.task_id,
                    "participant_id": w.participant_id,
                    "template_name": w.template_name,
                    "created_at": w.created_at,
                    "last_invocation_at": w.last_invocation_at,
                })
            })
            .collect();

        let result = serde_json::json!({
            "count": items.len(),
            "workspaces": items,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(description = "Get details of a specific Coder workspace by ID.")]
    async fn get_workspace(
        &self,
        Parameters(params): Parameters<GetWorkspaceParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let workspace_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid workspace ID: must be a UUID",
                )]))
            }
        };

        let w: Option<crate::models::Workspace> =
            sqlx::query_as("SELECT * FROM workspaces WHERE id = $1 AND project_id = $2")
                .bind(workspace_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to fetch workspace: {e}"), None)
                })?;

        let w = match w {
            Some(ws) => ws,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Workspace not found or does not belong to this project",
                )]))
            }
        };

        let result = serde_json::json!({
            "id": w.id,
            "coder_workspace_id": w.coder_workspace_id,
            "coder_workspace_name": w.coder_workspace_name,
            "status": w.status,
            "pool_key": w.pool_key,
            "branch": w.branch,
            "task_id": w.task_id,
            "participant_id": w.participant_id,
            "template_name": w.template_name,
            "error_message": w.error_message,
            "created_at": w.created_at,
            "updated_at": w.updated_at,
            "started_at": w.started_at,
            "stopped_at": w.stopped_at,
            "last_invocation_at": w.last_invocation_at,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(description = "Stop a running Coder workspace to free resources.")]
    async fn stop_workspace(
        &self,
        Parameters(params): Parameters<StopWorkspaceParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let workspace_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid workspace ID: must be a UUID",
                )]))
            }
        };

        let w: Option<crate::models::Workspace> =
            sqlx::query_as("SELECT * FROM workspaces WHERE id = $1 AND project_id = $2")
                .bind(workspace_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to fetch workspace: {e}"), None)
                })?;

        let w = match w {
            Some(ws) => ws,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Workspace not found or does not belong to this project",
                )]))
            }
        };

        if w.status != crate::models::WorkspaceStatus::Running {
            return Ok(CallToolResult::error(vec![Content::text(format!(
                "Workspace is not running (current status: {:?}). Only running workspaces can be stopped.",
                w.status
            ))]));
        }

        let coder_ws_id = match w.coder_workspace_id {
            Some(id) => id,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Workspace has no Coder ID — cannot stop",
                )]))
            }
        };

        // Build Coder client from environment (same pattern as routes/workspaces.rs)
        let coder_url = std::env::var("CODER_URL").unwrap_or_default();
        let coder_token = std::env::var("CODER_TOKEN").unwrap_or_default();
        if coder_url.is_empty() || coder_token.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Coder integration is not configured on this server",
            )]));
        }
        let client = crate::coder::CoderClient::new(coder_url, coder_token);

        // Mark as stopping
        let _ = sqlx::query(
            "UPDATE workspaces SET status = 'stopping', updated_at = NOW() WHERE id = $1",
        )
        .bind(workspace_id)
        .execute(&self.db)
        .await;

        match client.stop_workspace(coder_ws_id).await {
            Ok(_) => {
                sqlx::query(
                    "UPDATE workspaces SET status = 'stopped', stopped_at = NOW(), updated_at = NOW() WHERE id = $1",
                )
                .bind(workspace_id)
                .execute(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to update workspace status: {e}"), None)
                })?;

                let event = crate::events::DomainEvent::new(
                    "workspace.stopped",
                    "workspace",
                    workspace_id,
                    None,
                    serde_json::json!({ "coder_workspace_id": coder_ws_id }),
                );
                if let Err(e) = crate::events::emit(&self.db, &event).await {
                    tracing::warn!("Failed to emit workspace.stopped domain event: {e}");
                }

                let result = serde_json::json!({
                    "id": workspace_id,
                    "status": "stopped",
                    "message": "Workspace stopped successfully",
                });
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&result).unwrap(),
                )]))
            }
            Err(e) => {
                let error_message = format!("Failed to stop workspace: {e}");
                let _ = sqlx::query(
                    "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
                )
                .bind(workspace_id)
                .bind(&error_message)
                .execute(&self.db)
                .await;

                let event = crate::events::DomainEvent::new(
                    "workspace.failed",
                    "workspace",
                    workspace_id,
                    None,
                    serde_json::json!({ "error_message": error_message }),
                );
                if let Err(ev_err) = crate::events::emit(&self.db, &event).await {
                    tracing::warn!("Failed to emit workspace.failed domain event: {ev_err}");
                }

                Ok(CallToolResult::error(vec![Content::text(error_message)]))
            }
        }
    }

    #[tool(
        description = "Create a new Coder workspace for the current project. The workspace is provisioned asynchronously; use get_workspace to poll status."
    )]
    async fn create_workspace(
        &self,
        Parameters(params): Parameters<CreateWorkspaceParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let coder_url = std::env::var("CODER_URL").unwrap_or_default();
        let coder_token = std::env::var("CODER_TOKEN").unwrap_or_default();
        if coder_url.is_empty() || coder_token.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Coder integration is not configured on this server",
            )]));
        }

        let template_name = params
            .template_name
            .unwrap_or_else(|| "seam-agent".to_string());

        // Insert workspace record in pending state
        let workspace: crate::models::Workspace = sqlx::query_as(
            "INSERT INTO workspaces (project_id, template_name, branch, status)
             VALUES ($1, $2, $3, 'pending')
             RETURNING *",
        )
        .bind(project_id)
        .bind(&template_name)
        .bind(&params.branch)
        .fetch_one(&self.db)
        .await
        .map_err(|e| {
            McpError::internal_error(format!("Failed to create workspace record: {e}"), None)
        })?;

        // Emit workspace.requested event
        let event = crate::events::DomainEvent::new(
            "workspace.requested",
            "workspace",
            workspace.id,
            None,
            serde_json::json!({
                "template_name": template_name,
                "branch": params.branch,
                "project_id": project_id,
            }),
        );
        if let Err(e) = crate::events::emit(&self.db, &event).await {
            tracing::warn!("Failed to emit domain event: {e}");
        }

        // Resolve org_id for credential injection
        let org_id: Option<Uuid> =
            sqlx::query_as::<_, (Uuid,)>("SELECT org_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
                .ok()
                .flatten()
                .map(|(id,)| id);

        // Spawn async provisioning
        let ws_id = workspace.id;
        let db = self.db.clone();
        let branch_clone = params.branch.clone();
        let template_name_clone = template_name.clone();
        tokio::spawn(async move {
            let client = crate::coder::CoderClient::new(coder_url, coder_token);

            // Mark as creating
            let _ = sqlx::query(
                "UPDATE workspaces SET status = 'creating', updated_at = NOW() WHERE id = $1",
            )
            .bind(ws_id)
            .execute(&db)
            .await;

            // Resolve template
            let template = match client.get_template_by_name(&template_name_clone).await {
                Ok(Some(t)) => t,
                Ok(None) => {
                    let error_message =
                        format!("Template '{}' not found in Coder", template_name_clone);
                    let _ = sqlx::query(
                        "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
                    )
                    .bind(ws_id)
                    .bind(&error_message)
                    .execute(&db)
                    .await;
                    return;
                }
                Err(e) => {
                    let error_message = format!("Failed to resolve template: {e}");
                    let _ = sqlx::query(
                        "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
                    )
                    .bind(ws_id)
                    .bind(&error_message)
                    .execute(&db)
                    .await;
                    return;
                }
            };

            let ws_name = format!("seam-{}", &ws_id.to_string()[..8]);
            let mut rich_params = Vec::new();
            if let Some(b) = branch_clone.as_deref() {
                rich_params.push(crate::coder::RichParameterValue {
                    name: "branch".to_string(),
                    value: b.to_string(),
                });
            }

            // Inject org credentials if available
            if let Some(oid) = org_id {
                // Use a placeholder user_id (nil) — MCP agents don't have a user record
                match crate::credentials::credentials_for_workspace(&db, oid, Uuid::nil()).await {
                    Ok(creds) if !creds.is_empty() => {
                        let creds_map: serde_json::Map<String, serde_json::Value> = creds
                            .into_iter()
                            .map(|(k, v)| (k, serde_json::Value::String(v)))
                            .collect();
                        rich_params.push(crate::coder::RichParameterValue {
                            name: "credentials_json".to_string(),
                            value: serde_json::Value::Object(creds_map).to_string(),
                        });
                    }
                    _ => {}
                }
            }

            let req = crate::coder::CreateWorkspaceRequest {
                name: ws_name,
                template_id: template.id,
                rich_parameter_values: rich_params,
            };

            match client.create_workspace("me", req).await {
                Ok(coder_ws) => {
                    let _ = sqlx::query(
                        "UPDATE workspaces SET
                            coder_workspace_id = $2,
                            coder_workspace_name = $3,
                            status = 'running',
                            started_at = NOW(),
                            updated_at = NOW()
                         WHERE id = $1",
                    )
                    .bind(ws_id)
                    .bind(coder_ws.id)
                    .bind(&coder_ws.name)
                    .execute(&db)
                    .await;

                    let event = crate::events::DomainEvent::new(
                        "workspace.running",
                        "workspace",
                        ws_id,
                        None,
                        serde_json::json!({ "coder_workspace_id": coder_ws.id }),
                    );
                    if let Err(e) = crate::events::emit(&db, &event).await {
                        tracing::warn!("Failed to emit workspace.running event: {e}");
                    }
                }
                Err(e) => {
                    let error_message = format!("Coder workspace creation failed: {e}");
                    let _ = sqlx::query(
                        "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
                    )
                    .bind(ws_id)
                    .bind(&error_message)
                    .execute(&db)
                    .await;
                }
            }
        });

        let result = serde_json::json!({
            "id": workspace.id,
            "status": "pending",
            "template_name": template_name,
            "branch": params.branch,
            "message": "Workspace creation started. Use get_workspace to poll status.",
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "Destroy a Coder workspace, stopping it in Coder and marking it destroyed in the database."
    )]
    async fn destroy_workspace(
        &self,
        Parameters(params): Parameters<DestroyWorkspaceParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let workspace_id = match Uuid::parse_str(&params.id) {
            Ok(id) => id,
            Err(_) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid workspace ID: must be a UUID",
                )]))
            }
        };

        let w: Option<crate::models::Workspace> =
            sqlx::query_as("SELECT * FROM workspaces WHERE id = $1 AND project_id = $2")
                .bind(workspace_id)
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to fetch workspace: {e}"), None)
                })?;

        let w = match w {
            Some(ws) => ws,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Workspace not found or does not belong to this project",
                )]))
            }
        };

        if w.status == crate::models::WorkspaceStatus::Destroyed {
            return Ok(CallToolResult::error(vec![Content::text(
                "Workspace is already destroyed",
            )]));
        }

        let coder_url = std::env::var("CODER_URL").unwrap_or_default();
        let coder_token = std::env::var("CODER_TOKEN").unwrap_or_default();
        if coder_url.is_empty() || coder_token.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Coder integration is not configured on this server",
            )]));
        }
        let client = crate::coder::CoderClient::new(coder_url, coder_token);

        // Delete from Coder if it was created there
        if let Some(coder_ws_id) = w.coder_workspace_id {
            if let Err(e) = client.delete_workspace(coder_ws_id).await {
                tracing::warn!("Failed to delete Coder workspace (may already be gone): {e}");
            }
        }

        // Mark as destroyed
        sqlx::query(
            "UPDATE workspaces SET status = 'destroyed', stopped_at = NOW(), updated_at = NOW() WHERE id = $1",
        )
        .bind(workspace_id)
        .execute(&self.db)
        .await
        .map_err(|e| {
            McpError::internal_error(format!("Failed to update workspace status: {e}"), None)
        })?;

        let event = crate::events::DomainEvent::new(
            "workspace.destroyed",
            "workspace",
            workspace_id,
            None,
            serde_json::json!({ "coder_workspace_id": w.coder_workspace_id }),
        );
        if let Err(e) = crate::events::emit(&self.db, &event).await {
            tracing::warn!("Failed to emit workspace.destroyed domain event: {e}");
        }

        let result = serde_json::json!({
            "id": workspace_id,
            "status": "destroyed",
            "message": "Workspace destroyed successfully",
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "Check what credentials are available for the current project's org and your user. Returns credential types and tier (org vs user) — never the values themselves."
    )]
    async fn check_credentials(
        &self,
        Parameters(params): Parameters<CheckCredentialsParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        // Resolve org_id from project
        let org_id: Option<Uuid> =
            sqlx::query_as::<_, (Uuid,)>("SELECT org_id FROM projects WHERE id = $1")
                .bind(project_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to fetch project: {e}"), None)
                })?
                .map(|(id,)| id);

        let org_id = match org_id {
            Some(id) => id,
            None => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Project not found",
                )]))
            }
        };

        // Query org credentials (metadata only)
        let org_rows: Vec<(String, Option<String>)> = sqlx::query_as(
            "SELECT credential_type, env_var_name FROM org_credentials
             WHERE org_id = $1
               AND ($2::text IS NULL OR credential_type = $2)
             ORDER BY credential_type",
        )
        .bind(org_id)
        .bind(&params.credential_type)
        .fetch_all(&self.db)
        .await
        .map_err(|e| {
            McpError::internal_error(format!("Failed to list org credentials: {e}"), None)
        })?;

        // Query user credentials via sponsor_id on the participant
        let participant_id = self.state.lock().ok().and_then(|s| s.participant_id);
        let user_rows: Vec<(String, Option<String>)> = if let Some(pid) = participant_id {
            sqlx::query_as(
                "SELECT uc.credential_type, uc.env_var_name
                 FROM user_credentials uc
                 JOIN participants p ON p.sponsor_id = uc.user_id
                 WHERE p.id = $1
                   AND ($2::text IS NULL OR uc.credential_type = $2)
                 ORDER BY uc.credential_type",
            )
            .bind(pid)
            .bind(&params.credential_type)
            .fetch_all(&self.db)
            .await
            .unwrap_or_default()
        } else {
            vec![]
        };

        let org_list: Vec<serde_json::Value> = org_rows
            .iter()
            .map(|(ctype, env_var)| {
                serde_json::json!({
                    "credential_type": ctype,
                    "env_var_name": env_var,
                    "tier": "org",
                })
            })
            .collect();

        let user_list: Vec<serde_json::Value> = user_rows
            .iter()
            .map(|(ctype, env_var)| {
                serde_json::json!({
                    "credential_type": ctype,
                    "env_var_name": env_var,
                    "tier": "user",
                })
            })
            .collect();

        let result = serde_json::json!({
            "org_credentials": org_list,
            "user_credentials": user_list,
            "total": org_list.len() + user_list.len(),
            "note": "Values are never returned — only types and env var names are shown.",
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "Get project metrics summary including success rates, duration stats, and per-perspective/model breakdowns"
    )]
    async fn get_metrics_summary(
        &self,
        Parameters(params): Parameters<GetMetricsSummaryParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let period = params.period.as_deref().unwrap_or("24h");
        let interval = match period {
            "1h" => "1 hour",
            "24h" => "24 hours",
            "7d" => "7 days",
            "30d" => "30 days",
            _ => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid period. Use: 1h, 24h, 7d, or 30d",
                )]))
            }
        };

        // Overall counts and duration avg
        let totals: (i64, i64, i64, i64, Option<f64>) = sqlx::query_as(&format!(
            "SELECT
                 COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE status = 'completed' AND (exit_code = 0 OR exit_code IS NULL)) AS success_count,
                 COUNT(*) FILTER (WHERE status = 'failed' OR (status = 'completed' AND exit_code IS NOT NULL AND exit_code != 0)) AS failure_count,
                 COUNT(*) FILTER (WHERE status IN ('pending', 'running')) AS pending_count,
                 AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL) AS avg_duration_seconds
             FROM invocations
             WHERE project_id = $1
               AND created_at > NOW() - INTERVAL '{interval}'"
        ))
        .bind(project_id)
        .fetch_one(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Failed to aggregate invocation totals: {e}"), None))?;

        let (invocation_count, success_count, failure_count, pending_count, avg_duration) = totals;

        // Duration percentiles
        let percentiles: (Option<f64>, Option<f64>) = sqlx::query_as(&format!(
            "SELECT
                 PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))),
                 PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)))
             FROM invocations
             WHERE project_id = $1
               AND completed_at IS NOT NULL
               AND started_at IS NOT NULL
               AND created_at > NOW() - INTERVAL '{interval}'"
        ))
        .bind(project_id)
        .fetch_one(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Failed to compute duration percentiles: {e}"), None))?;

        let (p50, p95) = percentiles;

        // By perspective
        let perspective_rows: Vec<(String, i64, i64, i64, Option<f64>)> = sqlx::query_as(&format!(
            "SELECT
                 agent_perspective,
                 COUNT(*) AS count,
                 COUNT(*) FILTER (WHERE status = 'completed' AND (exit_code = 0 OR exit_code IS NULL)) AS success_count,
                 COUNT(*) FILTER (WHERE status = 'failed' OR (status = 'completed' AND exit_code IS NOT NULL AND exit_code != 0)) AS failure_count,
                 AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL) AS avg_duration_seconds
             FROM invocations
             WHERE project_id = $1
               AND created_at > NOW() - INTERVAL '{interval}'
             GROUP BY agent_perspective
             ORDER BY COUNT(*) DESC"
        ))
        .bind(project_id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| McpError::internal_error(format!("Failed to aggregate by perspective: {e}"), None))?;

        let by_perspective: Vec<serde_json::Value> = perspective_rows
            .into_iter()
            .map(|(perspective, count, sc, fc, avg)| {
                serde_json::json!({
                    "perspective": perspective,
                    "count": count,
                    "success_count": sc,
                    "failure_count": fc,
                    "avg_duration_seconds": avg.unwrap_or(0.0),
                })
            })
            .collect();

        // By model
        let model_rows: Vec<(String, i64, Option<f64>)> = sqlx::query_as(&format!(
            "SELECT
                 model_used,
                 COUNT(*) AS count,
                 COALESCE(SUM(cost_usd), 0.0) AS cost_usd
             FROM invocations
             WHERE project_id = $1
               AND model_used IS NOT NULL
               AND created_at > NOW() - INTERVAL '{interval}'
             GROUP BY model_used
             ORDER BY COUNT(*) DESC"
        ))
        .bind(project_id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| {
            McpError::internal_error(format!("Failed to aggregate by model: {e}"), None)
        })?;

        let total_cost: f64 = model_rows.iter().map(|(_, _, c)| c.unwrap_or(0.0)).sum();

        let by_model: Vec<serde_json::Value> = model_rows
            .into_iter()
            .map(|(model, count, cost)| {
                serde_json::json!({
                    "model": model,
                    "count": count,
                    "cost_usd": cost.unwrap_or(0.0),
                })
            })
            .collect();

        let success_rate = if invocation_count > 0 {
            success_count as f64 / invocation_count as f64
        } else {
            0.0
        };

        let result = serde_json::json!({
            "period": period,
            "invocation_count": invocation_count,
            "success_count": success_count,
            "failure_count": failure_count,
            "pending_count": pending_count,
            "success_rate": success_rate,
            "avg_duration_seconds": avg_duration.unwrap_or(0.0),
            "p50_duration_seconds": p50.unwrap_or(0.0),
            "p95_duration_seconds": p95.unwrap_or(0.0),
            "total_cost_usd": total_cost,
            "by_perspective": by_perspective,
            "by_model": by_model,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(description = "Get cost breakdown for project invocations")]
    async fn get_cost_summary(
        &self,
        Parameters(params): Parameters<GetCostSummaryParams>,
    ) -> Result<CallToolResult, McpError> {
        let project_id = match self.require_project() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let period = params.period.as_deref().unwrap_or("7d");
        let interval = match period {
            "1h" => "1 hour",
            "24h" => "24 hours",
            "7d" => "7 days",
            "30d" => "30 days",
            _ => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid period. Use: 1h, 24h, 7d, or 30d",
                )]))
            }
        };

        // Per-model cost breakdown
        let model_rows: Vec<(String, i64, Option<f64>, Option<i64>, Option<i64>)> =
            sqlx::query_as(&format!(
                "SELECT
                     COALESCE(model_used, 'unknown') AS model,
                     COUNT(*) AS invocation_count,
                     COALESCE(SUM(cost_usd), 0.0) AS total_cost_usd,
                     SUM(input_tokens) AS total_input_tokens,
                     SUM(output_tokens) AS total_output_tokens
                 FROM invocations
                 WHERE project_id = $1
                   AND created_at > NOW() - INTERVAL '{interval}'
                 GROUP BY model_used
                 ORDER BY SUM(cost_usd) DESC NULLS LAST"
            ))
            .bind(project_id)
            .fetch_all(&self.db)
            .await
            .map_err(|e| {
                McpError::internal_error(format!("Failed to aggregate costs by model: {e}"), None)
            })?;

        let total_cost: f64 = model_rows
            .iter()
            .map(|(_, _, c, _, _)| c.unwrap_or(0.0))
            .sum();
        let total_invocations: i64 = model_rows.iter().map(|(_, c, _, _, _)| c).sum();
        let total_input_tokens: i64 = model_rows
            .iter()
            .map(|(_, _, _, i, _)| i.unwrap_or(0))
            .sum();
        let total_output_tokens: i64 = model_rows
            .iter()
            .map(|(_, _, _, _, o)| o.unwrap_or(0))
            .sum();

        let by_model: Vec<serde_json::Value> = model_rows
            .into_iter()
            .map(|(model, count, cost, input_tokens, output_tokens)| {
                serde_json::json!({
                    "model": model,
                    "invocation_count": count,
                    "cost_usd": cost.unwrap_or(0.0),
                    "input_tokens": input_tokens.unwrap_or(0),
                    "output_tokens": output_tokens.unwrap_or(0),
                })
            })
            .collect();

        let result = serde_json::json!({
            "period": period,
            "total_cost_usd": total_cost,
            "total_invocations": total_invocations,
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "by_model": by_model,
        });
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }

    #[tool(
        description = "Get your model preferences (default_model, default_budget, default_provider). These are the sponsor user's preferences that influence model routing for agent invocations."
    )]
    async fn get_model_preferences(&self) -> Result<CallToolResult, McpError> {
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        // Look up the sponsor user_id from the participant record
        let user_id: Option<Uuid> =
            sqlx::query_scalar("SELECT user_id FROM participants WHERE id = $1")
                .bind(participant_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to look up participant: {e}"), None)
                })?
                .flatten();

        let Some(user_id) = user_id else {
            return Ok(CallToolResult::error(vec![Content::text(
                "Could not determine sponsor user for this participant",
            )]));
        };

        let rows: Vec<(String, serde_json::Value)> = sqlx::query_as(
            "SELECT preference_key, preference_value
             FROM user_model_preferences
             WHERE user_id = $1
             ORDER BY preference_key",
        )
        .bind(user_id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| {
            McpError::internal_error(format!("Failed to fetch model preferences: {e}"), None)
        })?;

        let mut prefs = serde_json::json!({
            "user_id": user_id,
            "default_model": null,
            "default_budget": null,
            "default_provider": null,
        });

        for (key, value) in rows {
            prefs[key] = value;
        }

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&prefs).unwrap(),
        )]))
    }

    #[tool(
        description = "Update your model preferences. These influence model routing for future agent invocations you create. Pass only the fields you want to change."
    )]
    async fn update_model_preferences(
        &self,
        Parameters(params): Parameters<UpdateModelPreferencesParams>,
    ) -> Result<CallToolResult, McpError> {
        let participant_id = match self.require_participant() {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        // Look up the sponsor user_id from the participant record
        let user_id: Option<Uuid> =
            sqlx::query_scalar("SELECT user_id FROM participants WHERE id = $1")
                .bind(participant_id)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| {
                    McpError::internal_error(format!("Failed to look up participant: {e}"), None)
                })?
                .flatten();

        let Some(user_id) = user_id else {
            return Ok(CallToolResult::error(vec![Content::text(
                "Could not determine sponsor user for this participant",
            )]));
        };

        // Build the list of updates to apply
        let mut updates: Vec<(&str, serde_json::Value)> = Vec::new();

        if let Some(ref model) = params.default_model {
            updates.push(("default_model", serde_json::Value::String(model.clone())));
        }
        if let Some(ref budget) = params.default_budget {
            let valid = matches!(
                budget.as_str(),
                "free" | "economy" | "moderate" | "unlimited"
            );
            if !valid {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid default_budget. Must be: free, economy, moderate, or unlimited",
                )]));
            }
            updates.push(("default_budget", serde_json::Value::String(budget.clone())));
        }
        if let Some(ref provider) = params.default_provider {
            let valid = matches!(provider.as_str(), "anthropic" | "openrouter" | "ollama");
            if !valid {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Invalid default_provider. Must be: anthropic, openrouter, or ollama",
                )]));
            }
            updates.push((
                "default_provider",
                serde_json::Value::String(provider.clone()),
            ));
        }

        if updates.is_empty() {
            return Ok(CallToolResult::error(vec![Content::text(
                "No preferences to update. Provide at least one of: default_model, default_budget, default_provider",
            )]));
        }

        for (key, value) in &updates {
            sqlx::query(
                "INSERT INTO user_model_preferences (user_id, preference_key, preference_value, updated_at)
                 VALUES ($1, $2, $3, now())
                 ON CONFLICT (user_id, preference_key)
                 DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = now()",
            )
            .bind(user_id)
            .bind(key)
            .bind(value)
            .execute(&self.db)
            .await
            .map_err(|e| {
                McpError::internal_error(
                    format!("Failed to update model preference '{key}': {e}"),
                    None,
                )
            })?;
        }

        // Return updated preferences
        let rows: Vec<(String, serde_json::Value)> = sqlx::query_as(
            "SELECT preference_key, preference_value
             FROM user_model_preferences
             WHERE user_id = $1
             ORDER BY preference_key",
        )
        .bind(user_id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| {
            McpError::internal_error(format!("Failed to fetch updated preferences: {e}"), None)
        })?;

        let mut prefs = serde_json::json!({
            "user_id": user_id,
            "updated": updates.iter().map(|(k, _)| k).collect::<Vec<_>>(),
            "default_model": null,
            "default_budget": null,
            "default_provider": null,
        });

        for (key, value) in rows {
            prefs[key] = value;
        }

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&prefs).unwrap(),
        )]))
    }

    #[tool(
        description = "List available models from all configured providers. Returns model IDs, names, providers, and context lengths. Use model IDs when setting default_model preferences or creating invocations."
    )]
    async fn list_available_models(
        &self,
        Parameters(params): Parameters<ListAvailableModelsParams>,
    ) -> Result<CallToolResult, McpError> {
        // Always include built-in Anthropic models
        let mut all_models = crate::model_discovery::anthropic_models();

        // Include OpenRouter models if not filtered to anthropic-only
        let include_openrouter = params
            .provider
            .as_deref()
            .map(|p| p == "openrouter")
            .unwrap_or(true);

        if include_openrouter {
            match crate::model_discovery::fetch_openrouter_models().await {
                Ok(models) => all_models.extend(models),
                Err(e) => {
                    tracing::warn!("list_available_models: failed to fetch OpenRouter models: {e}");
                    // Continue with Anthropic-only; don't fail
                }
            }
        }

        // Apply provider filter
        if let Some(ref filter) = params.provider {
            all_models.retain(|m| m.provider == *filter);
        }

        let items: Vec<serde_json::Value> = all_models
            .iter()
            .map(|m| {
                serde_json::json!({
                    "id": m.id,
                    "name": m.name,
                    "provider": m.provider,
                    "context_length": m.context_length,
                    "modality": m.modality,
                    "pricing_prompt": m.pricing_prompt,
                    "pricing_completion": m.pricing_completion,
                })
            })
            .collect();

        let result = serde_json::json!({
            "count": items.len(),
            "models": items,
        });

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&result).unwrap(),
        )]))
    }
}

impl ServerHandler for SeamMcp {
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        info.server_info.name = "seam-mcp".into();
        info.server_info.version = env!("CARGO_PKG_VERSION").into();
        info.instructions = Some(
            "Seam collaborative session server. Use join_session with an agent code to connect, then manage tasks with create_task, list_tasks, update_task, etc.".into()
        );
        info
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        // When auth is enabled, every tool call must come from an authenticated
        // connection. The HTTP-level middleware (McpAuthLayer) already blocks
        // unauthenticated requests with 401, but we check here as well to
        // catch any edge case and return a clear error instead of a misleading
        // "Session not found" from downstream session-lookup logic.
        if self.auth_enabled {
            let has_identity = context
                .extensions
                .get::<http::request::Parts>()
                .and_then(|parts| parts.extensions.get::<Arc<McpIdentity>>())
                .is_some();

            if !has_identity {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Authentication required for MCP access. \
                     Reconnect to /mcp with a valid Bearer token.",
                )]));
            }
        }

        let tool_name = request.name.to_string();
        let request_params = request
            .arguments
            .as_ref()
            .map(|a| serde_json::Value::Object(a.clone().into_iter().collect()));
        let start = std::time::Instant::now();

        let tcc = ToolCallContext::new(self, request, context);
        let result = self.tool_router.call(tcc).await;

        let duration_ms = start.elapsed().as_millis() as i32;

        // Record invocation (fire-and-forget)
        let participant_id = self.state.lock().ok().and_then(|s| s.participant_id);
        let session_id = self.get_session_id();

        // Only record if we have session context (skip for join_session itself on first call)
        if let (Some(participant_id), Some(session_id)) = (participant_id, session_id) {
            let is_error = match &result {
                Ok(r) => r.is_error.unwrap_or(false),
                Err(_) => true,
            };
            let response_json = match &result {
                Ok(r) => serde_json::to_value(r).unwrap_or(serde_json::json!(null)),
                Err(e) => serde_json::json!({ "error": format!("{:?}", e) }),
            };

            self.record_tool_invocation(
                session_id,
                participant_id,
                &tool_name,
                request_params,
                response_json,
                is_error,
                duration_ms,
            )
            .await;
        }

        result
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        let items = self.tool_router.list_all();
        Ok(ListToolsResult::with_all_items(items))
    }
}

// --- Internal helpers ---
impl SeamMcp {
    fn require_project(&self) -> Result<Uuid, CallToolResult> {
        self.state
            .lock()
            .ok()
            .and_then(|s| s.project_id)
            .ok_or_else(|| {
                CallToolResult::error(vec![Content::text(
                    "Not in a session. Use join_session first.",
                )])
            })
    }

    fn get_session_id(&self) -> Option<Uuid> {
        self.state.lock().ok().and_then(|s| s.session_id)
    }

    fn get_ticket_prefix(&self) -> String {
        self.state
            .lock()
            .ok()
            .and_then(|s| s.ticket_prefix.clone())
            .unwrap_or_else(|| "TASK".to_string())
    }

    fn require_participant(&self) -> Result<Uuid, CallToolResult> {
        self.state
            .lock()
            .ok()
            .and_then(|s| s.participant_id)
            .ok_or_else(|| {
                CallToolResult::error(vec![Content::text(
                    "Not in a session. Use join_session first.",
                )])
            })
    }

    async fn require_session(&self) -> Result<Uuid, CallToolResult> {
        let code = self
            .state
            .lock()
            .ok()
            .and_then(|s| s.session_code.clone())
            .ok_or_else(|| {
                CallToolResult::error(vec![Content::text(
                    "Not in a session. Use join_session first.",
                )])
            })?;

        let session: Option<Session> =
            sqlx::query_as("SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL")
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
            "task_type": serde_json::to_value(task.task_type).unwrap(),
            "title": task.title,
            "description": task.description,
            "status": serde_json::to_value(task.status).unwrap(),
            "priority": serde_json::to_value(task.priority).unwrap(),
            "complexity": serde_json::to_value(task.complexity).unwrap(),
            "assigned_to": task.assigned_to,
            "created_by": task.created_by,
            "commit_hashes": task.commit_hashes,
            "no_code_change": task.no_code_change,
            "source_task_id": task.source_task_id,
            "model_hint": task.model_hint,
            "budget_tier": task.budget_tier,
            "provider": task.provider,
            "ai_triage": task.ai_triage,
            "completion_summary": task.completion_summary,
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
            "task_type": serde_json::to_value(task.task_type).unwrap(),
            "title": task.title,
            "description": task.description,
            "status": serde_json::to_value(task.status).unwrap(),
            "priority": serde_json::to_value(task.priority).unwrap(),
            "complexity": serde_json::to_value(task.complexity).unwrap(),
            "assigned_to": task.assigned_to,
            "created_by": task.created_by,
            "commit_hashes": task.commit_hashes,
            "no_code_change": task.no_code_change,
            "source_task_id": task.source_task_id,
            "model_hint": task.model_hint,
            "budget_tier": task.budget_tier,
            "provider": task.provider,
            "ai_triage": task.ai_triage,
            "completion_summary": task.completion_summary,
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
                    "task_type": serde_json::to_value(parent.task_type).unwrap(),
                    "title": parent.title,
                    "status": serde_json::to_value(parent.status).unwrap(),
                    "assigned_to": parent.assigned_to,
                });
            }
        }

        let comments: Vec<TaskComment> =
            sqlx::query_as("SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at")
                .bind(id)
                .fetch_all(&self.db)
                .await
                .map_err(|e| format!("Database error: {e}"))?;

        let comment_views: Vec<serde_json::Value> = comments
            .iter()
            .map(|c| {
                serde_json::json!({
                    "id": c.id,
                    "author_id": c.author_id,
                    "content": c.content,
                    "created_at": c.created_at,
                })
            })
            .collect();

        // Also fetch children
        let children: Vec<Task> =
            sqlx::query_as("SELECT * FROM tasks WHERE parent_id = $1 ORDER BY created_at")
                .bind(id)
                .fetch_all(&self.db)
                .await
                .map_err(|e| format!("Database error: {e}"))?;

        let child_views: Vec<serde_json::Value> = children
            .iter()
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "ticket_id": format!("{}-{}", ticket_prefix, t.ticket_number),
                    "task_type": serde_json::to_value(t.task_type).unwrap(),
                    "title": t.title,
                    "status": serde_json::to_value(t.status).unwrap(),
                    "assigned_to": t.assigned_to,
                })
            })
            .collect();

        // Fetch dependencies: tasks this task blocks
        let blocks: Vec<Task> = sqlx::query_as(
            "SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocked_id = t.id WHERE d.blocker_id = $1 ORDER BY t.created_at"
        )
        .bind(id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let blocks_views: Vec<serde_json::Value> = blocks
            .iter()
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "ticket_id": format!("{}-{}", ticket_prefix, t.ticket_number),
                    "title": t.title,
                    "status": serde_json::to_value(t.status).unwrap(),
                })
            })
            .collect();

        // Fetch dependencies: tasks that block this task
        let blocked_by: Vec<Task> = sqlx::query_as(
            "SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocker_id = t.id WHERE d.blocked_id = $1 ORDER BY t.created_at"
        )
        .bind(id)
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        let blocked_by_views: Vec<serde_json::Value> = blocked_by
            .iter()
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "ticket_id": format!("{}-{}", ticket_prefix, t.ticket_number),
                    "title": t.title,
                    "status": serde_json::to_value(t.status).unwrap(),
                })
            })
            .collect();

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

    async fn notify_agent_state(&self, state: &str, detail: &str) {
        let (session_code, participant_id) = {
            let s = match self.state.lock() {
                Ok(s) => s,
                Err(_) => return,
            };
            match (s.session_code.clone(), s.participant_id) {
                (Some(code), Some(pid)) => (code, pid),
                _ => return,
            }
        };
        let payload = serde_json::json!({
            "session_code": session_code,
            "participant_id": participant_id.to_string(),
            "state": state,
            "detail": detail,
        });
        if let Err(e) = sqlx::query("SELECT pg_notify('agent_state', $1)")
            .bind(payload.to_string())
            .execute(&self.db)
            .await
        {
            eprintln!("[seam-mcp] Failed to notify agent state: {e}");
        }
    }

    async fn record_tool_invocation(
        &self,
        session_id: Uuid,
        participant_id: Uuid,
        tool_name: &str,
        request_params: Option<serde_json::Value>,
        response: serde_json::Value,
        is_error: bool,
        duration_ms: i32,
    ) {
        if let Err(e) = sqlx::query(
            "INSERT INTO tool_invocations (session_id, participant_id, tool_name, request_params, response, is_error, duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6, $7)"
        )
        .bind(session_id)
        .bind(participant_id)
        .bind(tool_name)
        .bind(request_params)
        .bind(response)
        .bind(is_error)
        .bind(duration_ms)
        .execute(&self.db)
        .await
        {
            eprintln!("[seam-mcp] Failed to record tool invocation: {e}");
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

        let participants: Vec<(Uuid, String)> =
            sqlx::query_as("SELECT id, display_name FROM participants WHERE session_id = $1")
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
        let agent_code: AgentJoinCode =
            sqlx::query_as("SELECT * FROM agent_join_codes WHERE code = $1")
                .bind(code)
                .fetch_optional(&self.db)
                .await
                .map_err(|e| format!("Database error: {e}"))?
                .ok_or_else(|| "Invalid agent code".to_string())?;

        let session: Session =
            sqlx::query_as("SELECT * FROM sessions WHERE id = $1 AND closed_at IS NULL")
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

        let sponsor_user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
            .bind(agent_code.user_id)
            .fetch_one(&self.db)
            .await
            .map_err(|e| format!("Database error: {e}"))?;

        // Mark any existing agent participants from this sponsor as disconnected
        let old_agents: Vec<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM participants
             WHERE session_id = $1 AND sponsor_id = $2 AND participant_type = 'agent' AND disconnected_at IS NULL",
        )
        .bind(session.id)
        .bind(sponsor.id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        sqlx::query(
            "UPDATE participants SET disconnected_at = NOW()
             WHERE session_id = $1 AND sponsor_id = $2 AND participant_type = 'agent' AND disconnected_at IS NULL",
        )
        .bind(session.id)
        .bind(sponsor.id)
        .execute(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        // Notify disconnection of old agents so presence tracking is updated
        for (old_id,) in &old_agents {
            let payload = serde_json::json!({
                "session_code": session.code,
                "participant_id": old_id.to_string(),
                "state": "disconnected",
                "detail": "Replaced by new agent session",
            });
            let _ = sqlx::query("SELECT pg_notify('agent_state', $1)")
                .bind(payload.to_string())
                .execute(&self.db)
                .await;
        }

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

        // Broadcast participant_joined via WebSocket (matching routes/agent.rs and routes/sessions.rs)
        if let Some(ref connections) = self.connections {
            connections
                .broadcast_to_session(
                    &session.code,
                    &serde_json::json!({
                        "type": "participant_joined",
                        "participant": {
                            "id": pid,
                            "display_name": &name,
                            "participant_type": "agent",
                            "sponsor_id": sponsor.id,
                            "joined_at": Utc::now(),
                        }
                    }),
                )
                .await;
        }

        // Emit session.participant_joined domain event (matching routes/sessions.rs)
        let event = crate::events::DomainEvent::new(
            "session.participant_joined",
            "session",
            session.id,
            Some(agent_code.user_id),
            serde_json::json!({
                "participant_id": pid,
                "display_name": &name,
            }),
        );
        if let Err(e) = crate::events::emit(&self.db, &event).await {
            tracing::warn!("Failed to emit domain event: {e}");
        }

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
        let session: Session =
            sqlx::query_as("SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL")
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
