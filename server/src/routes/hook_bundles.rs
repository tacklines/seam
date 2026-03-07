use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::AppState;

// ---------------------------------------------------------------------------
// Bundle definitions (static data — not DB-driven)
// ---------------------------------------------------------------------------

struct ReactionDef {
    name: &'static str,
    event_type: &'static str,
    aggregate_type: &'static str,
    action_type: &'static str,
    action_config: &'static str, // raw JSON literal
}

struct ScheduledJobDef {
    name: &'static str,
    cron_expr: &'static str,
    action_type: &'static str,
    action_config: &'static str, // raw JSON literal
}

struct BundleDef {
    name: &'static str,
    reactions: &'static [ReactionDef],
    scheduled_jobs: &'static [ScheduledJobDef],
}

static TASK_INTELLIGENCE: BundleDef = BundleDef {
    name: "task_intelligence",
    scheduled_jobs: &[],
    reactions: &[
        ReactionDef {
            name: "AI: Auto-triage new tasks",
            event_type: "task.created",
            aggregate_type: "task",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a task triage assistant for a software project. Given a task title and description, analyze and return a JSON object with: suggested_priority (\"p0\" through \"p4\"), suggested_complexity (\"xs\", \"s\", \"m\", \"l\", \"xl\"), suggested_type (\"task\", \"bug\", \"feature\", \"story\"), and reasoning (one sentence).",
                "prompt": "Task: {{title}}\n\nDescription: {{description}}",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 256,
                "result_target": {"type": "update_field", "table": "tasks", "column": "ai_triage", "parse_json": true}
            }"#,
        },
        ReactionDef {
            name: "AI: Task completion summary",
            event_type: "task.closed",
            aggregate_type: "task",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a technical writer. Given a task that was just closed, write a brief completion summary (2-3 sentences) describing what was accomplished.",
                "prompt": "Task: {{title}}\n\nDescription: {{description}}\n\nStatus: {{status}}",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 256,
                "result_target": {"type": "update_field", "table": "tasks", "column": "completion_summary"}
            }"#,
        },
    ],
};

static SESSION_AWARENESS: BundleDef = BundleDef {
    name: "session_awareness",
    scheduled_jobs: &[],
    reactions: &[
        ReactionDef {
            name: "AI: Comment intent classification",
            event_type: "comment.added",
            aggregate_type: "comment",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "Classify the intent of this comment. Return exactly one word: question, decision, blocker, status_update, code_reference, discussion, or other.",
                "prompt": "Comment: {{content}}",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 16,
                "result_target": {"type": "update_field", "table": "task_comments", "column": "intent"}
            }"#,
        },
        ReactionDef {
            name: "AI: Session summary on close",
            event_type: "session.closed",
            aggregate_type: "session",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a meeting notes assistant. Summarize what happened in this session based on the available context. Keep it to 3-5 bullet points.",
                "prompt": "Session closed. Project: {{project_id}}",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "result_target": {"type": "update_field", "table": "sessions", "column": "summary"}
            }"#,
        },
    ],
};

static REQUEST_PIPELINE: BundleDef = BundleDef {
    name: "request_pipeline",
    scheduled_jobs: &[],
    reactions: &[
        ReactionDef {
            name: "AI: Request duplicate detection",
            event_type: "request_created",
            aggregate_type: "request",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a duplicate detection assistant. Given a new feature request, determine if it duplicates or substantially overlaps with existing requests. Return JSON: {\"is_duplicate\": boolean, \"similar_request_ids\": [], \"reasoning\": \"...\"}",
                "prompt": "New request: {{title}}\n\n{{body}}",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 256,
                "result_target": {"type": "update_field", "table": "requests", "column": "impact_analysis", "parse_json": true}
            }"#,
        },
        ReactionDef {
            name: "AI: Request impact analysis",
            event_type: "request_created",
            aggregate_type: "request",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a technical analyst. Given a feature request, estimate its impact. Return JSON: {\"scope\": \"small|medium|large\", \"affected_components\": [], \"risk_level\": \"low|medium|high\", \"estimated_effort\": \"hours|days|weeks\", \"reasoning\": \"...\"}",
                "prompt": "Request: {{title}}\n\n{{body}}",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "result_target": {"type": "update_field", "table": "requests", "column": "impact_analysis", "parse_json": true}
            }"#,
        },
    ],
};

