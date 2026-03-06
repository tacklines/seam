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
use crate::events;
use crate::models::*;
use crate::AppState;

// --- DTOs ---

#[derive(Debug, Serialize)]
pub struct RequestListView {
    pub id: Uuid,
    pub title: String,
    pub status: RequestStatus,
    pub author_id: Uuid,
    pub requirement_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct RequestDetailView {
    pub id: Uuid,
    pub project_id: Uuid,
    pub session_id: Option<Uuid>,
    pub author_id: Uuid,
    pub title: String,
    pub body: String,
    pub status: RequestStatus,
    pub analysis: Option<String>,
    pub linked_requirement_ids: Vec<Uuid>,
    pub requirement_satisfied_count: i64,
    pub requirement_total_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRequestBody {
    pub title: String,
    pub body: String,
    pub session_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRequestBody {
    pub title: Option<String>,
    pub body: Option<String>,
    pub status: Option<String>,
    pub analysis: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListRequestsQuery {
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LinkRequirementBody {
    pub requirement_id: Uuid,
}

// --- Helpers ---

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

fn parse_request_status(s: &str) -> Result<RequestStatus, StatusCode> {
    match s {
        "pending" => Ok(RequestStatus::Pending),
        "analyzing" => Ok(RequestStatus::Analyzing),
        "decomposed" => Ok(RequestStatus::Decomposed),
        "archived" => Ok(RequestStatus::Archived),
        _ => Err(StatusCode::BAD_REQUEST),
    }
}

fn validate_request_status_transition(
    current: RequestStatus,
    new: RequestStatus,
) -> Result<(), StatusCode> {
    let allowed = match current {
        RequestStatus::Pending => {
            matches!(new, RequestStatus::Analyzing | RequestStatus::Archived)
        }
        RequestStatus::Analyzing => {
            matches!(
                new,
                RequestStatus::Decomposed | RequestStatus::Pending | RequestStatus::Archived
            )
        }
        RequestStatus::Decomposed => {
            matches!(new, RequestStatus::Archived | RequestStatus::Pending)
        }
        RequestStatus::Archived => matches!(new, RequestStatus::Pending),
    };
    if !allowed {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    Ok(())
}

/// Batch-fetch requirement_count for a set of request IDs.
async fn batch_requirement_counts(
    db: &sqlx::PgPool,
    ids: &[Uuid],
) -> Result<std::collections::HashMap<Uuid, i64>, StatusCode> {
    if ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let counts: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT request_id, COUNT(*) FROM request_requirements WHERE request_id = ANY($1) GROUP BY request_id"
    )
    .bind(ids)
    .fetch_all(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to batch count requirements: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut result: std::collections::HashMap<Uuid, i64> = std::collections::HashMap::new();
    for (id, count) in counts {
        result.insert(id, count);
    }
    Ok(result)
}

// --- Handlers ---

pub async fn list_requests(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ListRequestsQuery>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<RequestListView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let reqs = if let Some(ref status) = query.status {
        sqlx::query_as::<_, Request>(
            "SELECT * FROM requests WHERE project_id = $1 AND status = $2 ORDER BY created_at DESC",
        )
        .bind(project_id)
        .bind(status)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, Request>(
            "SELECT * FROM requests WHERE project_id = $1 ORDER BY created_at DESC",
        )
        .bind(project_id)
        .fetch_all(&state.db)
        .await
    }
    .map_err(|e| {
        tracing::error!("Failed to list requests: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let ids: Vec<Uuid> = reqs.iter().map(|r| r.id).collect();
    let counts = batch_requirement_counts(&state.db, &ids).await?;

    let views: Vec<RequestListView> = reqs.iter().map(|r| {
        let requirement_count = counts.get(&r.id).copied().unwrap_or(0);
        RequestListView {
            id: r.id,
            title: r.title.clone(),
            status: r.status,
            author_id: r.author_id,
            requirement_count,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }).collect();
    Ok(Json(views))
}

pub async fn get_request(
    State(state): State<Arc<AppState>>,
    Path((project_id, request_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<Json<RequestDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let req = sqlx::query_as::<_, Request>(
        "SELECT * FROM requests WHERE id = $1 AND project_id = $2",
    )
    .bind(request_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get request: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let linked_requirement_ids: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT requirement_id FROM request_requirements WHERE request_id = $1",
    )
    .bind(req.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get linked requirements: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (requirement_satisfied_count, requirement_total_count): (i64, i64) = sqlx::query_as(
        "SELECT \
            COUNT(*) FILTER (WHERE r.status = 'satisfied') as satisfied_count, \
            COUNT(*) as total_count \
         FROM request_requirements rr \
         JOIN requirements r ON r.id = rr.requirement_id \
         WHERE rr.request_id = $1"
    )
    .bind(req.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get requirement counts: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(RequestDetailView {
        id: req.id,
        project_id: req.project_id,
        session_id: req.session_id,
        author_id: req.author_id,
        title: req.title,
        body: req.body,
        status: req.status,
        analysis: req.analysis,
        linked_requirement_ids: linked_requirement_ids.into_iter().map(|(id,)| id).collect(),
        requirement_satisfied_count,
        requirement_total_count,
        created_at: req.created_at,
        updated_at: req.updated_at,
    }))
}

pub async fn create_request(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(body): Json<CreateRequestBody>,
) -> Result<(StatusCode, Json<RequestDetailView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let req = sqlx::query_as::<_, Request>(
        "INSERT INTO requests (project_id, session_id, author_id, title, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *",
    )
    .bind(project_id)
    .bind(body.session_id)
    .bind(user.id)
    .bind(&body.title)
    .bind(&body.body)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create request: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let event = events::DomainEvent::new(
        "request_created",
        "request",
        req.id,
        Some(user.id),
        serde_json::json!({
            "project_id": project_id,
            "request_id": req.id,
            "title": req.title,
            "body": req.body,
            "session_id": req.session_id,
        }),
    );
    if let Err(e) = events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit request_created event: {e}");
    }

    Ok((
        StatusCode::CREATED,
        Json(RequestDetailView {
            id: req.id,
            project_id: req.project_id,
            session_id: req.session_id,
            author_id: req.author_id,
            title: req.title,
            body: req.body,
            status: req.status,
            analysis: req.analysis,
            linked_requirement_ids: vec![],
            requirement_satisfied_count: 0,
            requirement_total_count: 0,
            created_at: req.created_at,
            updated_at: req.updated_at,
        }),
    ))
}

pub async fn update_request(
    State(state): State<Arc<AppState>>,
    Path((project_id, request_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(body): Json<UpdateRequestBody>,
) -> Result<Json<RequestDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let current = sqlx::query_as::<_, Request>(
        "SELECT * FROM requests WHERE id = $1 AND project_id = $2",
    )
    .bind(request_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get request: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    if let Some(ref s) = body.status {
        let new_status = parse_request_status(s)?;
        validate_request_status_transition(current.status, new_status)?;
    }

    let has_updates =
        body.title.is_some() || body.body.is_some() || body.status.is_some() || body.analysis.is_some();

    let req = if has_updates {
        let mut set_clauses = vec!["updated_at = NOW()".to_string()];
        let mut bind_idx = 3u32;

        if body.title.is_some() {
            set_clauses.push(format!("title = ${bind_idx}"));
            bind_idx += 1;
        }
        if body.body.is_some() {
            set_clauses.push(format!("body = ${bind_idx}"));
            bind_idx += 1;
        }
        if body.status.is_some() {
            set_clauses.push(format!("status = ${bind_idx}"));
            bind_idx += 1;
        }
        if body.analysis.is_some() {
            set_clauses.push(format!("analysis = ${bind_idx}"));
        }

        let query = format!(
            "UPDATE requests SET {} WHERE id = $1 AND project_id = $2 RETURNING *",
            set_clauses.join(", ")
        );

        let mut q = sqlx::query_as::<_, Request>(&query)
            .bind(request_id)
            .bind(project_id);

        if let Some(ref title) = body.title {
            q = q.bind(title);
        }
        if let Some(ref body_text) = body.body {
            q = q.bind(body_text);
        }
        if let Some(ref status) = body.status {
            q = q.bind(status);
        }
        if let Some(ref analysis) = body.analysis {
            q = q.bind(analysis);
        }

        q.fetch_one(&state.db).await.map_err(|e| {
            tracing::error!("Failed to update request: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    } else {
        current
    };

    let linked_requirement_ids: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT requirement_id FROM request_requirements WHERE request_id = $1",
    )
    .bind(req.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get linked requirements: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (requirement_satisfied_count, requirement_total_count): (i64, i64) = sqlx::query_as(
        "SELECT \
            COUNT(*) FILTER (WHERE r.status = 'satisfied') as satisfied_count, \
            COUNT(*) as total_count \
         FROM request_requirements rr \
         JOIN requirements r ON r.id = rr.requirement_id \
         WHERE rr.request_id = $1"
    )
    .bind(req.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get requirement counts: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(RequestDetailView {
        id: req.id,
        project_id: req.project_id,
        session_id: req.session_id,
        author_id: req.author_id,
        title: req.title,
        body: req.body,
        status: req.status,
        analysis: req.analysis,
        linked_requirement_ids: linked_requirement_ids.into_iter().map(|(id,)| id).collect(),
        requirement_satisfied_count,
        requirement_total_count,
        created_at: req.created_at,
        updated_at: req.updated_at,
    }))
}

pub async fn delete_request(
    State(state): State<Arc<AppState>>,
    Path((project_id, request_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let result =
        sqlx::query("DELETE FROM requests WHERE id = $1 AND project_id = $2")
            .bind(request_id)
            .bind(project_id)
            .execute(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to delete request: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn link_requirement(
    State(state): State<Arc<AppState>>,
    Path((project_id, request_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(body): Json<LinkRequirementBody>,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    // Verify request exists in this project
    let req_exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM requests WHERE id = $1 AND project_id = $2",
    )
    .bind(request_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if req_exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    // Verify requirement exists in this project
    let req_req_exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM requirements WHERE id = $1 AND project_id = $2",
    )
    .bind(body.requirement_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if req_req_exists.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }

    sqlx::query(
        "INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(request_id)
    .bind(body.requirement_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to link requirement to request: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::CREATED)
}

pub async fn unlink_requirement(
    State(state): State<Arc<AppState>>,
    Path((project_id, request_id, requirement_id)): Path<(Uuid, Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    sqlx::query(
        "DELETE FROM request_requirements WHERE request_id = $1 AND requirement_id = $2",
    )
    .bind(request_id)
    .bind(requirement_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to unlink requirement from request: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(StatusCode::NO_CONTENT)
}
