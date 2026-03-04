use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::models::*;
use crate::AppState;

// --- DTOs ---

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub task_type: String,
    pub title: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    pub assigned_to: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    /// None = field absent (keep current), Some(None) = explicitly null (unassign), Some(Some(id)) = assign
    #[serde(default, deserialize_with = "deserialize_optional_field")]
    pub assigned_to: Option<Option<Uuid>>,
    pub parent_id: Option<Uuid>,
    pub commit_sha: Option<String>,
}

fn deserialize_optional_field<'de, D>(deserializer: D) -> Result<Option<Option<Uuid>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<Uuid>::deserialize(deserializer)?))
}

#[derive(Debug, Deserialize)]
pub struct AddCommentRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ListTasksQuery {
    pub task_type: Option<String>,
    pub status: Option<String>,
    pub parent_id: Option<String>,
    pub assigned_to: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct TaskView {
    pub id: Uuid,
    pub session_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub task_type: TaskType,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub assigned_to: Option<Uuid>,
    pub created_by: Uuid,
    pub commit_sha: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub closed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub child_count: i64,
    pub comment_count: i64,
}

#[derive(Debug, Serialize)]
pub struct TaskDetailView {
    #[serde(flatten)]
    pub task: TaskView,
    pub comments: Vec<CommentView>,
    pub children: Vec<TaskSummaryView>,
}

#[derive(Debug, Serialize)]
pub struct TaskSummaryView {
    pub id: Uuid,
    pub task_type: TaskType,
    pub title: String,
    pub status: TaskStatus,
    pub assigned_to: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct CommentView {
    pub id: Uuid,
    pub author_id: Uuid,
    pub content: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<Task> for TaskView {
    fn from(t: Task) -> Self {
        Self {
            id: t.id,
            session_id: t.session_id,
            parent_id: t.parent_id,
            task_type: t.task_type,
            title: t.title,
            description: t.description,
            status: t.status,
            assigned_to: t.assigned_to,
            created_by: t.created_by,
            commit_sha: t.commit_sha,
            created_at: t.created_at,
            updated_at: t.updated_at,
            closed_at: t.closed_at,
            child_count: 0,
            comment_count: 0,
        }
    }
}

// --- Helpers ---

/// Find the participant for this user in the given session.
async fn resolve_participant(
    db: &sqlx::PgPool,
    session_id: Uuid,
    user_id: Uuid,
) -> Result<Participant, StatusCode> {
    sqlx::query_as::<_, Participant>(
        "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2 AND participant_type = 'human'"
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::FORBIDDEN)
}

async fn resolve_session(
    db: &sqlx::PgPool,
    code: &str,
) -> Result<Session, StatusCode> {
    sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL"
    )
    .bind(code)
    .fetch_optional(db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)
}

// --- Handlers ---

pub async fn create_task(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateTaskRequest>,
) -> Result<Json<TaskView>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let session = resolve_session(&state.db, &session_code).await?;
    let participant = resolve_participant(&state.db, session.id, user.id).await?;

    let valid_types = ["epic", "story", "task", "subtask", "bug"];
    if !valid_types.contains(&req.task_type.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, parent_id, task_type, title, description, status, assigned_to, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, NOW(), NOW())"
    )
    .bind(task_id)
    .bind(session.id)
    .bind(req.parent_id)
    .bind(&req.task_type)
    .bind(&req.title)
    .bind(&req.description)
    .bind(req.assigned_to)
    .bind(participant.id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create task: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let view: TaskView = task.into();
    // WebSocket broadcast handled by PG trigger → NOTIFY → listener
    Ok(Json(view))
}

pub async fn list_tasks(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
    Query(query): Query<ListTasksQuery>,
) -> Result<Json<Vec<TaskView>>, StatusCode> {
    let session = resolve_session(&state.db, &session_code).await?;

    // Build dynamic query
    let mut sql = String::from("SELECT * FROM tasks WHERE session_id = $1");
    let mut bind_values: Vec<String> = vec![];
    let mut idx = 2u32;

    if let Some(ref tt) = query.task_type {
        sql.push_str(&format!(" AND task_type = ${idx}"));
        bind_values.push(tt.clone());
        idx += 1;
    }
    if let Some(ref st) = query.status {
        sql.push_str(&format!(" AND status = ${idx}"));
        bind_values.push(st.clone());
        idx += 1;
    }
    if let Some(ref pid) = query.parent_id {
        if pid == "none" || pid == "null" {
            sql.push_str(" AND parent_id IS NULL");
        } else {
            sql.push_str(&format!(" AND parent_id = ${idx}"));
            bind_values.push(pid.clone());
            idx += 1;
        }
    }
    if let Some(ref at) = query.assigned_to {
        sql.push_str(&format!(" AND assigned_to = ${idx}"));
        bind_values.push(at.to_string());
        let _ = idx;
    }

    sql.push_str(" ORDER BY created_at");

    let mut q = sqlx::query_as::<_, Task>(&sql).bind(session.id);
    for val in &bind_values {
        q = q.bind(val);
    }

    let tasks = q.fetch_all(&state.db).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let task_ids: Vec<Uuid> = tasks.iter().map(|t| t.id).collect();

    // Batch-fetch child counts
    let child_counts: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT parent_id, COUNT(*) FROM tasks WHERE parent_id = ANY($1) GROUP BY parent_id"
    )
    .bind(&task_ids)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let child_map: std::collections::HashMap<Uuid, i64> = child_counts.into_iter().collect();