static PROJECT_HEALTH: BundleDef = BundleDef {
    name: "project_health",
    reactions: &[],
    scheduled_jobs: &[
        ScheduledJobDef {
            name: "AI: Weekly project health report",
            cron_expr: "0 18 * * FRI",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a project health analyst. Generate a concise weekly health report covering: task velocity (created vs closed this week), open blockers, stale tasks, and overall project momentum. Format as markdown with sections.",
                "prompt": "Generate a weekly project health report.",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "result_target": {"type": "log_only"}
            }"#,
        },
        ScheduledJobDef {
            name: "AI: Daily stale task detection",
            cron_expr: "0 9 * * MON-FRI",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a project manager assistant. Identify tasks that may be stale: in_progress with no recent updates, blocked tasks with no resolution activity, high-priority tasks not yet started. Return a brief summary.",
                "prompt": "Check for stale tasks in the project.",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "result_target": {"type": "log_only"}
            }"#,
        },
        ScheduledJobDef {
            name: "AI: Weekly requirement coverage analysis",
            cron_expr: "0 10 * * MON",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a requirements analyst. Analyze requirement coverage: which active requirements have linked tasks, which have gaps, which are fully covered. Return a brief coverage report.",
                "prompt": "Analyze requirement coverage for the project.",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "result_target": {"type": "log_only"}
            }"#,
        },
        ScheduledJobDef {
            name: "AI: Sprint readiness scoring",
            cron_expr: "0 10 * * FRI",
            action_type: "inference",
            action_config: r#"{
                "system_prompt": "You are a sprint planning assistant. Score backlog tasks by readiness: do they have clear descriptions, are dependencies met, are estimates provided? Return a brief readiness assessment.",
                "prompt": "Score backlog task readiness for sprint planning.",
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "result_target": {"type": "log_only"}
            }"#,
        },
    ],
};

static ALL_BUNDLES: &[&BundleDef] = &[
    &TASK_INTELLIGENCE,
    &SESSION_AWARENESS,
    &REQUEST_PIPELINE,
    &PROJECT_HEALTH,
];

