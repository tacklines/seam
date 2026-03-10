use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use futures::FutureExt as _;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use rand::Rng;

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
    /// User ID for credential resolution when invocation is created by the worker
    /// on behalf of a user (e.g. from a reaction or scheduled job). If not set,
    /// the authenticated user's ID is used.
    pub dispatch_user_id: Option<Uuid>,
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
    pub workspace_id: Option<Uuid>,
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
    // Error categorization (populated on failure)
    pub error_category: Option<String>,
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
        error_category: inv.error_category,
    }
}

fn generate_code(len: usize) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::rng();
    (0..len)
        .map(|_| {
            let idx = rng.random_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Ensures the task is in a session and the user has an agent join code for it.
/// If the task has no session, creates a project-level session and links the task.
/// Returns the agent join code string.
async fn ensure_agent_code(
    db: &sqlx::PgPool,
    task_id: Uuid,
    project_id: Uuid,
    user_id: Uuid,
) -> Option<String> {
    // Find existing session for this task
    let session_id: Uuid = match sqlx::query_as::<_, (Uuid,)>(
        "SELECT s.id FROM sessions s
         JOIN session_tasks st ON st.session_id = s.id
         WHERE st.task_id = $1 AND s.closed_at IS NULL
         ORDER BY s.created_at DESC LIMIT 1",
    )
    .bind(task_id)
    .fetch_optional(db)
    .await
    {
        Ok(Some((id,))) => id,
        Ok(None) => {
            // No session — find or create a project-level one
            let existing: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM sessions
                 WHERE project_id = $1 AND name = 'Project Tasks' AND closed_at IS NULL
                 LIMIT 1",
            )
            .bind(project_id)
            .fetch_optional(db)
            .await
            .unwrap_or(None);

            let sid = if let Some((id,)) = existing {
                id
            } else {
                // Create project-level session
                let sid = Uuid::new_v4();
                let code = generate_code(6);
                let join_code = generate_code(6);
                if let Err(e) = sqlx::query(
                    "INSERT INTO sessions (id, project_id, code, join_code, name, created_by)
                     VALUES ($1, $2, $3, $4, 'Project Tasks', $5)",
                )
                .bind(sid)
                .bind(project_id)
                .bind(&code)
                .bind(&join_code)
                .bind(user_id)
                .execute(db)
                .await
                {
                    tracing::warn!("ensure_agent_code: failed to create session: {e}");
                    return None;
                }

                // Add creator as participant
                let pid = Uuid::new_v4();
                let _ = sqlx::query(
                    "INSERT INTO participants (id, session_id, user_id, display_name, participant_type)
                     VALUES ($1, $2, $3, 'System', 'human')",
                )
                .bind(pid)
                .bind(sid)
                .bind(user_id)
                .execute(db)
                .await;

                tracing::info!(session_id = %sid, "Created project-level session for agent dispatch");
                sid
            };

            // Link task to session
            let _ = sqlx::query(
                "INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(sid)
            .bind(task_id)
            .execute(db)
            .await;

            sid
        }
        Err(e) => {
            tracing::warn!("ensure_agent_code: failed to find session: {e}");
            return None;
        }
    };

    // Find existing agent code for this user+session, or create one
    let existing_code: Option<(String,)> = sqlx::query_as(
        "SELECT code FROM agent_join_codes WHERE session_id = $1 AND user_id = $2 LIMIT 1",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .unwrap_or(None);

    if let Some((code,)) = existing_code {
        return Some(code);
    }

    // Create new agent join code
    let agent_code = generate_code(8);
    let code_id = Uuid::new_v4();
    match sqlx::query(
        "INSERT INTO agent_join_codes (id, session_id, user_id, code, created_at)
         VALUES ($1, $2, $3, $4, NOW())",
    )
    .bind(code_id)
    .bind(session_id)
    .bind(user_id)
    .bind(&agent_code)
    .execute(db)
    .await
    {
        Ok(_) => Some(agent_code),
        Err(e) => {
            tracing::warn!("ensure_agent_code: failed to create agent code: {e}");
            None
        }
    }
}

/// Fetches full task context for a given task ID and formats it as markdown.
/// Returns None (with a warning log) if the task cannot be found or the query fails.
async fn build_task_context(
    db: &sqlx::PgPool,
    task_id: Uuid,
    agent_code: Option<&str>,
) -> Option<String> {
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
         FROM task_dependencies td JOIN tasks t ON t.id = td.blocker_id
         WHERE td.blocked_id = $1",
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

    // Agent join code — so the agent can call join_session to access MCP tools
    if let Some(code) = agent_code {
        md.push_str(&format!(
            "\n## Session\n\
             Use `join_session` with code **{code}** to connect to this task's session.\n"
        ));
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

/// Generate a branch name from a task's ticket_id and title.
/// Returns None if the task is not found or the query fails.
async fn generate_branch_name(db: &sqlx::PgPool, task_id: Uuid) -> Option<String> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT ticket_id, title FROM tasks WHERE id = $1")
            .bind(task_id)
            .fetch_optional(db)
            .await
            .ok()?;

    let (ticket_id, title) = row?;

    // Slugify: lowercase, replace non-alphanumeric with hyphens
    let raw_slug: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();

    // Collapse multiple hyphens and drop empty segments
    let slug = raw_slug
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    // Truncate to a reasonable length, avoiding a trailing hyphen
    let slug = if slug.len() > 40 {
        slug[..40].trim_end_matches('-').to_string()
    } else {
        slug
    };

    Some(format!("agent/{}-{}", ticket_id, slug))
}

/// POST /api/projects/:project_id/invocations
#[tracing::instrument(skip(state, claims, req), fields(project_id = %project_id))]
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

    // Auto-generate branch name from task when no branch is specified
    let effective_branch = match &req.branch {
        Some(b) if !b.is_empty() => Some(b.clone()),
        _ => {
            if let Some(tid) = req.task_id {
                generate_branch_name(&state.db, tid).await
            } else {
                None
            }
        }
    };

    tracing::info!(
        perspective = %req.agent_perspective,
        task_id = ?req.task_id,
        branch = ?req.branch,
        model_hint = ?req.model_hint,
        "Invocation creation requested"
    );

    // If workspace_id is explicitly provided, validate it belongs to this project
    // (fast DB lookup only — no Coder API calls).  For pool resolution we skip
    // this step and let the background task do it asynchronously.
    let explicit_workspace_id: Option<Uuid> = match req.workspace_id {
        Some(ws_id) => {
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
            tracing::info!(workspace_id = %ws_id, "Invocation: using explicitly specified workspace");
            Some(ws_id)
        }
        None => {
            // Workspace will be resolved asynchronously in the background task.
            tracing::info!(branch = ?effective_branch, "Invocation: workspace will be resolved asynchronously");
            None
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

    // Ensure the task has a session and the user has an agent join code, then build
    // task context markdown. Failures are non-fatal — log and proceed without context.
    let agent_code = if let Some(tid) = req.task_id {
        ensure_agent_code(&state.db, tid, project_id, user.id).await
    } else {
        None
    };
    let task_context = if let Some(tid) = req.task_id {
        build_task_context(&state.db, tid, agent_code.as_deref()).await
    } else {
        None
    };

    let effective_system_prompt = match (task_context, &req.system_prompt_append) {
        (Some(ctx), Some(user_spa)) => Some(format!("{ctx}\n\n---\n\n{user_spa}")),
        (Some(ctx), None) => Some(ctx),
        (None, spa) => spa.clone(),
    };

    // Append push + PR creation instructions when a branch is specified.
    let effective_prompt = if let Some(branch) = &effective_branch {
        format!(
            "{}\n\nWhen you are done with your changes, commit, push, and create a pull request:\n\
             ```\n\
             git add -A\n\
             git commit -m \"<descriptive message>\"\n\
             git push -u origin {branch}\n\
             gh pr create --title \"<PR title>\" --body \"<summary of changes>\" --base main\n\
             ```\n\
             If `gh` is not available or PR creation fails, that's OK — the push is what matters.",
            req.prompt
        )
    } else {
        req.prompt.clone()
    };

    let inv = sqlx::query_as::<_, Invocation>(
        "INSERT INTO invocations
            (workspace_id, project_id, session_id, task_id,
             agent_perspective, prompt, system_prompt_append, triggered_by,
             resume_session_id, model_hint, budget_tier, provider)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8, $9, $10, $11)
         RETURNING *",
    )
    .bind(explicit_workspace_id)
    .bind(project_id)
    .bind(req.session_id)
    .bind(req.task_id)
    .bind(&req.agent_perspective)
    .bind(&effective_prompt)
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

    tracing::info!(
        invocation_id = %inv.id,
        workspace_id = ?inv.workspace_id,
        perspective = %inv.agent_perspective,
        task_id = ?inv.task_id,
        model_hint = ?inv.model_hint,
        resuming = inv.resume_session_id.is_some(),
        "Invocation created (pending)"
    );

    let event = crate::events::DomainEvent::new(
        "invocation.created",
        "invocation",
        inv.id,
        Some(user.id),
        serde_json::json!({
            "workspace_id": explicit_workspace_id,
            "project_id": project_id,
            "agent_perspective": req.agent_perspective,
            "task_id": req.task_id,
            "session_id": req.session_id,
        }),
    );
    if let Err(e) = crate::events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    // Background task: resolve workspace (if not already known) then dispatch.
    // Wrapped in AssertUnwindSafe + catch_unwind so panics don't silently leave
    // the invocation stuck in 'pending' or 'running'.
    let invocation_id = inv.id;
    let dispatch_state = Arc::clone(&state);
    let dispatch_branch = effective_branch.clone();
    // Use the explicit dispatch_user_id from the request (set by worker on behalf
    // of a user) or fall back to the authenticated user's ID.
    let dispatch_user_id = req.dispatch_user_id.unwrap_or(user.id);
    let dispatch_project_id = project_id;
    tokio::spawn(async move {
        let db = dispatch_state.db.clone();

        // Phase 1: resolve workspace_id if we don't have one yet.
        let resolved_workspace_id = if let Some(ws_id) = explicit_workspace_id {
            Ok(ws_id)
        } else {
            tracing::info!(
                invocation_id = %invocation_id,
                branch = ?dispatch_branch,
                "Background: resolving workspace for invocation"
            );
            crate::dispatch::resolve_workspace(
                &db,
                dispatch_project_id,
                dispatch_branch.as_deref(),
                dispatch_user_id,
            )
            .await
        };

        let workspace_id = match resolved_workspace_id {
            Ok(ws_id) => {
                // Stamp the workspace_id on the invocation record now that we have it.
                if explicit_workspace_id.is_none() {
                    if let Err(e) = sqlx::query(
                        "UPDATE invocations SET workspace_id = $2, updated_at = NOW()
                         WHERE id = $1 AND status = 'pending'",
                    )
                    .bind(invocation_id)
                    .bind(ws_id)
                    .execute(&db)
                    .await
                    {
                        tracing::error!(
                            invocation_id = %invocation_id,
                            error = %e,
                            "Failed to set workspace_id on invocation"
                        );
                        // Mark failed — we can't dispatch without a workspace.
                        let _ = sqlx::query(
                            "UPDATE invocations SET status = 'failed', \
                             error_message = $2, error_category = 'system_error', \
                             completed_at = NOW(), updated_at = NOW() \
                             WHERE id = $1 AND status = 'pending'",
                        )
                        .bind(invocation_id)
                        .bind(format!("Failed to persist workspace_id: {e}"))
                        .execute(&db)
                        .await;
                        return;
                    }
                }
                ws_id
            }
            Err(e) => {
                tracing::error!(
                    invocation_id = %invocation_id,
                    error = %e,
                    "Background: workspace resolution failed"
                );
                let details = e.to_string();
                let _ = sqlx::query(
                    "UPDATE invocations SET status = 'failed', \
                     error_message = $2, error_category = 'workspace_error', \
                     completed_at = NOW(), updated_at = NOW() \
                     WHERE id = $1 AND status = 'pending'",
                )
                .bind(invocation_id)
                .bind(format!("Workspace resolution failed: {details}"))
                .execute(&db)
                .await;
                return;
            }
        };

        tracing::info!(
            invocation_id = %invocation_id,
            workspace_id = %workspace_id,
            "Background: dispatching invocation"
        );

        // Phase 2: dispatch (shells out via coder ssh).
        let result = std::panic::AssertUnwindSafe(crate::dispatch::dispatch_invocation(
            &dispatch_state.db,
            &dispatch_state.log_buffer,
            &dispatch_state.connections,
            invocation_id,
        ))
        .catch_unwind()
        .await;

        match result {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                tracing::error!(invocation_id = %invocation_id, error = %e, "Dispatch failed");
                // Best-effort: mark failed so the invocation doesn't stay 'running'
                if let Err(db_err) = sqlx::query(
                    "UPDATE invocations SET status = 'failed', error_message = $2, \
                     error_category = 'system_error', completed_at = NOW(), updated_at = NOW() \
                     WHERE id = $1 AND status = 'running'",
                )
                .bind(invocation_id)
                .bind(format!("Dispatch error: {e}"))
                .execute(&db)
                .await
                {
                    tracing::warn!(
                        invocation_id = %invocation_id,
                        error = %db_err,
                        "failed to mark invocation failed after dispatch error"
                    );
                }
            }
            Err(_panic) => {
                tracing::error!(invocation_id = %invocation_id, "Dispatch task panicked");
                if let Err(db_err) = sqlx::query(
                    "UPDATE invocations SET status = 'failed', error_message = $2, \
                     error_category = 'system_error', completed_at = NOW(), updated_at = NOW() \
                     WHERE id = $1 AND status = 'running'",
                )
                .bind(invocation_id)
                .bind("Dispatch task panicked unexpectedly")
                .execute(&db)
                .await
                {
                    tracing::warn!(
                        invocation_id = %invocation_id,
                        error = %db_err,
                        "failed to mark invocation failed after panic"
                    );
                }
            }
        }
    });

    Ok((StatusCode::CREATED, Json(to_view(inv))))
}

/// GET /api/projects/:project_id/invocations
#[tracing::instrument(skip(state, claims, query), fields(project_id = %project_id))]
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
#[tracing::instrument(skip(state, claims), fields(invocation_id = %invocation_id))]
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
#[tracing::instrument(skip(state, claims), fields(project_id = %project_id))]
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
