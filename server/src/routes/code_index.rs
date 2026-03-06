use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::code_search::{CodeDocument, detect_language};
use crate::db;
use crate::AppState;

#[derive(Deserialize)]
pub struct IndexFileRequest {
    pub path: String,
    pub content: String,
    /// Programming language. Auto-detected from path extension if omitted.
    pub language: Option<String>,
}

/// POST /api/projects/:project_id/code-index
/// Index a file into the code search index for a project.
pub async fn index_file(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(req): Json<IndexFileRequest>,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Verify project membership
    let member: Option<(Uuid,)> = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error checking membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if member.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    // Fetch the project's org_id
    let org_id: Option<Uuid> = sqlx::query_scalar("SELECT org_id FROM projects WHERE id = $1")
        .bind(project_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("DB error fetching project: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let org_id = org_id.ok_or(StatusCode::NOT_FOUND)?;

    let code_index = state.code_index.as_ref().ok_or_else(|| {
        tracing::warn!("Code index not initialized");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    let language = req
        .language
        .unwrap_or_else(|| detect_language(&req.path).to_string());

    code_index
        .index_file(CodeDocument {
            path: req.path,
            content: req.content,
            language,
            project_id,
            org_id,
        })
        .map_err(|e| {
            tracing::error!("Failed to index file: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/projects/:project_id/code-index
/// Clear all indexed files for a project.
pub async fn clear_project_index(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Verify project membership
    let member: Option<(Uuid,)> = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error checking membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if member.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let code_index = state.code_index.as_ref().ok_or_else(|| {
        tracing::warn!("Code index not initialized");
        StatusCode::SERVICE_UNAVAILABLE
    })?;

    code_index.delete_project(project_id).map_err(|e| {
        tracing::error!("Failed to clear project index: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::NO_CONTENT)
}