    // Batch-fetch comment counts
    let comment_counts: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT task_id, COUNT(*) FROM task_comments WHERE task_id = ANY($1) GROUP BY task_id"
    )
    .bind(&task_ids)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let comment_map: std::collections::HashMap<Uuid, i64> = comment_counts.into_iter().collect();

    let views: Vec<TaskView> = tasks.into_iter().map(|t| {
        let id = t.id;
        let mut view: TaskView = t.into();
        view.child_count = *child_map.get(&id).unwrap_or(&0);
        view.comment_count = *comment_map.get(&id).unwrap_or(&0);
        view
    }).collect();

    Ok(Json(views))
}

pub async fn get_task(
    State(state): State<Arc<AppState>>,
    Path((_session_code, task_id)): Path<(String, Uuid)>,
) -> Result<Json<TaskDetailView>, StatusCode> {
    let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let comments: Vec<TaskComment> = sqlx::query_as(
        "SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at"
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let children: Vec<Task> = sqlx::query_as(
        "SELECT * FROM tasks WHERE parent_id = $1 ORDER BY created_at"
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(TaskDetailView {
        task: task.into(),
        comments: comments.into_iter().map(|c| CommentView {
            id: c.id,
            author_id: c.author_id,
            content: c.content,
            created_at: c.created_at,
        }).collect(),
        children: children.into_iter().map(|t| TaskSummaryView {
            id: t.id,
            task_type: t.task_type,
            title: t.title,
            status: t.status,
            assigned_to: t.assigned_to,
        }).collect(),
    }))
}

pub async fn update_task(
    State(state): State<Arc<AppState>>,
    Path((_session_code, task_id)): Path<(String, Uuid)>,
    AuthUser(_claims): AuthUser,
    Json(req): Json<UpdateTaskRequest>,
) -> Result<Json<TaskView>, StatusCode> {
    let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let title = req.title.as_deref().unwrap_or(&task.title);
    let description = match &req.description {
        Some(d) => Some(d.as_str()),
        None => task.description.as_deref(),
    };
    let status_str = req.status.as_deref().unwrap_or(match task.status {
        TaskStatus::Open => "open",
        TaskStatus::InProgress => "in_progress",
        TaskStatus::Done => "done",
        TaskStatus::Closed => "closed",
    });
    let assigned_to = match req.assigned_to {
        Some(v) => v,            // explicitly provided (could be Some(id) or None to unassign)
        None => task.assigned_to, // field absent — keep current
    };
    let parent_id = req.parent_id.or(task.parent_id);
    let commit_sha = req.commit_sha.as_deref().or(task.commit_sha.as_deref());

    let closed_at = if (status_str == "closed" || status_str == "done") && task.closed_at.is_none() {
        Some(chrono::Utc::now())
    } else {
        task.closed_at
    };

    sqlx::query(
        "UPDATE tasks SET title = $1, description = $2, status = $3, assigned_to = $4, parent_id = $5, commit_sha = $6, closed_at = $7, updated_at = NOW() WHERE id = $8"
    )
    .bind(title)
    .bind(description)
    .bind(status_str)
    .bind(assigned_to)
    .bind(parent_id)
    .bind(commit_sha)
    .bind(closed_at)
    .bind(task_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update task: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let updated: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let view: TaskView = updated.into();
    // WebSocket broadcast handled by PG trigger → NOTIFY → listener
    Ok(Json(view))
}

pub async fn delete_task(
    State(state): State<Arc<AppState>>,
    Path((_session_code, task_id)): Path<(String, Uuid)>,
    AuthUser(_claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(task_id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        // WebSocket broadcast handled by PG trigger → NOTIFY → listener
        Ok(StatusCode::NO_CONTENT)
    }
}

pub async fn add_comment(
    State(state): State<Arc<AppState>>,
    Path((_session_code, task_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<AddCommentRequest>,
) -> Result<Json<CommentView>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Find participant in task's session
    let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let participant = resolve_participant(&state.db, task.session_id, user.id).await?;

    let comment_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    sqlx::query(
        "INSERT INTO task_comments (id, task_id, author_id, content, created_at) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(comment_id)
    .bind(task_id)
    .bind(participant.id)
    .bind(&req.content)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to add comment: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let view = CommentView {
        id: comment_id,
        author_id: participant.id,
        content: req.content,
        created_at: now,
    };

    // WebSocket broadcast handled by PG trigger → NOTIFY → listener
    Ok(Json(view))
}
