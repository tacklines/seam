use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::agent_token;
use crate::log_buffer::LogLine;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct IngestPath {
    pub workspace_id: Uuid,
}

/// Extract and validate a Bearer token from headers.
/// Returns Ok(()) if valid agent token or auth is disabled, Err(401) otherwise.
async fn validate_agent_auth(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(), StatusCode> {
    // Skip auth in dev mode
    if std::env::var("MCP_AUTH_DISABLED").unwrap_or_default() == "true" {
        return Ok(());
    }

    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if !agent_token::is_agent_token(token) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    agent_token::validate_token(&state.db, token)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;

    Ok(())
}

/// POST /api/workspaces/:workspace_id/logs
///
/// Accepts an array of log lines from the workspace sidecar.
/// Authenticated via agent token (sat_).
pub async fn ingest_logs(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workspace_id): Path<Uuid>,
    Json(lines): Json<Vec<LogLine>>,
) -> Result<StatusCode, StatusCode> {
    validate_agent_auth(&state, &headers).await?;
    // Look up workspace to find participant_id and session_code
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT w.id, w.task_id FROM workspaces w WHERE w.id = $1"
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to look up workspace: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (_ws_id, _task_id) = row.ok_or(StatusCode::NOT_FOUND)?;

    // Find participant linked to this workspace via the agent launch flow
    // Workspaces are linked to a participant via the task's assigned_to or creator
    let participant_info: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT p.id, s.code
         FROM workspaces w
         JOIN tasks t ON t.id = w.task_id
         JOIN participants p ON p.id = COALESCE(t.assigned_to, t.created_by)
         JOIN sessions s ON s.id = p.session_id
         WHERE w.id = $1"
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to resolve workspace participant: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (participant_id, session_code) = participant_info.ok_or(StatusCode::NOT_FOUND)?;

    for line in lines {
        // Buffer for history retrieval
        state.log_buffer.push(participant_id, line.clone());

        // Broadcast to subscribed WebSocket clients
        state.connections.broadcast_agent_stream(
            &session_code,
            &participant_id.to_string(),
            &serde_json::json!({
                "type": "agent_stream",
                "stream": "output",
                "participant_id": participant_id,
                "data": {
                    "line": line.line,
                    "fd": line.fd,
                    "ts": line.ts,
                }
            }),
        ).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct LogHistoryQuery {
    pub limit: Option<usize>,
}

/// GET /api/workspaces/:workspace_id/logs
pub async fn get_logs(
    State(state): State<Arc<AppState>>,
    Path(workspace_id): Path<Uuid>,
    Query(query): Query<LogHistoryQuery>,
) -> Result<Json<Vec<LogLine>>, StatusCode> {
    // Resolve participant from workspace
    let participant_id: Option<(Uuid,)> = sqlx::query_as(
        "SELECT p.id
         FROM workspaces w
         JOIN tasks t ON t.id = w.task_id
         JOIN participants p ON p.id = COALESCE(t.assigned_to, t.created_by)
         WHERE w.id = $1"
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to resolve workspace participant: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (pid,) = participant_id.ok_or(StatusCode::NOT_FOUND)?;
    let limit = query.limit.unwrap_or(100).min(500);
    let lines = state.log_buffer.recent(pid, limit);

    Ok(Json(lines))
}
