use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::agent_token;
use crate::auth::AuthUser;
use crate::coder;
use crate::db;
use crate::models::*;
use crate::AppState;

// --- DTOs ---

#[derive(Debug, serde::Deserialize)]
pub struct LaunchAgentRequest {
    /// Agent type determines the template behavior: "coder", "planner", "reviewer"
    pub agent_type: Option<String>,
    /// Optional task to associate the agent with
    pub task_id: Option<Uuid>,
    /// Git branch override (defaults to project's default_branch)
    pub branch: Option<String>,
    /// Custom instructions passed to the agent
    pub instructions: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct LaunchAgentResponse {
    pub workspace_id: Uuid,
    pub participant_id: Uuid,
    pub agent_code: String,
    pub status: WorkspaceStatus,
}

// --- Handler ---

/// POST /api/sessions/:code/agents
///
/// Launch an AI agent into a session. Creates a Coder workspace with:
/// - The project's repo cloned
/// - Seam MCP tools configured (pointing back to this server)
/// - The human's agent code injected for session authentication
pub async fn launch_agent(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<LaunchAgentRequest>,
) -> Result<(StatusCode, Json<LaunchAgentResponse>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Verify session exists and is open
    let session: Session = sqlx::query_as(
        "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL",
    )
    .bind(&code)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Verify user is a participant
    let participant: Participant = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2 AND participant_type = 'human'",
    )
    .bind(session.id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::FORBIDDEN)?;

