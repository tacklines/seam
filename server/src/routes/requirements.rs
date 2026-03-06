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
use crate::models::*;
use crate::AppState;

// --- DTOs ---

#[derive(Debug, Serialize)]
pub struct RequirementListView {
    pub id: Uuid,
    pub title: String,
    pub status: RequirementStatus,
    pub priority: TaskPriority,
    pub parent_id: Option<Uuid>,
    pub child_count: i64,
    pub task_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct RequirementDetailView {
    pub id: Uuid,
    pub project_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub title: String,
    pub description: String,
    pub status: RequirementStatus,
    pub priority: TaskPriority,
    pub created_by: Uuid,
    pub session_id: Option<Uuid>,
    pub children: Vec<RequirementListView>,
    pub linked_task_ids: Vec<Uuid>,
    pub task_done_count: i64,
    pub task_total_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRequirementRequest {
    pub title: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    pub priority: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRequirementRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub parent_id: Option<String>, // UUID or "none"
}

#[derive(Debug, Deserialize)]
pub struct ListRequirementsQuery {
    pub status: Option<String>,
    pub priority: Option<String>,
    pub parent_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct LinkTaskRequest {
    pub task_id: Uuid,
}

// --- Helpers ---

async fn verify_project_member(
    db: &sqlx::PgPool,
    project_id: Uuid,
    user_id: Uuid,
) -> Result<(), StatusCode> {
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2"
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

fn parse_requirement_status(s: &str) -> Result<RequirementStatus, StatusCode> {
    match s {
        "draft" => Ok(RequirementStatus::Draft),
        "active" => Ok(RequirementStatus::Active),
        "satisfied" => Ok(RequirementStatus::Satisfied),
        "archived" => Ok(RequirementStatus::Archived),
        _ => Err(StatusCode::BAD_REQUEST),
    }
}

fn validate_status_transition(current: RequirementStatus, new: RequirementStatus) -> Result<(), StatusCode> {
    let allowed = match current {
        RequirementStatus::Draft => matches!(new, RequirementStatus::Active | RequirementStatus::Archived),
        RequirementStatus::Active => matches!(new, RequirementStatus::Satisfied | RequirementStatus::Archived),
        RequirementStatus::Satisfied => matches!(new, RequirementStatus::Active | RequirementStatus::Archived),
        RequirementStatus::Archived => matches!(new, RequirementStatus::Draft),
    };
    if !allowed {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    Ok(())
}

async fn build_list_view(db: &sqlx::PgPool, req: &Requirement) -> Result<RequirementListView, StatusCode> {
    let child_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM requirements WHERE parent_id = $1"
    )
    .bind(req.id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to count children: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let task_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM requirement_tasks WHERE requirement_id = $1"
    )
    .bind(req.id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to count tasks: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(RequirementListView {
        id: req.id,
        title: req.title.clone(),
        status: req.status,
        priority: req.priority,
        parent_id: req.parent_id,
        child_count,
        task_count,
        created_at: req.created_at,
        updated_at: req.updated_at,
    })
}

// --- Handlers ---

pub async fn list_requirements(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ListRequirementsQuery>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<RequirementListView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let mut sql = "SELECT * FROM requirements WHERE project_id = $1".to_string();
    let mut bind_idx = 2u32;

    if query.status.is_some() {
        sql.push_str(&format!(" AND status = ${bind_idx}"));
        bind_idx += 1;
    }
    if query.priority.is_some() {
        sql.push_str(&format!(" AND priority = ${bind_idx}"));
        bind_idx += 1;
    }
    if query.parent_id.is_some() {
        sql.push_str(&format!(" AND parent_id = ${bind_idx}"));
    } else if query.status.is_none() && query.priority.is_none() {
        // Default: show top-level requirements
        sql.push_str(" AND parent_id IS NULL");
    }
    sql.push_str(" ORDER BY priority, created_at");

    let mut q = sqlx::query_as::<_, Requirement>(&sql).bind(project_id);
    if let Some(ref status) = query.status {
        q = q.bind(status);
    }
    if let Some(ref priority) = query.priority {
        q = q.bind(priority);
    }
    if let Some(parent_id) = query.parent_id {
        q = q.bind(parent_id);
    }

    let reqs = q.fetch_all(&state.db).await.map_err(|e| {
        tracing::error!("Failed to list requirements: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut views = Vec::new();
    for r in &reqs {
        views.push(build_list_view(&state.db, r).await?);
    }
    Ok(Json(views))
}

pub async fn get_requirement(
    State(state): State<Arc<AppState>>,
    Path((project_id, req_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<Json<RequirementDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let req = sqlx::query_as::<_, Requirement>(
        "SELECT * FROM requirements WHERE id = $1 AND project_id = $2"
    )
    .bind(req_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get requirement: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let children = sqlx::query_as::<_, Requirement>(
        "SELECT * FROM requirements WHERE parent_id = $1 ORDER BY priority, created_at"
    )
    .bind(req.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get children: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut child_views = Vec::new();
    for c in &children {
        child_views.push(build_list_view(&state.db, c).await?);
    }

    let linked_task_ids: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT task_id FROM requirement_tasks WHERE requirement_id = $1"
    )
    .bind(req.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get linked tasks: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (task_done_count, task_total_count): (i64, i64) = sqlx::query_as(
        "SELECT \
            COUNT(*) FILTER (WHERE t.status IN ('done', 'closed')) as done_count, \
            COUNT(*) as total_count \
         FROM requirement_tasks rt \
         JOIN tasks t ON t.id = rt.task_id \
         WHERE rt.requirement_id = $1"
    )
    .bind(req.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get task counts: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(RequirementDetailView {
        id: req.id,
        project_id: req.project_id,
        parent_id: req.parent_id,
        title: req.title,
        description: req.description,
        status: req.status,
        priority: req.priority,
        created_by: req.created_by,
        session_id: req.session_id,
        children: child_views,
        linked_task_ids: linked_task_ids.into_iter().map(|(id,)| id).collect(),
        task_done_count,
        task_total_count,
        created_at: req.created_at,
        updated_at: req.updated_at,
    }))
}

pub async fn create_requirement(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(body): Json<CreateRequirementRequest>,
) -> Result<(StatusCode, Json<RequirementDetailView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let priority = body.priority.as_deref().unwrap_or("medium");
    let description = body.description.as_deref().unwrap_or("");

    // Validate parent belongs to same project
    if let Some(parent_id) = body.parent_id {
        let parent_exists: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM requirements WHERE id = $1 AND project_id = $2"
        )
        .bind(parent_id)
        .bind(project_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check parent: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
        if parent_exists.is_none() {
            return Err(StatusCode::BAD_REQUEST);
        }
    }

    let req = sqlx::query_as::<_, Requirement>(
        "INSERT INTO requirements (project_id, parent_id, title, description, priority, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *"
    )
    .bind(project_id)
    .bind(body.parent_id)
    .bind(&body.title)
    .bind(description)
    .bind(priority)
    .bind(user.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create requirement: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(RequirementDetailView {
        id: req.id,
        project_id: req.project_id,
        parent_id: req.parent_id,
        title: req.title,
        description: req.description,
        status: req.status,
        priority: req.priority,
        created_by: req.created_by,
        session_id: req.session_id,
        children: vec![],
        linked_task_ids: vec![],
        task_done_count: 0,
        task_total_count: 0,
        created_at: req.created_at,
        updated_at: req.updated_at,
    })))
}

pub async fn update_requirement(
    State(state): State<Arc<AppState>>,
    Path((project_id, req_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(body): Json<UpdateRequirementRequest>,
) -> Result<Json<RequirementDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let current = sqlx::query_as::<_, Requirement>(
        "SELECT * FROM requirements WHERE id = $1 AND project_id = $2"
    )
    .bind(req_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get requirement: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let new_status = if let Some(ref s) = body.status {
        let ns = parse_requirement_status(s)?;
        validate_status_transition(current.status, ns)?;
        Some(ns)
    } else {
        None
    };

    let new_parent = if let Some(ref p) = body.parent_id {
        if p == "none" {
            Some(None)
        } else {
            let pid = Uuid::parse_str(p).map_err(|_| StatusCode::BAD_REQUEST)?;
            if pid == req_id {
                return Err(StatusCode::BAD_REQUEST);
            }
            Some(Some(pid))
        }
    } else {
        None
    };

    let has_updates = body.title.is_some() || body.description.is_some()
        || new_status.is_some() || body.priority.is_some() || new_parent.is_some();

    let req = if has_updates {
        let mut set_clauses = vec!["updated_at = NOW()".to_string()];
        let mut bind_idx = 3u32;

        if body.title.is_some() {
            set_clauses.push(format!("title = ${bind_idx}"));
            bind_idx += 1;
        }
        if body.description.is_some() {
            set_clauses.push(format!("description = ${bind_idx}"));
            bind_idx += 1;
        }
        if new_status.is_some() {
            set_clauses.push(format!("status = ${bind_idx}"));
            bind_idx += 1;
        }
        if body.priority.is_some() {
            set_clauses.push(format!("priority = ${bind_idx}"));
            bind_idx += 1;
        }
        if new_parent.is_some() {
            set_clauses.push(format!("parent_id = ${bind_idx}"));
        }

        let query = format!(
            "UPDATE requirements SET {} WHERE id = $1 AND project_id = $2 RETURNING *",
            set_clauses.join(", ")
        );

        let mut q = sqlx::query_as::<_, Requirement>(&query)
            .bind(req_id)
            .bind(project_id);

        if let Some(ref title) = body.title {
            q = q.bind(title);
        }
        if let Some(ref desc) = body.description {
            q = q.bind(desc);
        }
        if let Some(status) = new_status {
            let s = match status {
                RequirementStatus::Draft => "draft",
                RequirementStatus::Active => "active",
                RequirementStatus::Satisfied => "satisfied",
                RequirementStatus::Archived => "archived",
            };
            q = q.bind(s);
        }
        if let Some(ref priority) = body.priority {
            q = q.bind(priority);
        }
        if let Some(parent) = new_parent {
            q = q.bind(parent);
        }

        q.fetch_one(&state.db).await.map_err(|e| {
            tracing::error!("Failed to update requirement: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    } else {
        current
    };

    let linked_task_ids: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT task_id FROM requirement_tasks WHERE requirement_id = $1"
    )
    .bind(req.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get linked tasks: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (task_done_count, task_total_count): (i64, i64) = sqlx::query_as(
        "SELECT \
            COUNT(*) FILTER (WHERE t.status IN ('done', 'closed')) as done_count, \
            COUNT(*) as total_count \
         FROM requirement_tasks rt \
         JOIN tasks t ON t.id = rt.task_id \
         WHERE rt.requirement_id = $1"
    )
    .bind(req.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get task counts: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(RequirementDetailView {
        id: req.id,
        project_id: req.project_id,
        parent_id: req.parent_id,
        title: req.title,
        description: req.description,
        status: req.status,
        priority: req.priority,
        created_by: req.created_by,
        session_id: req.session_id,
        children: vec![],
        linked_task_ids: linked_task_ids.into_iter().map(|(id,)| id).collect(),
        task_done_count,
        task_total_count,
        created_at: req.created_at,
        updated_at: req.updated_at,
    }))
}

pub async fn delete_requirement(
    State(state): State<Arc<AppState>>,
    Path((project_id, req_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let result = sqlx::query(
        "DELETE FROM requirements WHERE id = $1 AND project_id = $2"
    )
    .bind(req_id)
    .bind(project_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to delete requirement: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn link_task(
    State(state): State<Arc<AppState>>,
    Path((project_id, req_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(body): Json<LinkTaskRequest>,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    // Verify both exist in the same project
    let req_exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM requirements WHERE id = $1 AND project_id = $2"
    )
    .bind(req_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if req_exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let task_exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM tasks WHERE id = $1 AND project_id = $2"
    )
    .bind(body.task_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if task_exists.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }

    sqlx::query(
        "INSERT INTO requirement_tasks (requirement_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
    )
    .bind(req_id)
    .bind(body.task_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to link task: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::CREATED)
}

pub async fn unlink_task(
    State(state): State<Arc<AppState>>,
    Path((project_id, req_id, task_id)): Path<(Uuid, Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    sqlx::query(
        "DELETE FROM requirement_tasks WHERE requirement_id = $1 AND task_id = $2"
    )
    .bind(req_id)
    .bind(task_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to unlink task: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::NO_CONTENT)
}
