use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::credentials;
use crate::db;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct UserCredentialView {
    pub id: Uuid,
    pub name: String,
    pub credential_type: String,
    pub env_var_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub rotated_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserCredentialRequest {
    pub name: String,
    pub credential_type: String,
    pub value: String,
    pub env_var_name: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct RotateUserCredentialRequest {
    pub value: String,
    pub expires_at: Option<DateTime<Utc>>,
}

/// GET /api/me/credentials
pub async fn list_user_credentials(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<UserCredentialView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let rows = sqlx::query_as::<_, (Uuid, String, String, Option<String>, DateTime<Utc>, Option<DateTime<Utc>>, Option<DateTime<Utc>>)>(
        "SELECT id, name, credential_type, env_var_name, created_at, rotated_at, expires_at
         FROM user_credentials
         WHERE user_id = $1
         ORDER BY created_at"
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list user credentials: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(rows.into_iter().map(|(id, name, credential_type, env_var_name, created_at, rotated_at, expires_at)| {
        UserCredentialView { id, name, credential_type, env_var_name, created_at, rotated_at, expires_at }
    }).collect()))
}

/// POST /api/me/credentials
pub async fn create_user_credential(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateUserCredentialRequest>,
) -> Result<(StatusCode, Json<UserCredentialView>), StatusCode> {
    if !credentials::is_configured() {
        tracing::error!("CREDENTIAL_MASTER_KEY not set");
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let valid_types = ["claude_oauth", "anthropic_api_key", "openai_api_key", "google_api_key", "git_token", "ssh_key", "custom"];
    if !valid_types.contains(&req.credential_type.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    if req.credential_type == "custom" && req.env_var_name.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let encrypted = credentials::encrypt_user_credential(&state.db, user.id, req.value.as_bytes())
        .await
        .map_err(|e| {
            tracing::error!("Failed to encrypt user credential: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO user_credentials (id, user_id, name, credential_type, encrypted_value, env_var_name, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)"
    )
    .bind(id)
    .bind(user.id)
    .bind(&req.name)
    .bind(&req.credential_type)
    .bind(&encrypted)
    .bind(&req.env_var_name)
    .bind(req.expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create user credential: {e}");
        if e.to_string().contains("duplicate key") || e.to_string().contains("unique") {
            StatusCode::CONFLICT
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    Ok((StatusCode::CREATED, Json(UserCredentialView {
        id,
        name: req.name,
        credential_type: req.credential_type,
        env_var_name: req.env_var_name,
        created_at: Utc::now(),
        rotated_at: None,
        expires_at: req.expires_at,
    })))
}

/// PATCH /api/me/credentials/:credential_id
pub async fn rotate_user_credential(
    State(state): State<Arc<AppState>>,
    Path(credential_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(req): Json<RotateUserCredentialRequest>,
) -> Result<Json<UserCredentialView>, StatusCode> {
    if !credentials::is_configured() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let existing: Option<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT name, credential_type, env_var_name FROM user_credentials WHERE id = $1 AND user_id = $2"
    )
    .bind(credential_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (name, credential_type, env_var_name) = existing.ok_or(StatusCode::NOT_FOUND)?;

    let encrypted = credentials::encrypt_user_credential(&state.db, user.id, req.value.as_bytes())
        .await
        .map_err(|e| {
            tracing::error!("Failed to encrypt user credential: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    sqlx::query(
        "UPDATE user_credentials SET encrypted_value = $1, rotated_at = NOW(), expires_at = $2 WHERE id = $3"
    )
    .bind(&encrypted)
    .bind(req.expires_at)
    .bind(credential_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to rotate user credential: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(UserCredentialView {
        id: credential_id,
        name,
        credential_type,
        env_var_name,
        created_at: Utc::now(),
        rotated_at: Some(Utc::now()),
        expires_at: req.expires_at,
    }))
}

/// DELETE /api/me/credentials/:credential_id
pub async fn delete_user_credential(
    State(state): State<Arc<AppState>>,
    Path(credential_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result = sqlx::query("DELETE FROM user_credentials WHERE id = $1 AND user_id = $2")
        .bind(credential_id)
        .bind(user.id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete user credential: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}
