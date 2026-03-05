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

pub async fn resolve_project(
    db: &sqlx::PgPool,
    project_id: Uuid,
) -> Result<Project, StatusCode> {
    sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = $1")
        .bind(project_id)
        .fetch_optional(db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)
}

fn task_summary_view(t: &Task, ticket_prefix: &str) -> TaskSummaryView {
    TaskSummaryView {
        id: t.id,
        ticket_id: format!("{}-{}", ticket_prefix, t.ticket_number),
        task_type: t.task_type,
        title: t.title.clone(),
        status: t.status,
        assigned_to: t.assigned_to,
    }
}

// --- DTOs ---

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub task_type: String,
    pub title: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    pub assigned_to: Option<Uuid>,
    pub priority: Option<String>,
    pub complexity: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    pub complexity: Option<String>,
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
    pub priority: Option<String>,
    pub complexity: Option<String>,
    pub parent_id: Option<String>,
    pub assigned_to: Option<Uuid>,
    pub search: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskView {
    pub id: Uuid,
    pub session_id: Option<Uuid>,
    pub project_id: Uuid,
    pub ticket_number: i32,
    pub ticket_id: String,
    pub parent_id: Option<Uuid>,
    pub task_type: TaskType,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub complexity: TaskComplexity,
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
    pub parent: Option<TaskSummaryView>,
    pub comments: Vec<CommentView>,
    pub children: Vec<TaskSummaryView>,
    pub blocks: Vec<TaskSummaryView>,
    pub blocked_by: Vec<TaskSummaryView>,
}

