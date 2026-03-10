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
use crate::models::OrgRole;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct CredentialView {
    pub id: Uuid,
    pub name: String,
    pub credential_type: String,
    pub env_var_name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub rotated_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_by_username: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCredentialRequest {
    pub name: String,
    pub credential_type: String,
    pub value: String,
    pub env_var_name: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct RotateCredentialRequest {
    pub value: String,
    pub expires_at: Option<DateTime<Utc>>,
}

/// List credentials (metadata only — no values)
pub async fn list_credentials(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<CredentialView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (org, role) = get_org_with_role(&state.db, &slug, user.id).await?;

    // Only owner/admin can view credentials
    if role == OrgRole::Member {
        return Err(StatusCode::FORBIDDEN);
    }

    let rows = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            String,
            Option<String>,
            DateTime<Utc>,
            Option<DateTime<Utc>>,
            Option<DateTime<Utc>>,
            String,
        ),
    >(
        "SELECT c.id, c.name, c.credential_type, c.env_var_name,
                c.created_at, c.rotated_at, c.expires_at, u.username
         FROM org_credentials c
         JOIN users u ON u.id = c.created_by
         WHERE c.org_id = $1
         ORDER BY c.created_at",
    )
    .bind(org.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list credentials: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        rows.into_iter()
            .map(
                |(
                    id,
                    name,
                    credential_type,
                    env_var_name,
                    created_at,
                    rotated_at,
                    expires_at,
                    created_by_username,
                )| {
                    CredentialView {
                        id,
                        name,
                        credential_type,
                        env_var_name,
                        created_at,
                        rotated_at,
                        expires_at,
                        created_by_username,
                    }
                },
            )
            .collect(),
    ))
}

/// Create a new credential
pub async fn create_credential(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateCredentialRequest>,
) -> Result<(StatusCode, Json<CredentialView>), StatusCode> {
    if !credentials::is_configured() {
        tracing::error!("CREDENTIAL_MASTER_KEY not set");
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let user = db::upsert_user(&state.db, &claims)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (org, role) = get_org_with_role(&state.db, &slug, user.id).await?;
    if role == OrgRole::Member {
        return Err(StatusCode::FORBIDDEN);
    }

    // Validate credential_type
    let valid_types = [
        "anthropic_api_key",
        "openai_api_key",
        "google_api_key",
        "git_token",
        "ssh_key",
        "custom",
    ];
    // claude_oauth is a personal subscription token that must not be shared
    // across users via org credentials. Use user credentials (/api/me/credentials)
    // instead, or use anthropic_api_key for org-wide API access.
    if req.credential_type == "claude_oauth" {
        return Err(StatusCode::BAD_REQUEST);
    }
    if !valid_types.contains(&req.credential_type.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    // custom type requires env_var_name
    if req.credential_type == "custom" && req.env_var_name.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let encrypted = credentials::encrypt_credential(&state.db, org.id, req.value.as_bytes())
        .await
        .map_err(|e| {
            tracing::error!("Failed to encrypt credential: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO org_credentials (id, org_id, name, credential_type, encrypted_value, env_var_name, created_by, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)"
    )
    .bind(id)
    .bind(org.id)
    .bind(&req.name)
    .bind(&req.credential_type)
    .bind(&encrypted)
    .bind(&req.env_var_name)
    .bind(user.id)
    .bind(req.expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create credential: {e}");
        if e.to_string().contains("duplicate key") || e.to_string().contains("unique") {
            StatusCode::CONFLICT
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    Ok((
        StatusCode::CREATED,
        Json(CredentialView {
            id,
            name: req.name,
            credential_type: req.credential_type,
            env_var_name: req.env_var_name,
            created_at: Utc::now(),
            rotated_at: None,
            expires_at: req.expires_at,
            created_by_username: user.username.clone(),
        }),
    ))
}

/// Rotate credential value
pub async fn rotate_credential(
    State(state): State<Arc<AppState>>,
    Path((slug, credential_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<RotateCredentialRequest>,
) -> Result<Json<CredentialView>, StatusCode> {
    if !credentials::is_configured() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }

    let user = db::upsert_user(&state.db, &claims)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (org, role) = get_org_with_role(&state.db, &slug, user.id).await?;
    if role == OrgRole::Member {
        return Err(StatusCode::FORBIDDEN);
    }

    // Verify credential belongs to this org
    let existing: Option<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT name, credential_type, env_var_name FROM org_credentials WHERE id = $1 AND org_id = $2"
    )
    .bind(credential_id)
    .bind(org.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (name, credential_type, env_var_name) = existing.ok_or(StatusCode::NOT_FOUND)?;

    let encrypted = credentials::encrypt_credential(&state.db, org.id, req.value.as_bytes())
        .await
        .map_err(|e| {
            tracing::error!("Failed to encrypt credential: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    sqlx::query(
        "UPDATE org_credentials SET encrypted_value = $1, rotated_at = NOW(), expires_at = $2 WHERE id = $3"
    )
    .bind(&encrypted)
    .bind(req.expires_at)
    .bind(credential_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to rotate credential: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(CredentialView {
        id: credential_id,
        name,
        credential_type,
        env_var_name,
        created_at: Utc::now(), // approximate
        rotated_at: Some(Utc::now()),
        expires_at: req.expires_at,
        created_by_username: user.username.clone(),
    }))
}

/// Delete a credential
pub async fn delete_credential(
    State(state): State<Arc<AppState>>,
    Path((slug, credential_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (org, role) = get_org_with_role(&state.db, &slug, user.id).await?;
    if role == OrgRole::Member {
        return Err(StatusCode::FORBIDDEN);
    }

    let result = sqlx::query("DELETE FROM org_credentials WHERE id = $1 AND org_id = $2")
        .bind(credential_id)
        .bind(org.id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete credential: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

// --- Helpers ---

use crate::models::Organization;

async fn get_org_with_role(
    db: &sqlx::PgPool,
    slug: &str,
    user_id: Uuid,
) -> Result<(Organization, OrgRole), StatusCode> {
    let row = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            String,
            bool,
            chrono::DateTime<chrono::Utc>,
            OrgRole,
        ),
    >(
        "SELECT o.id, o.name, o.slug, o.personal, o.created_at, om.role
         FROM organizations o
         JOIN org_members om ON om.org_id = o.id
         WHERE o.slug = $1 AND om.user_id = $2",
    )
    .bind(slug)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get org: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let (id, name, slug, personal, created_at, role) = row;
    Ok((
        Organization {
            id,
            name,
            slug,
            personal,
            created_at,
        },
        role,
    ))
}