    // Verify Coder is configured
    let _coder_client = state.coder.as_ref().ok_or_else(|| {
        tracing::warn!("Coder integration not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    // Get the user's agent code for this session
    let (agent_code,): (String,) = sqlx::query_as(
        "SELECT code FROM agent_join_codes WHERE session_id = $1 AND user_id = $2",
    )
    .bind(session.id)
    .bind(user.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to find agent code: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Get project for repo URL
    let project: Project = sqlx::query_as("SELECT * FROM projects WHERE id = $1")
        .bind(session.project_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let agent_type = req.agent_type.unwrap_or_else(|| "coder".to_string());
    let branch = req.branch.or_else(|| {
        let b = &project.default_branch;
        if b.is_empty() { None } else { Some(b.clone()) }
    });
    let template_name = "seam-agent".to_string();

    // Determine the Seam server URL that the agent should connect to.
    // In production this would be a public URL; for local dev we use host.docker.internal
    // since the agent runs in a Docker container.
    let seam_url = std::env::var("SEAM_URL")
        .unwrap_or_else(|_| "http://host.docker.internal:3002".to_string());

    // Create workspace record
    let workspace = sqlx::query_as::<_, Workspace>(
        "INSERT INTO workspaces (task_id, project_id, template_name, branch, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *",
    )
    .bind(req.task_id.unwrap_or(Uuid::nil()))
    .bind(session.project_id)
    .bind(&template_name)
    .bind(&branch)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create workspace record: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Create the agent participant record immediately so it shows in the UI
    let agent_display_name = format!("{}'s {} Agent", user.display_name, capitalize(&agent_type));
    let agent_participant_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at)
         VALUES ($1, $2, $3, $4, 'agent', $5, NOW())",
    )
    .bind(agent_participant_id)
    .bind(session.id)
    .bind(user.id)
    .bind(&agent_display_name)
    .bind(participant.id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create agent participant: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Broadcast participant joined
    state
        .connections
        .broadcast_to_session(
            &session.code,
            &serde_json::json!({
                "type": "participant_joined",
                "participant": {
                    "id": agent_participant_id,
                    "display_name": agent_display_name,
                    "participant_type": "agent",
                    "sponsor_id": participant.id,
                    "joined_at": chrono::Utc::now(),
                }
            }),
        )
        .await;

    // Emit domain event
    let event = crate::events::DomainEvent::new(
        "agent.launched",
        "workspace",
        workspace.id,
        Some(user.id),
        serde_json::json!({
            "session_code": code,
            "agent_type": agent_type,
            "agent_participant_id": agent_participant_id,
            "workspace_id": workspace.id,
        }),
    );
    if let Err(e) = crate::events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    // Generate agent token for MCP authentication (24h TTL)
    let seam_token = agent_token::create_token(
        &state.db,
        user.id,
        Some(session.id),
        &agent_display_name,
        chrono::Duration::hours(24),
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to create agent token: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Spawn async provisioning
    let ws_id = workspace.id;
    let user_id = user.id;
    let org_id = project.org_id;
    let db = state.db.clone();
    let coder_url = std::env::var("CODER_URL").unwrap_or_default();
    let coder_token = std::env::var("CODER_TOKEN").unwrap_or_default();
    let repo_url = project.repo_url.clone().unwrap_or_default();
    let agent_code_clone = agent_code.clone();

    tokio::spawn(async move {
        let client = coder::CoderClient::new(coder_url, coder_token);
        provision_agent_workspace(
            &db,
            &client,
            ws_id,
            &template_name,
            branch.as_deref(),
            &repo_url,
            &seam_url,
            &agent_code_clone,
            &agent_type,
            req.instructions.as_deref(),
            &seam_token,
            org_id,
            user_id,
        )
        .await;
    });

    Ok((
        StatusCode::CREATED,
        Json(LaunchAgentResponse {
            workspace_id: workspace.id,
            participant_id: agent_participant_id,
            agent_code,
            status: WorkspaceStatus::Pending,
        }),
    ))
}

/// Background task: create Coder workspace with agent-specific params.
async fn provision_agent_workspace(
    db: &sqlx::PgPool,
    client: &coder::CoderClient,
    workspace_id: Uuid,
    template_name: &str,
    branch: Option<&str>,
    repo_url: &str,
    seam_url: &str,
    agent_code: &str,
    agent_type: &str,
    instructions: Option<&str>,
    seam_token: &str,
    org_id: Uuid,
    user_id: Uuid,
) {
    // Mark as creating
    let _ = sqlx::query(
        "UPDATE workspaces SET status = 'creating', updated_at = NOW() WHERE id = $1",
    )
    .bind(workspace_id)
    .execute(db)
    .await;

    // Resolve template
    let template = match client.get_template_by_name(template_name).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            fail_workspace(db, workspace_id, &format!("Template '{template_name}' not found")).await;
            return;
        }
        Err(e) => {
            fail_workspace(db, workspace_id, &format!("Failed to resolve template: {e}")).await;
            return;
        }
    };

    let ws_name = format!("seam-{}", &workspace_id.to_string()[..8]);

    let mut params = vec![
        coder::RichParameterValue {
            name: "seam_url".to_string(),
            value: seam_url.to_string(),
        },
        coder::RichParameterValue {
            name: "agent_code".to_string(),
            value: agent_code.to_string(),
        },
        coder::RichParameterValue {
            name: "agent_type".to_string(),
            value: agent_type.to_string(),
        },
        coder::RichParameterValue {
            name: "seam_token".to_string(),
            value: seam_token.to_string(),
        },
        coder::RichParameterValue {
            name: "workspace_id".to_string(),
            value: workspace_id.to_string(),
        },
    ];

    if !repo_url.is_empty() {
        params.push(coder::RichParameterValue {
            name: "repo_url".to_string(),
            value: repo_url.to_string(),
        });
    }
    if let Some(b) = branch {
        params.push(coder::RichParameterValue {
            name: "branch".to_string(),
            value: b.to_string(),
        });
    }
    if let Some(instr) = instructions {
        params.push(coder::RichParameterValue {
            name: "instructions".to_string(),
            value: instr.to_string(),
        });
    }

    // Inject merged org + user credentials
    match crate::credentials::credentials_for_workspace(db, org_id, user_id).await {
        Ok(creds) if !creds.is_empty() => {
            let creds_map: serde_json::Map<String, serde_json::Value> = creds
                .into_iter()
                .map(|(k, v)| (k, serde_json::Value::String(v)))
                .collect();
            params.push(coder::RichParameterValue {
                name: "credentials_json".to_string(),
                value: serde_json::Value::Object(creds_map).to_string(),
            });
            tracing::info!(workspace_id = %workspace_id, "Injected credentials into agent workspace");
        }
        Ok(_) => {} // no credentials
        Err(e) => {
            tracing::warn!(workspace_id = %workspace_id, "Failed to decrypt credentials (continuing without): {e}");
        }
    }

    let req = coder::CreateWorkspaceRequest {
        name: ws_name,
        template_id: template.id,
        rich_parameter_values: params,
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
            .bind(workspace_id)
            .bind(coder_ws.id)
            .bind(&coder_ws.name)
            .execute(db)
            .await;

            let event = crate::events::DomainEvent::new(
                "workspace.running",
                "workspace",
                workspace_id,
                None,
                serde_json::json!({
                    "coder_workspace_id": coder_ws.id,
                    "coder_workspace_name": coder_ws.name,
                }),
            );
            if let Err(e) = crate::events::emit(db, &event).await {
                tracing::warn!("Failed to emit domain event: {e}");
            }

            tracing::info!(
                workspace_id = %workspace_id,
                coder_id = %coder_ws.id,
                "Agent workspace created"
            );
        }
        Err(e) => {
            fail_workspace(db, workspace_id, &format!("Failed to create workspace: {e}")).await;
        }
    }
}

async fn fail_workspace(db: &sqlx::PgPool, workspace_id: Uuid, error_message: &str) {
    tracing::error!(workspace_id = %workspace_id, "{error_message}");
    let _ = sqlx::query(
        "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
    )
    .bind(workspace_id)
    .bind(error_message)
    .execute(db)
    .await;
    let event = crate::events::DomainEvent::new(
        "workspace.failed",
        "workspace",
        workspace_id,
        None,
        serde_json::json!({ "error_message": error_message }),
    );
    if let Err(e) = crate::events::emit(db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

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
         LEFT JOIN workspaces w ON w.task_id = t.id AND w.status NOT IN ('destroyed')
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
         LEFT JOIN workspaces w ON w.task_id = t.id AND w.status NOT IN ('destroyed')
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
