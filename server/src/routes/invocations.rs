use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db;
use crate::log_buffer::LogLine;
use crate::models::Invocation;
use crate::AppState;

// --- Request / Response types ---

#[derive(Debug, Deserialize)]
pub struct CreateInvocationRequest {
    pub workspace_id: Uuid,
    pub agent_perspective: String,
    pub prompt: String,
    pub system_prompt_append: Option<String>,
    pub task_id: Option<Uuid>,
    pub session_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct ListInvocationsQuery {
    pub status: Option<String>,
    pub workspace_id: Option<Uuid>,
    pub task_id: Option<Uuid>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct InvocationView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub session_id: Option<Uuid>,
    pub task_id: Option<Uuid>,
    pub participant_id: Option<Uuid>,
    pub agent_perspective: String,
    pub prompt: String,
    pub system_prompt_append: Option<String>,
    pub status: String,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
    pub triggered_by: String,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct InvocationDetailView {
    #[serde(flatten)]
    pub invocation: InvocationView,
    pub result_json: Option<serde_json::Value>,
    pub output: Vec<LogLine>,
}

fn to_view(inv: Invocation) -> InvocationView {
    InvocationView {
        id: inv.id,
        workspace_id: inv.workspace_id,
        project_id: inv.project_id,
        session_id: inv.session_id,
        task_id: inv.task_id,
        participant_id: inv.participant_id,
        agent_perspective: inv.agent_perspective,
        prompt: inv.prompt,
        system_prompt_append: inv.system_prompt_append,
        status: inv.status,
        exit_code: inv.exit_code,
        error_message: inv.error_message,
        triggered_by: inv.triggered_by,
        started_at: inv.started_at,
        completed_at: inv.completed_at,
        created_at: inv.created_at,
        updated_at: inv.updated_at,
    }
}

/// Verify project membership; returns Err(NOT_FOUND) when the user is not a member.
async fn verify_project_member(
    db: &sqlx::PgPool,
    project_id: Uuid,
    user_id: Uuid,
) -> Result<(), StatusCode> {
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check project membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(())
}

/// POST /api/projects/:project_id/invocations
pub async fn create_invocation(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateInvocationRequest>,
) -> Result<(StatusCode, Json<InvocationView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    // Verify workspace belongs to this project
    let ws_exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM workspaces WHERE id = $1 AND project_id = $2",
    )
    .bind(req.workspace_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check workspace: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if ws_exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let inv = sqlx::query_as::<_, Invocation>(
        "INSERT INTO invocations
            (workspace_id, project_id, session_id, task_id,
             agent_perspective, prompt, system_prompt_append, triggered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual')
         RETURNING *",
    )
    .bind(req.workspace_id)
    .bind(project_id)
    .bind(req.session_id)
    .bind(req.task_id)
    .bind(&req.agent_perspective)
    .bind(&req.prompt)
    .bind(&req.system_prompt_append)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create invocation: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let event = crate::events::DomainEvent::new(
        "invocation.created",
        "invocation",
        inv.id,
        Some(user.id),
        serde_json::json!({
            "workspace_id": req.workspace_id,
            "project_id": project_id,
            "agent_perspective": req.agent_perspective,
            "task_id": req.task_id,
            "session_id": req.session_id,
        }),
    );
    if let Err(e) = crate::events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    // Dispatch the invocation asynchronously
    let invocation_id = inv.id;
    let dispatch_state = Arc::clone(&state);
    tokio::spawn(async move {
        if let Err(e) = crate::dispatch::dispatch_invocation(
            &dispatch_state.db,
            &dispatch_state.log_buffer,
            &dispatch_state.connections,
            invocation_id,
        )
        .await
        {
            tracing::error!(invocation_id = %invocation_id, "Dispatch failed: {e}");
        }
    });

    Ok((StatusCode::CREATED, Json(to_view(inv))))
}

/// GET /api/projects/:project_id/invocations
pub async fn list_invocations(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Query(query): Query<ListInvocationsQuery>,
) -> Result<Json<Vec<InvocationView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let limit = query.limit.unwrap_or(50).min(200);

    // Build query dynamically based on optional filters
    let invocations = sqlx::query_as::<_, Invocation>(
        "SELECT * FROM invocations
         WHERE project_id = $1
           AND ($2::text IS NULL OR status = $2)
           AND ($3::uuid IS NULL OR workspace_id = $3)
           AND ($4::uuid IS NULL OR task_id = $4)
         ORDER BY created_at DESC
         LIMIT $5",
    )
    .bind(project_id)
    .bind(&query.status)
    .bind(query.workspace_id)
    .bind(query.task_id)
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list invocations: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(invocations.into_iter().map(to_view).collect()))
}

/// GET /api/invocations/:invocation_id
pub async fn get_invocation(
    State(state): State<Arc<AppState>>,
    Path(invocation_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
) -> Result<Json<InvocationDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let inv = sqlx::query_as::<_, Invocation>(
        "SELECT * FROM invocations WHERE id = $1",
    )
    .bind(invocation_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get invocation: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Verify the requesting user is a member of the invocation's project
    verify_project_member(&state.db, inv.project_id, user.id).await?;

    // Pull recent output lines from the in-memory log buffer (keyed by workspace_id)
    let output = state.log_buffer.recent(inv.workspace_id, 200);

    let result_json = inv.result_json.clone();
    Ok(Json(InvocationDetailView {
        invocation: to_view(inv),
        result_json,
        output,
    }))
}
