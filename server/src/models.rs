use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// --- Tenancy ---

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub personal: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum OrgRole {
    Owner,
    Admin,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrgMember {
    pub org_id: Uuid,
    pub user_id: Uuid,
    pub role: OrgRole,
    pub joined_at: DateTime<Utc>,
}

// --- Projects ---

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: Uuid,
    pub org_id: Uuid,
    pub name: String,
    pub slug: String,
    pub ticket_prefix: String,
    pub next_ticket_number: i32,
    pub created_at: DateTime<Utc>,
    pub repo_url: Option<String>,
    pub default_branch: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum ProjectRole {
    Admin,
    Member,
    Viewer,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProjectMember {
    pub project_id: Uuid,
    pub user_id: Uuid,
    pub role: ProjectRole,
    pub joined_at: DateTime<Utc>,
}

// --- Users ---

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    /// OIDC subject ID
    pub external_id: String,
    pub username: String,
    pub display_name: String,
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
}

// --- Sessions ---

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: Uuid,
    pub project_id: Uuid,
    pub code: String,
    pub name: Option<String>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum ParticipantType {
    Human,
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Participant {
    pub id: Uuid,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub participant_type: ParticipantType,
    /// For agents: the human user who spawned them
    pub sponsor_id: Option<Uuid>,
    pub joined_at: DateTime<Utc>,
    /// Agent composition metadata (self-reported on join)
    pub client_name: Option<String>,
    pub client_version: Option<String>,
    pub model: Option<String>,
    pub metadata: serde_json::Value,
    pub disconnected_at: Option<DateTime<Utc>>,
}

/// Join code for humans to enter a session
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SessionJoinCode {
    pub id: Uuid,
    pub session_id: Uuid,
    pub code: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub used_count: i32,
}

/// Per-user-per-session code for agents to join on behalf of a user
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentJoinCode {
    pub id: Uuid,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub code: String,
    pub created_at: DateTime<Utc>,
}

// --- Tasks ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum TaskType {
    Epic,
    Story,
    Task,
    Subtask,
    Bug,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum TaskStatus {
    Open,
    InProgress,
    Done,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum TaskPriority {
    Critical,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum TaskComplexity {
    Xl,
    Large,
    Medium,
    Small,
    Trivial,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Task {
    pub id: Uuid,
    pub session_id: Option<Uuid>,
    pub project_id: Uuid,
    pub ticket_number: i32,
    pub parent_id: Option<Uuid>,
    pub task_type: TaskType,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub complexity: TaskComplexity,
    pub assigned_to: Option<Uuid>,
    pub created_by: Uuid,
    pub commit_hashes: Vec<String>,
    pub no_code_change: bool,
    pub source_task_id: Option<Uuid>,
    /// Per-task model routing preferences (inherited by invocations when task_id is set)
    pub model_hint: Option<String>,
    pub budget_tier: Option<String>,
    pub provider: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
    pub ai_triage: Option<serde_json::Value>,
    pub completion_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TaskComment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Uuid,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub intent: Option<String>,
}

// --- Activity Events ---

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ActivityEvent {
    pub id: Uuid,
    pub project_id: Uuid,
    pub session_id: Option<Uuid>,
    pub actor_id: Uuid,
    pub event_type: String,
    pub target_type: String,
    pub target_id: Uuid,
    pub summary: String,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

// --- Org API DTOs ---

#[derive(Debug, Serialize)]
pub struct OrgView {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub personal: bool,
    pub role: OrgRole,
    pub created_at: DateTime<Utc>,
    pub member_count: i64,
}

#[derive(Debug, Serialize)]
pub struct OrgMemberView {
    pub user_id: Uuid,
    pub username: String,
    pub display_name: String,
    pub role: OrgRole,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOrgRequest {
    pub name: String,
    pub slug: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOrgRequest {
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InviteOrgMemberRequest {
    pub username: String,
    pub role: Option<OrgRole>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOrgMemberRequest {
    pub role: OrgRole,
}

// --- API DTOs ---

#[derive(Debug, Serialize)]
pub struct ProjectView {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub ticket_prefix: String,
    pub created_at: DateTime<Utc>,
    pub repo_url: Option<String>,
    pub default_branch: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub slug: Option<String>,
    pub ticket_prefix: Option<String>,
    pub repo_url: Option<String>,
    pub default_branch: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub ticket_prefix: Option<String>,
    pub repo_url: Option<String>,
    pub default_branch: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub project_id: Option<Uuid>,
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateSessionResponse {
    pub session: SessionView,
    pub join_code: String,
    pub agent_code: String,
}

#[derive(Debug, Deserialize)]
pub struct JoinSessionRequest {
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct JoinSessionResponse {
    pub session: SessionView,
    pub participant_id: Uuid,
    pub agent_code: String,
}

#[derive(Debug, Serialize)]
pub struct SessionView {
    pub id: Uuid,
    pub code: String,
    pub name: Option<String>,
    pub project_id: Uuid,
    pub project_name: String,
    pub created_at: DateTime<Utc>,
    pub participants: Vec<ParticipantView>,
}

#[derive(Debug, Serialize)]
pub struct ParticipantView {
    pub id: Uuid,
    pub display_name: String,
    pub participant_type: ParticipantType,
    pub sponsor_id: Option<Uuid>,
    pub joined_at: DateTime<Utc>,
    pub is_online: bool,
}

// --- Questions ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum QuestionStatus {
    Pending,
    Answered,
    Expired,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Question {
    pub id: Uuid,
    pub session_id: Uuid,
    pub project_id: Uuid,
    pub asked_by: Uuid,
    pub directed_to: Option<Uuid>,
    pub question_text: String,
    pub context: Option<serde_json::Value>,
    pub answer_text: Option<String>,
    pub answered_by: Option<Uuid>,
    pub status: QuestionStatus,
    pub created_at: DateTime<Utc>,
    pub answered_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
}

// --- Notes ---

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Note {
    pub id: Uuid,
    pub session_id: Uuid,
    pub slug: String,
    pub title: String,
    pub content: String,
    pub updated_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Plans ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum PlanStatus {
    Draft,
    Review,
    Accepted,
    Superseded,
    Abandoned,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Plan {
    pub id: Uuid,
    pub project_id: Uuid,
    pub author_id: Uuid,
    pub title: String,
    pub slug: String,
    pub body: String,
    pub status: PlanStatus,
    pub parent_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Workspaces (Coder Integration) ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum WorkspaceStatus {
    Pending,
    Creating,
    Running,
    Stopping,
    Stopped,
    Failed,
    Destroyed,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Workspace {
    pub id: Uuid,
    pub task_id: Option<Uuid>,
    pub participant_id: Option<Uuid>,
    pub project_id: Uuid,
    pub coder_workspace_id: Option<Uuid>,
    pub coder_workspace_name: Option<String>,
    pub coder_agent_id: Option<Uuid>,
    pub status: WorkspaceStatus,
    pub template_name: String,
    pub branch: Option<String>,
    pub pool_key: Option<String>,
    pub last_invocation_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceView {
    pub id: Uuid,
    pub task_id: Option<Uuid>,
    pub participant_id: Option<Uuid>,
    pub participant_name: Option<String>,
    pub session_code: Option<String>,
    pub status: WorkspaceStatus,
    pub coder_workspace_name: Option<String>,
    pub template_name: String,
    pub branch: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub stopped_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub task_id: Option<Uuid>,
    pub template_name: Option<String>,
    pub branch: Option<String>,
}

// --- Invocations ---

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Invocation {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub session_id: Option<Uuid>,
    pub task_id: Option<Uuid>,
    pub participant_id: Option<Uuid>,

    // What to run
    pub agent_perspective: String,
    pub prompt: String,
    pub system_prompt_append: Option<String>,

    // Execution state
    pub status: String,
    pub exit_code: Option<i32>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,

    // Output
    pub result_json: Option<serde_json::Value>,
    pub error_message: Option<String>,

    // Provenance
    pub triggered_by: String,
    pub reaction_id: Option<Uuid>,

    // Model selection (request-level overrides)
    pub model_hint: Option<String>,
    pub budget_tier: Option<String>,
    pub provider: Option<String>,

    // Session continuity (claude -p --resume)
    pub claude_session_id: Option<String>,
    pub resume_session_id: Option<String>,

    // Cost tracking (populated on completion from claude --output-format json)
    pub model_used: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cost_usd: Option<f64>,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Requirements ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum RequirementStatus {
    Draft,
    Active,
    Satisfied,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Requirement {
    pub id: Uuid,
    pub project_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub title: String,
    pub description: String,
    pub status: RequirementStatus,
    pub priority: TaskPriority,
    pub created_by: Uuid,
    pub session_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Requests ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum RequestStatus {
    Pending,
    Analyzing,
    Decomposed,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Request {
    pub id: Uuid,
    pub project_id: Uuid,
    pub session_id: Option<Uuid>,
    pub author_id: Uuid,
    pub title: String,
    pub body: String,
    pub status: RequestStatus,
    pub analysis: Option<String>,
    pub duplicate_of: Option<Uuid>,
    pub impact_analysis: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// --- Agent API DTOs ---

#[derive(Debug, Deserialize)]
pub struct AgentJoinRequest {
    pub code: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AgentJoinResponse {
    pub session: SessionView,
    pub participant_id: Uuid,
    pub sponsor_name: String,
}

// --- Project Agent Views ---

#[derive(Debug, Serialize)]
pub struct ProjectAgentView {
    pub id: Uuid,
    pub display_name: String,
    pub session_id: Uuid,
    pub session_code: String,
    pub session_name: Option<String>,
    pub sponsor_name: Option<String>,
    pub client_name: Option<String>,
    pub client_version: Option<String>,
    pub model: Option<String>,
    pub joined_at: DateTime<Utc>,
    pub disconnected_at: Option<DateTime<Utc>>,
    pub is_online: bool,
    /// Task currently assigned to this agent (if any)
    pub current_task: Option<AgentTaskSummary>,
    /// Workspace associated with this agent (if any)
    pub workspace: Option<AgentWorkspaceSummary>,
}

#[derive(Debug, Serialize)]
pub struct AgentTaskSummary {
    pub id: Uuid,
    pub ticket_id: String,
    pub title: String,
    pub status: TaskStatus,
    pub task_type: TaskType,
}

#[derive(Debug, Serialize)]
pub struct AgentWorkspaceSummary {
    pub id: Uuid,
    pub status: WorkspaceStatus,
    pub coder_workspace_name: Option<String>,
    pub branch: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProjectAgentDetailView {
    pub agent: ProjectAgentView,
    /// Recent activity/domain events related to this agent
    pub recent_activity: Vec<AgentActivityItem>,
    /// Comments made by this agent
    pub recent_comments: Vec<AgentCommentView>,
}

#[derive(Debug, Serialize)]
pub struct AgentActivityItem {
    pub event_type: String,
    pub summary: String,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct AgentCommentView {
    pub id: Uuid,
    pub task_id: Uuid,
    pub task_title: String,
    pub ticket_id: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
}
