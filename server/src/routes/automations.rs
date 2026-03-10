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
use crate::AppState;

// --- Event Reactions ---

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct EventReactionView {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub event_type: String,
    pub aggregate_type: String,
    pub filter: serde_json::Value,
    pub action_type: String,
    pub action_config: serde_json::Value,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReactionRequest {
    pub name: String,
    pub event_type: String,
    pub aggregate_type: String,
    #[serde(default)]
    pub filter: serde_json::Value,
    pub action_type: String,
    pub action_config: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReactionRequest {
    pub name: Option<String>,
    pub event_type: Option<String>,
    pub aggregate_type: Option<String>,
    pub filter: Option<serde_json::Value>,
    pub action_type: Option<String>,
    pub action_config: Option<serde_json::Value>,
    pub enabled: Option<bool>,
}

// --- Scheduled Jobs ---

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ScheduledJobView {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub cron_expr: String,
    pub action_type: String,
    pub action_config: serde_json::Value,
    pub enabled: bool,
    pub last_run_at: Option<DateTime<Utc>>,
    pub next_run_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateScheduledJobRequest {
    pub name: String,
    pub cron_expr: String,
    pub action_type: String,
    pub action_config: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateScheduledJobRequest {
    pub name: Option<String>,
    pub cron_expr: Option<String>,
    pub action_type: Option<String>,
    pub action_config: Option<serde_json::Value>,
    pub enabled: Option<bool>,
}

// --- Helpers ---

pub fn compute_next_run(cron_expr: &str) -> Result<DateTime<Utc>, String> {
    use cron::Schedule;
    use std::str::FromStr;

    let normalized = match cron_expr.split_whitespace().count() {
        5 => format!("0 {} *", cron_expr),
        6 => format!("0 {}", cron_expr),
        7 => cron_expr.to_string(),
        _ => return Err(format!("Invalid cron expression: {}", cron_expr)),
    };

    let schedule = Schedule::from_str(&normalized).map_err(|e| e.to_string())?;
    schedule
        .upcoming(Utc)
        .next()
        .ok_or_else(|| "No upcoming schedule time".to_string())
}

pub(crate) async fn verify_project_membership(
    db: &sqlx::PgPool,
    project_id: Uuid,
    user_id: Uuid,
) -> Result<(), StatusCode> {
    let _member: (Uuid,) = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::FORBIDDEN)?;
    Ok(())
}

// --- Event Reaction Handlers ---

pub async fn list_reactions(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<EventReactionView>>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    let reactions = sqlx::query_as::<_, EventReactionView>(
        "SELECT id, project_id, name, event_type, aggregate_type, filter, action_type, action_config, enabled, created_at, updated_at
         FROM event_reactions WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list reactions: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(reactions))
}

pub async fn create_reaction(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<CreateReactionRequest>,
) -> Result<(StatusCode, Json<EventReactionView>), StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    let reaction = sqlx::query_as::<_, EventReactionView>(
        "INSERT INTO event_reactions (id, project_id, name, event_type, aggregate_type, filter, action_type, action_config, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, project_id, name, event_type, aggregate_type, filter, action_type, action_config, enabled, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(project_id)
    .bind(&body.name)
    .bind(&body.event_type)
    .bind(&body.aggregate_type)
    .bind(&body.filter)
    .bind(&body.action_type)
    .bind(&body.action_config)
    .bind(user.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create reaction: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(reaction)))
}

pub async fn update_reaction(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path((project_id, reaction_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateReactionRequest>,
) -> Result<Json<EventReactionView>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    let mut set_clauses: Vec<String> = Vec::new();
    let mut param_idx = 3u32; // $1 = reaction_id, $2 = project_id

    if let Some(ref name) = body.name {
        set_clauses.push(format!("name = ${param_idx}"));
        param_idx += 1;
        let _ = name;
    }
    if let Some(ref event_type) = body.event_type {
        set_clauses.push(format!("event_type = ${param_idx}"));
        param_idx += 1;
        let _ = event_type;
    }
    if let Some(ref aggregate_type) = body.aggregate_type {
        set_clauses.push(format!("aggregate_type = ${param_idx}"));
        param_idx += 1;
        let _ = aggregate_type;
    }
    if let Some(ref filter) = body.filter {
        set_clauses.push(format!("filter = ${param_idx}"));
        param_idx += 1;
        let _ = filter;
    }
    if let Some(ref action_type) = body.action_type {
        set_clauses.push(format!("action_type = ${param_idx}"));
        param_idx += 1;
        let _ = action_type;
    }
    if let Some(ref action_config) = body.action_config {
        set_clauses.push(format!("action_config = ${param_idx}"));
        param_idx += 1;
        let _ = action_config;
    }
    if let Some(_enabled) = body.enabled {
        set_clauses.push(format!("enabled = ${param_idx}"));
        param_idx += 1;
    }

    if set_clauses.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    set_clauses.push(format!("updated_at = ${param_idx}"));
    let _ = param_idx;

    let sql = format!(
        "UPDATE event_reactions SET {} WHERE id = $1 AND project_id = $2
         RETURNING id, project_id, name, event_type, aggregate_type, filter, action_type, action_config, enabled, created_at, updated_at",
        set_clauses.join(", ")
    );

    let mut query = sqlx::query_as::<_, EventReactionView>(&sql)
        .bind(reaction_id)
        .bind(project_id);

    if let Some(ref name) = body.name {
        query = query.bind(name);
    }
    if let Some(ref event_type) = body.event_type {
        query = query.bind(event_type);
    }
    if let Some(ref aggregate_type) = body.aggregate_type {
        query = query.bind(aggregate_type);
    }
    if let Some(ref filter) = body.filter {
        query = query.bind(filter);
    }
    if let Some(ref action_type) = body.action_type {
        query = query.bind(action_type);
    }
    if let Some(ref action_config) = body.action_config {
        query = query.bind(action_config);
    }
    if let Some(enabled) = body.enabled {
        query = query.bind(enabled);
    }
    query = query.bind(Utc::now());

    let reaction = query
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update reaction: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(reaction))
}

pub async fn delete_reaction(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path((project_id, reaction_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    let result = sqlx::query("DELETE FROM event_reactions WHERE id = $1 AND project_id = $2")
        .bind(reaction_id)
        .bind(project_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete reaction: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

// --- Scheduled Job Handlers ---

pub async fn list_scheduled_jobs(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<ScheduledJobView>>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    let jobs = sqlx::query_as::<_, ScheduledJobView>(
        "SELECT id, project_id, name, cron_expr, action_type, action_config, enabled, last_run_at, next_run_at, created_at, updated_at
         FROM scheduled_jobs WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list scheduled jobs: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(jobs))
}

pub async fn create_scheduled_job(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    Json(body): Json<CreateScheduledJobRequest>,
) -> Result<(StatusCode, Json<ScheduledJobView>), StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    let next_run_at = compute_next_run(&body.cron_expr).map_err(|e| {
        tracing::warn!("Invalid cron expression: {e}");
        StatusCode::BAD_REQUEST
    })?;

    let job = sqlx::query_as::<_, ScheduledJobView>(
        "INSERT INTO scheduled_jobs (id, project_id, name, cron_expr, action_type, action_config, next_run_at, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, project_id, name, cron_expr, action_type, action_config, enabled, last_run_at, next_run_at, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(project_id)
    .bind(&body.name)
    .bind(&body.cron_expr)
    .bind(&body.action_type)
    .bind(&body.action_config)
    .bind(next_run_at)
    .bind(user.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create scheduled job: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(job)))
}

pub async fn update_scheduled_job(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path((project_id, job_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateScheduledJobRequest>,
) -> Result<Json<ScheduledJobView>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    // If cron_expr is changing, compute new next_run_at
    let new_next_run = if let Some(ref cron_expr) = body.cron_expr {
        Some(compute_next_run(cron_expr).map_err(|e| {
            tracing::warn!("Invalid cron expression: {e}");
            StatusCode::BAD_REQUEST
        })?)
    } else {
        None
    };

    let mut set_clauses: Vec<String> = Vec::new();
    let mut param_idx = 3u32; // $1 = job_id, $2 = project_id

    if let Some(ref name) = body.name {
        set_clauses.push(format!("name = ${param_idx}"));
        param_idx += 1;
        let _ = name;
    }
    if let Some(ref cron_expr) = body.cron_expr {
        set_clauses.push(format!("cron_expr = ${param_idx}"));
        param_idx += 1;
        let _ = cron_expr;
    }
    if let Some(ref action_type) = body.action_type {
        set_clauses.push(format!("action_type = ${param_idx}"));
        param_idx += 1;
        let _ = action_type;
    }
    if let Some(ref action_config) = body.action_config {
        set_clauses.push(format!("action_config = ${param_idx}"));
        param_idx += 1;
        let _ = action_config;
    }
    if let Some(_enabled) = body.enabled {
        set_clauses.push(format!("enabled = ${param_idx}"));
        param_idx += 1;
    }
    if let Some(ref _next_run) = new_next_run {
        set_clauses.push(format!("next_run_at = ${param_idx}"));
        param_idx += 1;
    }

    if set_clauses.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    set_clauses.push(format!("updated_at = ${param_idx}"));
    let _ = param_idx;

    let sql = format!(
        "UPDATE scheduled_jobs SET {} WHERE id = $1 AND project_id = $2
         RETURNING id, project_id, name, cron_expr, action_type, action_config, enabled, last_run_at, next_run_at, created_at, updated_at",
        set_clauses.join(", ")
    );

    let mut query = sqlx::query_as::<_, ScheduledJobView>(&sql)
        .bind(job_id)
        .bind(project_id);

    if let Some(ref name) = body.name {
        query = query.bind(name);
    }
    if let Some(ref cron_expr) = body.cron_expr {
        query = query.bind(cron_expr);
    }
    if let Some(ref action_type) = body.action_type {
        query = query.bind(action_type);
    }
    if let Some(ref action_config) = body.action_config {
        query = query.bind(action_config);
    }
    if let Some(enabled) = body.enabled {
        query = query.bind(enabled);
    }
    if let Some(ref next_run) = new_next_run {
        query = query.bind(next_run);
    }
    query = query.bind(Utc::now());

    let job = query
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update scheduled job: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(job))
}

pub async fn delete_scheduled_job(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path((project_id, job_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims)
        .await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    let result = sqlx::query("DELETE FROM scheduled_jobs WHERE id = $1 AND project_id = $2")
        .bind(job_id)
        .bind(project_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete scheduled job: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}
