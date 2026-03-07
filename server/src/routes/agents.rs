use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db;
use crate::models::*;
use crate::AppState;

// --- Project-level agent views ---

#[derive(Debug, serde::Deserialize)]
pub struct ListAgentsQuery {
    /// Include disconnected agents (default: false)
    pub include_disconnected: Option<bool>,
}

/// Row returned by the agent list query (flat join).
#[derive(Debug, sqlx::FromRow)]
struct AgentRow {
    id: Uuid,
    display_name: String,
    session_id: Uuid,
    session_code: String,
    session_name: Option<String>,
    sponsor_name: Option<String>,
    client_name: Option<String>,
    client_version: Option<String>,
    model: Option<String>,
    joined_at: chrono::DateTime<chrono::Utc>,
    disconnected_at: Option<chrono::DateTime<chrono::Utc>>,
    // Task fields (nullable — agent may not have a claimed task)
    task_id: Option<Uuid>,
    ticket_number: Option<i32>,
    task_title: Option<String>,
    task_status: Option<TaskStatus>,
    task_type: Option<TaskType>,
    // Workspace fields (nullable)
    workspace_id: Option<Uuid>,
    workspace_status: Option<WorkspaceStatus>,
    coder_workspace_name: Option<String>,
    workspace_branch: Option<String>,
    workspace_started_at: Option<chrono::DateTime<chrono::Utc>>,
    workspace_error: Option<String>,
}

fn agent_view_from_row(row: AgentRow, ticket_prefix: &str, online_ids: &std::collections::HashSet<Uuid>) -> ProjectAgentView {
    let current_task = match (row.task_id, row.ticket_number, row.task_title, row.task_status, row.task_type) {
        (Some(id), Some(num), Some(title), Some(status), Some(task_type)) => Some(AgentTaskSummary {
            id,
            ticket_id: format!("{}-{}", ticket_prefix, num),
            title,
            status,
            task_type,
        }),
        _ => None,
    };
    let workspace = match (row.workspace_id, row.workspace_status) {
        (Some(id), Some(status)) => Some(AgentWorkspaceSummary {
            id,
            status,
            coder_workspace_name: row.coder_workspace_name,
            branch: row.workspace_branch,
            started_at: row.workspace_started_at,
            error_message: row.workspace_error,
        }),
        _ => None,
    };
    ProjectAgentView {
        id: row.id,
        display_name: row.display_name,
        session_id: row.session_id,
        session_code: row.session_code,
        session_name: row.session_name,
        sponsor_name: row.sponsor_name,
        client_name: row.client_name,
        client_version: row.client_version,
        model: row.model,
        joined_at: row.joined_at,
        disconnected_at: row.disconnected_at,
        is_online: online_ids.contains(&row.id),
        current_task,
        workspace,
    }
}

/// GET /api/projects/:project_id/agents
/// List all agent participants across all sessions in a project.
pub async fn list_project_agents(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ListAgentsQuery>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<ProjectAgentView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Verify project membership
    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM projects WHERE id = $1",
    )
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch project: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let _membership: Option<(Uuid,)> = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check project membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if _membership.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let include_disconnected = query.include_disconnected.unwrap_or(false);

    let sql = format!(
        "SELECT
            p.id, p.display_name, p.session_id,
            s.code AS session_code, s.name AS session_name,
            sp.display_name AS sponsor_name,
            p.client_name, p.client_version, p.model,
            p.joined_at, p.disconnected_at,
            t.id AS task_id, t.ticket_number, t.title AS task_title,
            t.status AS task_status, t.task_type,
            w.id AS workspace_id, w.status AS workspace_status,
            w.coder_workspace_name, w.branch AS workspace_branch,
            w.started_at AS workspace_started_at, w.error_message AS workspace_error
         FROM participants p
         JOIN sessions s ON s.id = p.session_id
         LEFT JOIN participants sp ON sp.id = p.sponsor_id
         LEFT JOIN tasks t ON t.assigned_to = p.id AND t.status IN ('open', 'in_progress')
         LEFT JOIN workspaces w ON w.participant_id = p.id AND w.status NOT IN ('destroyed')
         WHERE s.project_id = $1
           AND p.participant_type = 'agent'
           {}
         ORDER BY p.joined_at DESC",
        if include_disconnected { "" } else { "AND p.disconnected_at IS NULL" },
    );

    let rows = sqlx::query_as::<_, AgentRow>(&sql)
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list project agents: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Get online status from WebSocket connections
    let online_ids = state.connections.all_online_participant_ids();

    let agents: Vec<ProjectAgentView> = rows
        .into_iter()
        .map(|r| agent_view_from_row(r, &project.ticket_prefix, &online_ids))
        .collect();

    Ok(Json(agents))
}

