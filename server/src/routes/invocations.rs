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
use crate::log_buffer::LogLine;
use crate::models::Invocation;
use crate::AppState;

// --- Request / Response types ---

#[derive(Debug, Deserialize)]
pub struct CreateInvocationRequest {
    /// Optional: if not provided, a workspace is resolved from the pool.
    pub workspace_id: Option<Uuid>,
    pub agent_perspective: String,
    pub prompt: String,
    pub system_prompt_append: Option<String>,
    pub task_id: Option<Uuid>,
    pub session_id: Option<Uuid>,
    /// Branch for workspace pool resolution (used when workspace_id is None).
    pub branch: Option<String>,
    /// If set, resume a prior Claude session (claude_session_id from a completed invocation).
    pub resume_session_id: Option<String>,
    pub model_hint: Option<String>,
    pub budget_tier: Option<String>,
    pub provider: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListInvocationsQuery {
    pub status: Option<String>,
    pub workspace_id: Option<Uuid>,
    pub task_id: Option<Uuid>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct InvocationView {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub project_id: Uuid,
    pub session_id: Option<Uuid>,
    pub task_id: Option<Uuid>,
    pub participant_id: Option<Uuid>,
    pub agent_perspective: String,
    pub prompt: String,
    pub system_prompt_append: Option<String>,
    pub status: String,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
    pub triggered_by: String,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub claude_session_id: Option<String>,
    pub resume_session_id: Option<String>,
    pub model_hint: Option<String>,
    pub budget_tier: Option<String>,
    pub provider: Option<String>,
    // Cost tracking (populated on completion)
    pub model_used: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct CostByModel {
    pub model: String,
    pub cost_usd: f64,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct ProjectCostSummary {
    pub total_cost_usd: f64,
    pub invocation_count: i64,
    pub by_model: Vec<CostByModel>,
}

#[derive(Debug, Serialize)]
pub struct InvocationDetailView {
    #[serde(flatten)]
    pub invocation: InvocationView,
    pub result_json: Option<serde_json::Value>,
    pub output: Vec<LogLine>,
}

fn to_view(inv: Invocation) -> InvocationView {
    InvocationView {
        id: inv.id,
        workspace_id: inv.workspace_id,
        project_id: inv.project_id,
        session_id: inv.session_id,
        task_id: inv.task_id,
        participant_id: inv.participant_id,
        agent_perspective: inv.agent_perspective,
        prompt: inv.prompt,
        system_prompt_append: inv.system_prompt_append,
        status: inv.status,
        exit_code: inv.exit_code,
        error_message: inv.error_message,
        triggered_by: inv.triggered_by,
        started_at: inv.started_at,
        completed_at: inv.completed_at,
        created_at: inv.created_at,
        updated_at: inv.updated_at,
        claude_session_id: inv.claude_session_id,
        resume_session_id: inv.resume_session_id,
        model_hint: inv.model_hint,
        budget_tier: inv.budget_tier,
        provider: inv.provider,
        model_used: inv.model_used,
        input_tokens: inv.input_tokens,
        output_tokens: inv.output_tokens,
        cost_usd: inv.cost_usd,
    }
}

/// Fetches full task context for a given task ID and formats it as markdown.
/// Returns None (with a warning log) if the task cannot be found or the query fails.
async fn build_task_context(db: &sqlx::PgPool, task_id: Uuid) -> Option<String> {
    // Task detail joined with project for ticket_prefix.
    // Enums are cast to TEXT for safe tuple decoding.
    let task_row: Option<(i32, String, String, Option<String>, String, String, String)> =
        sqlx::query_as(
            "SELECT t.ticket_number, p.ticket_prefix, t.title,
                    t.description, t.status::text, t.priority::text, t.complexity::text
             FROM tasks t
             JOIN projects p ON p.id = t.project_id
             WHERE t.id = $1",
        )
        .bind(task_id)
        .fetch_optional(db)
        .await
        .map_err(|e| tracing::warn!("build_task_context: failed to fetch task {task_id}: {e}"))
        .ok()
        .flatten();

    let (ticket_number, ticket_prefix, title, description, status, priority, complexity) =
        match task_row {
            Some(row) => row,
            None => {
                tracing::warn!("build_task_context: task {task_id} not found");
                return None;
            }
        };

    let ticket_id = format!("{}-{}", ticket_prefix, ticket_number);

    let mut md = format!(
        "# Task Context\n\n\
         **Task**: {ticket_id} {title}\n\
         **Status**: {status} | **Priority**: {priority} | **Complexity**: {complexity}\n\n\
         ## Description\n\
         {}\n",
        description.as_deref().unwrap_or("No description provided.")
    );

    // Recent comments (last 5), newest first
    let comments: Vec<(String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT content, created_at FROM task_comments
         WHERE task_id = $1 ORDER BY created_at DESC LIMIT 5",
    )
    .bind(task_id)
    .fetch_all(db)
    .await
    .unwrap_or_else(|e| {
        tracing::warn!("build_task_context: failed to fetch comments: {e}");
        vec![]
    });

    if !comments.is_empty() {
        md.push_str("\n## Recent Comments (last 5)\n");
        for (content, created_at) in &comments {
            let ts = created_at.format("%Y-%m-%d %H:%M UTC");
            md.push_str(&format!("- [{ts}] {content}\n"));
        }
    }

    // Child tasks (same project, so same prefix)
    let children: Vec<(i32, String, String)> = sqlx::query_as(
        "SELECT ticket_number, title, status::text FROM tasks
         WHERE parent_id = $1 ORDER BY created_at",
    )
    .bind(task_id)
    .fetch_all(db)
    .await
    .unwrap_or_else(|e| {
        tracing::warn!("build_task_context: failed to fetch child tasks: {e}");
        vec![]
    });

    if !children.is_empty() {
        md.push_str("\n## Child Tasks\n");
        for (cnum, ctitle, cstatus) in &children {
            let cticket = format!("{}-{}", ticket_prefix, cnum);
            md.push_str(&format!("- {cticket} {ctitle} ({cstatus})\n"));
        }
    }

    // Dependencies (tasks this task depends on)
    let deps: Vec<(i32, String, String)> = sqlx::query_as(
        "SELECT t.ticket_number, t.title, t.status::text
         FROM task_dependencies td JOIN tasks t ON t.id = td.depends_on_id
         WHERE td.task_id = $1",
    )
    .bind(task_id)
    .fetch_all(db)
    .await
    .unwrap_or_else(|e| {
        tracing::warn!("build_task_context: failed to fetch dependencies: {e}");
        vec![]
    });

    if !deps.is_empty() {
        md.push_str("\n## Dependencies\n");
        for (dnum, dtitle, dstatus) in &deps {
            let dticket = format!("{}-{}", ticket_prefix, dnum);
            md.push_str(&format!("- {dticket} {dtitle} ({dstatus})\n"));
        }
    }

    Some(md)
}

/// Verify project membership; returns Err(NOT_FOUND) when the user is not a member.
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

/// POST /api/projects/:project_id/invocations
pub async fn create_invocation(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateInvocationRequest>,
) -> Result<(StatusCode, Json<InvocationView>), (StatusCode, Json<serde_json::Value>)> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "internal error"})),
        )
    })?;
    verify_project_member(&state.db, project_id, user.id)
        .await
        .map_err(|s| {
            (
                s,
                Json(serde_json::json!({"error": "not found or forbidden"})),
            )
        })?;

    // Resolve workspace: use provided ID or find/create from pool
    let workspace_id = match req.workspace_id {
        Some(ws_id) => {
            // Verify workspace belongs to this project
            let ws_exists: Option<(Uuid,)> =
                sqlx::query_as("SELECT id FROM workspaces WHERE id = $1 AND project_id = $2")
                    .bind(ws_id)
                    .bind(project_id)
                    .fetch_optional(&state.db)
                    .await
                    .map_err(|e| {
                        tracing::error!("Failed to check workspace: {e}");
                        (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(serde_json::json!({"error": "internal error"})),
                        )
                    })?;
            if ws_exists.is_none() {
                return Err((
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({"error": "workspace not found"})),
                ));
            }
            ws_id
        }
        None => {
            // Resolve from pool: find running workspace or create one
            crate::dispatch::resolve_workspace(
                &state.db,
                project_id,
                req.branch.as_deref(),
                user.id,
            )
            .await
            .map_err(|e| {
                tracing::error!("Failed to resolve workspace from pool: {e}");
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(serde_json::json!({"error": "workspace unavailable"})),
                )
            })?
        }
    };

    // Resolve effective model config: request params > task-level > user prefs > org prefs
    let (effective_model_hint, effective_budget_tier, effective_provider) =
        crate::dispatch::resolve_model_config(
            &state.db,
            project_id,
            Some(user.id),
            req.task_id,
            req.model_hint.as_deref(),
            req.budget_tier.as_deref(),
            req.provider.as_deref(),
        )
        .await;

    // Enforce org model allowlist/denylist policy
    if let Some(org_id) = crate::dispatch::org_id_for_project_pub(&state.db, project_id).await {
        if let Err(msg) = crate::dispatch::enforce_org_model_policy(
            &state.db,
            org_id,
            effective_model_hint.as_deref(),
        )
        .await
        {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": msg })),
            ));
        }
    }

    // Build task context markdown when a task_id is provided; merge with any user-supplied
    // system_prompt_append. Failures are non-fatal — log and proceed without context.
    let task_context = if let Some(tid) = req.task_id {
        build_task_context(&state.db, tid).await
    } else {
        None
    };

    let effective_system_prompt = match (task_context, &req.system_prompt_append) {
        (Some(ctx), Some(user_spa)) => Some(format!("{ctx}\n\n---\n\n{user_spa}")),
        (Some(ctx), None) => Some(ctx),
        (None, spa) => spa.clone(),
    };

    let inv = sqlx::query_as::<_, Invocation>(
        "INSERT INTO invocations
            (workspace_id, project_id, session_id, task_id,
             agent_perspective, prompt, system_prompt_append, triggered_by,
             resume_session_id, model_hint, budget_tier, provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9, $10, $11)
         RETURNING *",
    )
    .bind(workspace_id)
    .bind(project_id)
    .bind(req.session_id)
    .bind(req.task_id)
    .bind(&req.agent_perspective)
    .bind(&req.prompt)
    .bind(&effective_system_prompt)
    .bind(&req.resume_session_id)
    .bind(&effective_model_hint)
    .bind(&effective_budget_tier)
    .bind(&effective_provider)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create invocation: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "internal error"})),
        )
    })?;

    let event = crate::events::DomainEvent::new(
        "invocation.created",
        "invocation",
        inv.id,
        Some(user.id),
        serde_json::json!({
            "workspace_id": workspace_id,
            "project_id": project_id,
            "agent_perspective": req.agent_perspective,
            "task_id": req.task_id,
            "session_id": req.session_id,
        }),
    );
    if let Err(e) = crate::events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    // Dispatch the invocation asynchronously
    let invocation_id = inv.id;
    let dispatch_state = Arc::clone(&state);
    tokio::spawn(async move {
        if let Err(e) = crate::dispatch::dispatch_invocation(
            &dispatch_state.db,
            &dispatch_state.log_buffer,
            &dispatch_state.connections,
            invocation_id,
        )
        .await
        {
            tracing::error!(invocation_id = %invocation_id, "Dispatch failed: {e}");
        }
    });

    Ok((StatusCode::CREATED, Json(to_view(inv))))
}