fn find_bundle(name: &str) -> Option<&'static BundleDef> {
    ALL_BUNDLES.iter().copied().find(|b| b.name == name)
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct InstallBundleResponse {
    pub bundle: String,
    pub installed_reactions: Vec<Uuid>,
    pub installed_jobs: Vec<Uuid>,
    pub skipped: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BundleStatus {
    pub name: String,
    pub installed: bool,
    /// Names of reactions/jobs that belong to this bundle and already exist.
    pub installed_items: Vec<String>,
    /// Names of reactions/jobs that belong to this bundle and are missing.
    pub missing_items: Vec<String>,
}

// ---------------------------------------------------------------------------
// Auth helper (mirrors automations.rs)
// ---------------------------------------------------------------------------

async fn verify_project_membership(
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

// ---------------------------------------------------------------------------
// POST /api/projects/:project_id/hook-bundles/:bundle_name
// ---------------------------------------------------------------------------

pub async fn install_bundle(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path((project_id, bundle_name)): Path<(Uuid, String)>,
) -> Result<(StatusCode, Json<InstallBundleResponse>), StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    let bundle = find_bundle(&bundle_name).ok_or(StatusCode::NOT_FOUND)?;

    let mut installed_reactions: Vec<Uuid> = Vec::new();
    let mut installed_jobs: Vec<Uuid> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();

    // Install event reactions
    for reaction in bundle.reactions {
        let existing: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM event_reactions WHERE project_id = $1 AND name = $2",
        )
        .bind(project_id)
        .bind(reaction.name)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check existing reaction: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        if existing.is_some() {
            skipped.push(reaction.name.to_string());
            continue;
        }

        let action_config: serde_json::Value =
            serde_json::from_str(reaction.action_config).map_err(|e| {
                tracing::error!("Invalid action_config JSON in bundle def: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        let (new_id,): (Uuid,) = sqlx::query_as(
            "INSERT INTO event_reactions (id, project_id, name, event_type, aggregate_type, filter, action_type, action_config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id",
        )
        .bind(Uuid::new_v4())
        .bind(project_id)
        .bind(reaction.name)
        .bind(reaction.event_type)
        .bind(reaction.aggregate_type)
        .bind(serde_json::Value::Object(serde_json::Map::new()))
        .bind(reaction.action_type)
        .bind(action_config)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to insert reaction: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        tracing::info!(reaction_name = reaction.name, id = %new_id, "Hook bundle reaction installed");
        installed_reactions.push(new_id);
    }

    // Install scheduled jobs
    for job in bundle.scheduled_jobs {
        let existing: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM scheduled_jobs WHERE project_id = $1 AND name = $2",
        )
        .bind(project_id)
        .bind(job.name)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check existing scheduled job: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        if existing.is_some() {
            skipped.push(job.name.to_string());
            continue;
        }

        let action_config: serde_json::Value =
            serde_json::from_str(job.action_config).map_err(|e| {
                tracing::error!("Invalid action_config JSON in bundle def: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        let next_run = super::automations::compute_next_run(job.cron_expr).map_err(|e| {
            tracing::error!("Invalid cron expression in bundle def: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        let (new_id,): (Uuid,) = sqlx::query_as(
            "INSERT INTO scheduled_jobs (id, project_id, name, cron_expr, action_type, action_config, next_run_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id",
        )
        .bind(Uuid::new_v4())
        .bind(project_id)
        .bind(job.name)
        .bind(job.cron_expr)
        .bind(job.action_type)
        .bind(action_config)
        .bind(next_run)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to insert scheduled job: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        tracing::info!(job_name = job.name, id = %new_id, "Hook bundle scheduled job installed");
        installed_jobs.push(new_id);
    }

    let status = if installed_reactions.is_empty() && installed_jobs.is_empty() {
        StatusCode::OK
    } else {
        StatusCode::CREATED
    };

    Ok((
        status,
        Json(InstallBundleResponse {
            bundle: bundle_name,
            installed_reactions,
            installed_jobs,
            skipped,
        }),
    ))
}

// ---------------------------------------------------------------------------
// GET /api/projects/:project_id/hook-bundles
// ---------------------------------------------------------------------------

pub async fn list_bundles(
    AuthUser(claims): AuthUser,
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
) -> Result<Json<Vec<BundleStatus>>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_membership(&state.db, project_id, user.id).await?;

    // Fetch all existing reaction and job names for this project
    let existing_reactions: Vec<(String,)> =
        sqlx::query_as("SELECT name FROM event_reactions WHERE project_id = $1")
            .bind(project_id)
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to fetch existing reactions: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let existing_jobs: Vec<(String,)> =
        sqlx::query_as("SELECT name FROM scheduled_jobs WHERE project_id = $1")
            .bind(project_id)
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to fetch existing jobs: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let existing_set: std::collections::HashSet<String> = existing_reactions
        .into_iter()
        .chain(existing_jobs)
        .map(|(n,)| n)
        .collect();

    let statuses: Vec<BundleStatus> = ALL_BUNDLES
        .iter()
        .map(|bundle| {
            let mut present: Vec<String> = Vec::new();
            let mut absent: Vec<String> = Vec::new();

            for reaction in bundle.reactions {
                if existing_set.contains(reaction.name) {
                    present.push(reaction.name.to_string());
                } else {
                    absent.push(reaction.name.to_string());
                }
            }
            for job in bundle.scheduled_jobs {
                if existing_set.contains(job.name) {
                    present.push(job.name.to_string());
                } else {
                    absent.push(job.name.to_string());
                }
            }

            let total_items = bundle.reactions.len() + bundle.scheduled_jobs.len();
            let installed = total_items > 0 && absent.is_empty();

            BundleStatus {
                name: bundle.name.to_string(),
                installed,
                installed_items: present,
                missing_items: absent,
            }
        })
        .collect();

    Ok(Json(statuses))
}