/// GET /api/projects/:project_id/agents/:agent_id
/// Get detailed view of a single agent including activity and comments.
pub async fn get_project_agent(
    State(state): State<Arc<AppState>>,
    Path((project_id, agent_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<Json<ProjectAgentDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let project = sqlx::query_as::<_, Project>(
        "SELECT * FROM projects WHERE id = $1",
    )
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch project: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let _membership: Option<(Uuid,)> = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check project membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if _membership.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    // Fetch the agent participant with joins
    let row = sqlx::query_as::<_, AgentRow>(
        "SELECT
            p.id, p.display_name, p.session_id,
            s.code AS session_code, s.name AS session_name,
            sp.display_name AS sponsor_name,
            p.client_name, p.client_version, p.model,
            p.joined_at, p.disconnected_at,
            t.id AS task_id, t.ticket_number, t.title AS task_title,
            t.status AS task_status, t.task_type,
            w.id AS workspace_id, w.status AS workspace_status,
            w.coder_workspace_name, w.branch AS workspace_branch,
            w.started_at AS workspace_started_at, w.error_message AS workspace_error
         FROM participants p
         JOIN sessions s ON s.id = p.session_id
         LEFT JOIN participants sp ON sp.id = p.sponsor_id
         LEFT JOIN tasks t ON t.assigned_to = p.id AND t.status IN ('open', 'in_progress')
         LEFT JOIN workspaces w ON w.participant_id = p.id AND w.status NOT IN ('destroyed')
         WHERE p.id = $1
           AND s.project_id = $2
           AND p.participant_type = 'agent'",
    )
    .bind(agent_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch agent: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let online_ids = state.connections.all_online_participant_ids();
    let agent = agent_view_from_row(row, &project.ticket_prefix, &online_ids);

    // Fetch recent activity events where this agent is the actor
    let activity_rows = sqlx::query_as::<_, (String, String, serde_json::Value, chrono::DateTime<chrono::Utc>)>(
        "SELECT event_type, summary, metadata, created_at
         FROM activity_events
         WHERE actor_id = $1 AND project_id = $2
         ORDER BY created_at DESC
         LIMIT 50",
    )
    .bind(agent_id)
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch agent activity: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let recent_activity: Vec<AgentActivityItem> = activity_rows
        .into_iter()
        .map(|(event_type, summary, metadata, created_at)| AgentActivityItem {
            event_type,
            summary,
            metadata,
            created_at,
        })
        .collect();

    // Fetch recent comments by this agent
    let comment_rows = sqlx::query_as::<_, (Uuid, Uuid, String, String, i32, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT c.id, c.task_id, t.title, t.ticket_number::text, t.ticket_number, c.content, c.created_at
         FROM task_comments c
         JOIN tasks t ON t.id = c.task_id
         WHERE c.author_id = $1 AND t.project_id = $2
         ORDER BY c.created_at DESC
         LIMIT 30",
    )
    .bind(agent_id)
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch agent comments: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let recent_comments: Vec<AgentCommentView> = comment_rows
        .into_iter()
        .map(|(id, task_id, task_title, _, ticket_number, content, created_at)| AgentCommentView {
            id,
            task_id,
            task_title,
            ticket_id: format!("{}-{}", project.ticket_prefix, ticket_number),
            content,
            created_at,
        })
        .collect();

    Ok(Json(ProjectAgentDetailView {
        agent,
        recent_activity,
        recent_comments,
    }))
}