#[derive(Debug, Deserialize)]
pub struct AddDependencyRequest {
    pub blocked_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct DependencyView {
    pub id: Uuid,
    pub blocker: TaskSummaryView,
    pub blocked: TaskSummaryView,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct TaskSummaryView {
    pub id: Uuid,
    pub ticket_id: String,
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

impl TaskView {
    fn from_task(t: Task, ticket_prefix: &str) -> Self {
        let ticket_id = format!("{}-{}", ticket_prefix, t.ticket_number);
        Self {
            id: t.id,
            session_id: t.session_id,
            project_id: t.project_id,
            ticket_number: t.ticket_number,
            ticket_id,
            parent_id: t.parent_id,
            task_type: t.task_type,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            complexity: t.complexity,
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

pub async fn resolve_session_pub(
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
    let session = resolve_session_pub(&state.db, &session_code).await?;
    let participant = resolve_participant(&state.db, session.id, user.id).await?;

    let valid_types = ["epic", "story", "task", "subtask", "bug"];
    if !valid_types.contains(&req.task_type.as_str()) {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Atomically allocate next ticket number
    let (ticket_number, ticket_prefix): (i32, String) = sqlx::query_as(
        "UPDATE projects SET next_ticket_number = next_ticket_number + 1 WHERE id = $1 RETURNING next_ticket_number - 1, ticket_prefix"
    )
    .bind(session.project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to allocate ticket number: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let priority = req.priority.as_deref().unwrap_or("medium");
    let complexity = req.complexity.as_deref().unwrap_or("medium");

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, parent_id, task_type, title, description, status, priority, complexity, assigned_to, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11, $12, NOW(), NOW())"
    )
    .bind(task_id)
    .bind(session.id)
    .bind(session.project_id)
    .bind(ticket_number)
    .bind(req.parent_id)
    .bind(&req.task_type)
    .bind(&req.title)
    .bind(&req.description)
    .bind(priority)
    .bind(complexity)
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

    let ticket_id = format!("{}-{}", ticket_prefix, ticket_number);
    super::activity::record_activity(
        &state.db,
        session.project_id,
        Some(session.id),
        participant.id,
        "task_created",
        "task",
        task_id,
        &format!("created {} {}", req.task_type, ticket_id),
        serde_json::json!({ "ticket_id": ticket_id, "task_type": req.task_type, "title": req.title }),
    ).await;

    // Emit domain event
    let event = crate::events::DomainEvent::new(
        "task.created",
        "task",
        task_id,
        Some(participant.id),
        serde_json::json!({
            "task_type": req.task_type,
            "title": req.title,
            "ticket_id": ticket_id,
            "priority": priority,
            "complexity": complexity,
        }),
    );
    if let Err(e) = crate::events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    let view = TaskView::from_task(task, &ticket_prefix);
    Ok(Json(view))
}

pub async fn list_tasks(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
    Query(query): Query<ListTasksQuery>,
) -> Result<Json<Vec<TaskView>>, StatusCode> {
    let session = resolve_session_pub(&state.db, &session_code).await?;
    let project = resolve_project(&state.db, session.project_id).await?;

    // Query by project (tasks persist across sessions)
    let mut sql = String::from("SELECT * FROM tasks WHERE project_id = $1");
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
    if let Some(ref pr) = query.priority {
        sql.push_str(&format!(" AND priority = ${idx}"));
        bind_values.push(pr.clone());
        idx += 1;
    }
    if let Some(ref cx) = query.complexity {
        sql.push_str(&format!(" AND complexity = ${idx}"));
        bind_values.push(cx.clone());
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
        idx += 1;
    }
    if let Some(ref search) = query.search {
        sql.push_str(&format!(
            " AND (title ILIKE ${idx} OR description ILIKE ${idx})"
        ));
        bind_values.push(format!("%{search}%"));
        let _ = idx;
    }

    sql.push_str(" ORDER BY created_at");

    let mut q = sqlx::query_as::<_, Task>(&sql).bind(project.id);
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
        let mut view = TaskView::from_task(t, &project.ticket_prefix);
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

    let project = resolve_project(&state.db, task.project_id).await?;
    let prefix = &project.ticket_prefix;

    let parent: Option<Task> = if let Some(pid) = task.parent_id {
        sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
            .bind(pid)
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        None
    };

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

    // Fetch tasks this task blocks (this task is the blocker)
    let blocks: Vec<Task> = sqlx::query_as(
        "SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocked_id = t.id WHERE d.blocker_id = $1 ORDER BY t.created_at"
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Fetch tasks that block this task (this task is blocked)
    let blocked_by: Vec<Task> = sqlx::query_as(
        "SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocker_id = t.id WHERE d.blocked_id = $1 ORDER BY t.created_at"
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Ok(Json(TaskDetailView {
        task: TaskView::from_task(task, prefix),
        parent: parent.map(|p| task_summary_view(&p, prefix)),
        comments: comments.into_iter().map(|c| CommentView {
            id: c.id,
            author_id: c.author_id,
            content: c.content,
            created_at: c.created_at,
        }).collect(),
        children: children.iter().map(|t| task_summary_view(t, prefix)).collect(),
        blocks: blocks.iter().map(|t| task_summary_view(t, prefix)).collect(),
        blocked_by: blocked_by.iter().map(|t| task_summary_view(t, prefix)).collect(),
    }))
}

pub async fn update_task(
    State(state): State<Arc<AppState>>,
    Path((_session_code, task_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpdateTaskRequest>,
) -> Result<Json<TaskView>, StatusCode> {
    let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let project = resolve_project(&state.db, task.project_id).await?;

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
    let priority_str = req.priority.as_deref().unwrap_or(match task.priority {
        TaskPriority::Critical => "critical",
        TaskPriority::High => "high",
        TaskPriority::Medium => "medium",
        TaskPriority::Low => "low",
    });
    let complexity_str = req.complexity.as_deref().unwrap_or(match task.complexity {
        TaskComplexity::Xl => "xl",
        TaskComplexity::Large => "large",
        TaskComplexity::Medium => "medium",
        TaskComplexity::Small => "small",
        TaskComplexity::Trivial => "trivial",
    });
    let assigned_to = match req.assigned_to {
        Some(v) => v,
        None => task.assigned_to,
    };
    let parent_id = req.parent_id.or(task.parent_id);
    let commit_sha = req.commit_sha.as_deref().or(task.commit_sha.as_deref());

    let closed_at = if (status_str == "closed" || status_str == "done") && task.closed_at.is_none() {
        Some(chrono::Utc::now())
    } else {
        task.closed_at
    };

    sqlx::query(
        "UPDATE tasks SET title = $1, description = $2, status = $3, priority = $4, complexity = $5, assigned_to = $6, parent_id = $7, commit_sha = $8, closed_at = $9, updated_at = NOW() WHERE id = $10"
    )
    .bind(title)
    .bind(description)
    .bind(status_str)
    .bind(priority_str)
    .bind(complexity_str)
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

    // Record activity for meaningful changes
    let ticket_id = format!("{}-{}", project.ticket_prefix, task.ticket_number);
    let event_type = if req.status.is_some() && (status_str == "closed" || status_str == "done") && task.closed_at.is_none() {
        "task_closed"
    } else {
        "task_updated"
    };

    // Find the actor — try to resolve participant from auth user
    if let Ok(user) = crate::db::upsert_user(&state.db, &claims).await {
        // Find any participant for this user in the project's sessions
        if let Ok(actor) = sqlx::query_scalar::<_, Uuid>(
            "SELECT p.id FROM participants p JOIN sessions s ON s.id = p.session_id WHERE s.project_id = $1 AND p.user_id = $2 LIMIT 1"
        )
        .bind(project.id)
        .bind(user.id)
        .fetch_one(&state.db)
        .await
        {
            let mut changes = serde_json::Map::new();
            if req.status.is_some() { changes.insert("status".into(), serde_json::json!(status_str)); }
            if req.priority.is_some() { changes.insert("priority".into(), serde_json::json!(priority_str)); }
            if req.title.is_some() { changes.insert("title".into(), serde_json::json!(title)); }
            if req.assigned_to.is_some() { changes.insert("assigned_to".into(), serde_json::json!(assigned_to)); }

            let summary = if event_type == "task_closed" {
                format!("closed {}", ticket_id)
            } else {
                let fields: Vec<&str> = changes.keys().map(|k| k.as_str()).collect();
                format!("updated {} ({})", ticket_id, fields.join(", "))
            };

            super::activity::record_activity(
                &state.db,
                project.id,
                task.session_id,
                actor,
                event_type,
                "task",
                task_id,
                &summary,
                serde_json::Value::Object(changes.clone()),
            ).await;

            // Emit domain event
            let domain_event_type = if event_type == "task_closed" {
                "task.closed"
            } else {
                "task.updated"
            };
            let domain_event = crate::events::DomainEvent::new(
                domain_event_type,
                "task",
                task_id,
                Some(actor),
                serde_json::Value::Object(changes),
            );
            if let Err(e) = crate::events::emit(&state.db, &domain_event).await {
                tracing::warn!("Failed to emit domain event: {e}");
            }
        }
    }

    let view = TaskView::from_task(updated, &project.ticket_prefix);
    Ok(Json(view))
}

pub async fn delete_task(
    State(state): State<Arc<AppState>>,
    Path((_session_code, task_id)): Path<(String, Uuid)>,
    AuthUser(_claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    // Emit domain event before deleting (need task data)
    let task: Option<Task> = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(ref t) = task {
        let event = crate::events::DomainEvent::new(
            "task.deleted",
            "task",
            task_id,
            None,
            serde_json::json!({
                "project_id": t.project_id,
                "title": t.title,
                "ticket_number": t.ticket_number,
            }),
        );
        if let Err(e) = crate::events::emit(&state.db, &event).await {
            tracing::warn!("Failed to emit domain event: {e}");
        }
    }

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

    // Verify task exists
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)")
        .bind(task_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !exists {
        return Err(StatusCode::NOT_FOUND);
    }

    let session = resolve_session_pub(&state.db, &_session_code).await?;
    let participant = resolve_participant(&state.db, session.id, user.id).await?;

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

    // Extract @mentions and create records
    let mentioned = extract_and_record_mentions(
        &state.db, &state.connections, &session, comment_id, task_id, &req.content, participant.id,
    ).await;

    // Record activity
    let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let project = super::tasks::resolve_project(&state.db, task.project_id).await?;
    let ticket_id = format!("{}-{}", project.ticket_prefix, task.ticket_number);
    super::activity::record_activity(
        &state.db,
        task.project_id,
        task.session_id,
        participant.id,
        "comment_added",
        "comment",
        comment_id,
        &format!("commented on {}", ticket_id),
        serde_json::json!({ "ticket_id": ticket_id, "preview": &req.content[..req.content.len().min(100)], "mentions": mentioned }),
    ).await;

    // Emit domain event
    let comment_event = crate::events::DomainEvent::new(
        "comment.added",
        "task",
        task_id,
        Some(participant.id),
        serde_json::json!({
            "comment_id": comment_id,
            "preview": &req.content[..req.content.len().min(100)],
            "mentions": mentioned,
        }),
    );
    if let Err(e) = crate::events::emit(&state.db, &comment_event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    let view = CommentView {
        id: comment_id,
        author_id: participant.id,
        content: req.content,
        created_at: now,
    };

    Ok(Json(view))
}

// --- Unread mentions endpoints ---

#[derive(Debug, Serialize)]
pub struct UnreadMentionView {
    pub id: Uuid,
    pub comment_id: Uuid,
    pub task_id: Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_unread_mentions(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<UnreadMentionView>>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let session = resolve_session_pub(&state.db, &session_code).await?;
    let participant = resolve_participant(&state.db, session.id, user.id).await?;

    let mentions: Vec<(Uuid, Uuid, Uuid, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT id, comment_id, task_id, created_at FROM unread_mentions WHERE participant_id = $1 AND session_id = $2 ORDER BY created_at DESC"
    )
    .bind(participant.id)
    .bind(session.id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let views: Vec<UnreadMentionView> = mentions.into_iter().map(|(id, comment_id, task_id, created_at)| {
        UnreadMentionView { id, comment_id, task_id, created_at }
    }).collect();

    Ok(Json(views))
}

pub async fn clear_unread_mentions(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let session = resolve_session_pub(&state.db, &session_code).await?;
    let participant = resolve_participant(&state.db, session.id, user.id).await?;

    sqlx::query("DELETE FROM unread_mentions WHERE participant_id = $1 AND session_id = $2")
        .bind(participant.id)
        .bind(session.id)
        .execute(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::NO_CONTENT)
}

// --- Dependency endpoints ---

pub async fn add_dependency(
    State(state): State<Arc<AppState>>,
    Path((_session_code, blocker_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<AddDependencyRequest>,
) -> Result<Json<DependencyView>, StatusCode> {
    if blocker_id == req.blocked_id {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Verify both tasks exist and are in the same project
    let blocker: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(blocker_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let blocked: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(req.blocked_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if blocker.project_id != blocked.project_id {
        return Err(StatusCode::BAD_REQUEST);
    }

    let project = resolve_project(&state.db, blocker.project_id).await?;

    // Check for circular dependency (blocked_id already blocks blocker_id directly or transitively)
    let would_cycle: bool = sqlx::query_scalar(
        "WITH RECURSIVE chain AS (
            SELECT blocker_id FROM task_dependencies WHERE blocked_id = $1
            UNION
            SELECT d.blocker_id FROM task_dependencies d JOIN chain c ON d.blocked_id = c.blocker_id
        )
        SELECT EXISTS(SELECT 1 FROM chain WHERE blocker_id = $2)"
    )
    .bind(blocker_id)
    .bind(req.blocked_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if would_cycle {
        return Err(StatusCode::CONFLICT);
    }

    let dep_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    sqlx::query(
        "INSERT INTO task_dependencies (id, blocker_id, blocked_id, created_at) VALUES ($1, $2, $3, $4)"
    )
    .bind(dep_id)
    .bind(blocker_id)
    .bind(req.blocked_id)
    .bind(now)
    .execute(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("unique_dependency") {
            StatusCode::CONFLICT
        } else {
            tracing::error!("Failed to add dependency: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    })?;

    let prefix = &project.ticket_prefix;

    // Record activity
    let blocker_ticket = format!("{}-{}", prefix, blocker.ticket_number);
    let blocked_ticket = format!("{}-{}", prefix, blocked.ticket_number);

    if let Ok(user) = crate::db::upsert_user(&state.db, &claims).await {
        if let Ok(actor) = sqlx::query_scalar::<_, Uuid>(
            "SELECT p.id FROM participants p JOIN sessions s ON s.id = p.session_id WHERE s.project_id = $1 AND p.user_id = $2 LIMIT 1"
        )
        .bind(project.id)
        .bind(user.id)
        .fetch_one(&state.db)
        .await
        {
            super::activity::record_activity(
                &state.db,
                project.id,
                blocker.session_id,
                actor,
                "dependency_added",
                "task",
                blocker_id,
                &format!("{} now blocks {}", blocker_ticket, blocked_ticket),
                serde_json::json!({ "blocker_ticket": blocker_ticket, "blocked_ticket": blocked_ticket }),
            ).await;
        }
    }

    Ok(Json(DependencyView {
        id: dep_id,
        blocker: task_summary_view(&blocker, prefix),
        blocked: task_summary_view(&blocked, prefix),
        created_at: now,
    }))
}

pub async fn remove_dependency(
    State(state): State<Arc<AppState>>,
    Path((_session_code, blocker_id, blocked_id)): Path<(String, Uuid, Uuid)>,
    AuthUser(_claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query(
        "DELETE FROM task_dependencies WHERE blocker_id = $1 AND blocked_id = $2"
    )
    .bind(blocker_id)
    .bind(blocked_id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        Err(StatusCode::NOT_FOUND)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

/// Extract @mentions from comment text, insert into comment_mentions + unread_mentions,
/// and send targeted WebSocket notifications to mentioned participants.
async fn extract_and_record_mentions(
    db: &sqlx::PgPool,
    connections: &crate::ws::ConnectionManager,
    session: &Session,
    comment_id: Uuid,
    task_id: Uuid,
    content: &str,
    author_id: Uuid,
) -> Vec<String> {
    // Extract unique @mention names from the content
    let mention_re = regex::Regex::new(r"@([\w.\-]+(?:\s[\w.\-]+)?)").unwrap();
    let mention_names: Vec<String> = mention_re
        .captures_iter(content)
        .map(|c| c[1].to_string())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    if mention_names.is_empty() {
        return vec![];
    }

    // Resolve display names to participant IDs in this session
    let participants: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, display_name FROM participants WHERE session_id = $1"
    )
    .bind(session.id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let mut mentioned_ids = Vec::new();
    for (pid, name) in &participants {
        if *pid == author_id {
            continue; // Don't mention yourself
        }
        let name_lower = name.to_lowercase();
        for mention in &mention_names {
            if name_lower == mention.to_lowercase()
                || name_lower.starts_with(&mention.to_lowercase())
            {
                mentioned_ids.push(*pid);
                break;
            }
        }
    }

    let mut mentioned_names = Vec::new();
    for pid in &mentioned_ids {
        // Insert comment_mention
        let _ = sqlx::query(
            "INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
        )
        .bind(comment_id)
        .bind(pid)
        .execute(db)
        .await;

        // Insert unread_mention
        let _ = sqlx::query(
            "INSERT INTO unread_mentions (participant_id, comment_id, task_id, session_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING"
        )
        .bind(pid)
        .bind(comment_id)
        .bind(task_id)
        .bind(session.id)
        .execute(db)
        .await;

        // Send targeted WebSocket notification
        connections.send_to_participant(&session.code, &pid.to_string(), &serde_json::json!({
            "type": "mentioned",
            "taskId": task_id.to_string(),
            "commentId": comment_id.to_string(),
            "authorId": author_id.to_string(),
        })).await;

        if let Some(name) = participants.iter().find(|(id, _)| id == pid).map(|(_, n)| n) {
            mentioned_names.push(name.clone());
        }
    }

    mentioned_names
}

// --- Project-scoped dependency graph ---

#[derive(Debug, Serialize)]
pub struct GraphEdge {
    pub blocker_id: Uuid,
    pub blocked_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct DependencyGraphView {
    pub tasks: Vec<TaskView>,
    pub edges: Vec<GraphEdge>,
}

pub async fn get_project_dependency_graph(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(_claims): AuthUser,
) -> Result<Json<DependencyGraphView>, StatusCode> {
    let project = resolve_project(&state.db, project_id).await?;

    let tasks: Vec<Task> = sqlx::query_as(
        "SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at"
    )
    .bind(project.id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let task_ids: Vec<Uuid> = tasks.iter().map(|t| t.id).collect();

    let edges: Vec<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT blocker_id, blocked_id FROM task_dependencies WHERE blocker_id = ANY($1) AND blocked_id = ANY($1)"
    )
    .bind(&task_ids)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let views: Vec<TaskView> = tasks.into_iter().map(|t| {
        TaskView::from_task(t, &project.ticket_prefix)
    }).collect();

    Ok(Json(DependencyGraphView {
        tasks: views,
        edges: edges.into_iter().map(|(blocker_id, blocked_id)| GraphEdge { blocker_id, blocked_id }).collect(),
    }))
}

// --- Project-scoped handlers (read-only, no session required) ---

pub async fn list_project_tasks(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ListTasksQuery>,
    AuthUser(_claims): AuthUser,
) -> Result<Json<Vec<TaskView>>, StatusCode> {
    let project = resolve_project(&state.db, project_id).await?;

    let mut sql = String::from("SELECT * FROM tasks WHERE project_id = $1");
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
    if let Some(ref pr) = query.priority {
        sql.push_str(&format!(" AND priority = ${idx}"));
        bind_values.push(pr.clone());
        idx += 1;
    }
    if let Some(ref cx) = query.complexity {
        sql.push_str(&format!(" AND complexity = ${idx}"));
        bind_values.push(cx.clone());
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
        idx += 1;
    }
    if let Some(ref search) = query.search {
        sql.push_str(&format!(
            " AND (title ILIKE ${idx} OR description ILIKE ${idx})"
        ));
        bind_values.push(format!("%{search}%"));
        let _ = idx;
    }

    sql.push_str(" ORDER BY created_at");

    let mut q = sqlx::query_as::<_, Task>(&sql).bind(project.id);
    for val in &bind_values {
        q = q.bind(val);
    }

    let tasks = q.fetch_all(&state.db).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let task_ids: Vec<Uuid> = tasks.iter().map(|t| t.id).collect();

    let child_counts: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT parent_id, COUNT(*) FROM tasks WHERE parent_id = ANY($1) GROUP BY parent_id"
    )
    .bind(&task_ids)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let child_map: std::collections::HashMap<Uuid, i64> = child_counts.into_iter().collect();

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
        let mut view = TaskView::from_task(t, &project.ticket_prefix);
        view.child_count = *child_map.get(&id).unwrap_or(&0);
        view.comment_count = *comment_map.get(&id).unwrap_or(&0);
        view
    }).collect();

    Ok(Json(views))
}

pub async fn get_project_task(
    State(state): State<Arc<AppState>>,
    Path((_project_id, task_id)): Path<(Uuid, Uuid)>,
    AuthUser(_claims): AuthUser,
) -> Result<Json<TaskDetailView>, StatusCode> {
    let task: Task = sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
        .bind(task_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let project = resolve_project(&state.db, task.project_id).await?;
    let prefix = &project.ticket_prefix;

    let parent: Option<Task> = if let Some(pid) = task.parent_id {
        sqlx::query_as("SELECT * FROM tasks WHERE id = $1")
            .bind(pid)
            .fetch_optional(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        None
    };

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

    let blocks: Vec<Task> = sqlx::query_as(
        "SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocked_id = t.id WHERE d.blocker_id = $1 ORDER BY t.created_at"
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let blocked_by: Vec<Task> = sqlx::query_as(
        "SELECT t.* FROM tasks t JOIN task_dependencies d ON d.blocker_id = t.id WHERE d.blocked_id = $1 ORDER BY t.created_at"
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Ok(Json(TaskDetailView {
        task: TaskView::from_task(task, prefix),
        parent: parent.map(|p| task_summary_view(&p, prefix)),
        comments: comments.into_iter().map(|c| CommentView {
            id: c.id,
            author_id: c.author_id,
            content: c.content,
            created_at: c.created_at,
        }).collect(),
        children: children.iter().map(|t| task_summary_view(t, prefix)).collect(),
        blocks: blocks.iter().map(|t| task_summary_view(t, prefix)).collect(),
        blocked_by: blocked_by.iter().map(|t| task_summary_view(t, prefix)).collect(),
    }))
}
