use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// --- Tenancy ---

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
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
    pub created_at: DateTime<Utc>,
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
    /// Keycloak subject ID
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

// --- API DTOs ---

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
