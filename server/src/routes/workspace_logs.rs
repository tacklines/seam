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
    // Look up workspace — participant_id may be NULL before agent joins
    let row: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
        "SELECT w.id, w.participant_id FROM workspaces w WHERE w.id = $1"
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to look up workspace: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (_ws_id, participant_id) = row.ok_or(StatusCode::NOT_FOUND)?;

    // Resolve session code for WebSocket broadcast (only if participant exists)
    let session_code: Option<String> = if let Some(pid) = participant_id {
        sqlx::query_scalar(
            "SELECT s.code FROM participants p JOIN sessions s ON s.id = p.session_id WHERE p.id = $1"
        )
        .bind(pid)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to resolve session code: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    } else {
        None
    };

    for line in lines {
        // Always buffer by workspace_id (available from the start)
        let mut keys = vec![workspace_id];
        if let Some(pid) = participant_id {
            keys.push(pid);
        }
        state.log_buffer.push_multi(&keys, line.clone());

        // Broadcast to subscribed WebSocket clients if we have a participant
        if let (Some(pid), Some(code)) = (participant_id, &session_code) {
            state.connections.broadcast_agent_stream(
                code,
                &pid.to_string(),
                &serde_json::json!({
                    "type": "agent_stream",
                    "stream": "output",
                    "participant_id": pid,
                    "data": {
                        "line": line.line,
                        "fd": line.fd,
                        "ts": line.ts,
                    }
                }),
            ).await;
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct LogHistoryQuery {
    pub limit: Option<usize>,
}

/// GET /api/workspaces/:workspace_id/logs
///
/// Accepts either JWT auth (frontend users) or agent token auth (workspace agents).
pub async fn get_logs(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(workspace_id): Path<Uuid>,
    Query(query): Query<LogHistoryQuery>,
) -> Result<Json<Vec<LogLine>>, StatusCode> {
    // Validate auth: accept JWT (frontend) or agent token (workspace sidecar)
    if std::env::var("MCP_AUTH_DISABLED").unwrap_or_default() != "true" {
        let auth_header = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(StatusCode::UNAUTHORIZED)?;

        if agent_token::is_agent_token(token) {
            agent_token::validate_token(&state.db, token)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
                .ok_or(StatusCode::UNAUTHORIZED)?;
        } else {
            // Validate as JWT via JWKS
            state.jwks.validate_token(token)
                .await
                .map_err(|_| StatusCode::UNAUTHORIZED)?;
        }
    }
    // Verify workspace exists
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM workspaces WHERE id = $1"
    )
    .bind(workspace_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to look up workspace: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    exists.ok_or(StatusCode::NOT_FOUND)?;

    // Retrieve logs keyed by workspace_id (available even before agent joins)
    let limit = query.limit.unwrap_or(100).min(500);
    let lines = state.log_buffer.recent(workspace_id, limit);

    Ok(Json(lines))
}