/// GET /api/projects/:project_id/invocations
pub async fn list_invocations(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Query(query): Query<ListInvocationsQuery>,
) -> Result<Json<Vec<InvocationView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let limit = query.limit.unwrap_or(50).min(200);

    // Build query dynamically based on optional filters
    let invocations = sqlx::query_as::<_, Invocation>(
        "SELECT * FROM invocations
         WHERE project_id = $1
           AND ($2::text IS NULL OR status = $2)
           AND ($3::uuid IS NULL OR workspace_id = $3)
           AND ($4::uuid IS NULL OR task_id = $4)
         ORDER BY created_at DESC
         LIMIT $5",
    )
    .bind(project_id)
    .bind(&query.status)
    .bind(query.workspace_id)
    .bind(query.task_id)
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list invocations: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(invocations.into_iter().map(to_view).collect()))
}

/// GET /api/invocations/:invocation_id
pub async fn get_invocation(
    State(state): State<Arc<AppState>>,
    Path(invocation_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
) -> Result<Json<InvocationDetailView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let inv = sqlx::query_as::<_, Invocation>("SELECT * FROM invocations WHERE id = $1")
        .bind(invocation_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get invocation: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Verify the requesting user is a member of the invocation's project
    verify_project_member(&state.db, inv.project_id, user.id).await?;

    // Pull recent output lines from the in-memory log buffer (keyed by invocation_id)
    let output = state.log_buffer.recent(inv.id, 200);

    let result_json = inv.result_json.clone();
    Ok(Json(InvocationDetailView {
        invocation: to_view(inv),
        result_json,
        output,
    }))
}

/// GET /api/projects/:project_id/cost-summary
pub async fn get_project_cost_summary(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
) -> Result<Json<ProjectCostSummary>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    // Aggregate totals
    let totals: (Option<f64>, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(cost_usd), 0.0), COUNT(*)
         FROM invocations
         WHERE project_id = $1",
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to aggregate invocation costs: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (total_cost_usd, invocation_count) = totals;

    // Break down by model (only invocations where model_used is set)
    let by_model_rows: Vec<(String, Option<f64>, i64)> = sqlx::query_as(
        "SELECT model_used, COALESCE(SUM(cost_usd), 0.0), COUNT(*)
         FROM invocations
         WHERE project_id = $1 AND model_used IS NOT NULL
         GROUP BY model_used
         ORDER BY SUM(cost_usd) DESC NULLS LAST",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to aggregate invocation costs by model: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let by_model = by_model_rows
        .into_iter()
        .map(|(model, cost, count)| CostByModel {
            model,
            cost_usd: cost.unwrap_or(0.0),
            count,
        })
        .collect();

    Ok(Json(ProjectCostSummary {
        total_cost_usd: total_cost_usd.unwrap_or(0.0),
        invocation_count,
        by_model,
    }))
}
