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
use crate::AppState;

// --- Query params ---

#[derive(Debug, Deserialize)]
pub struct MetricsPeriodQuery {
    /// Time window: 1h, 24h, 7d, 30d (default: 24h)
    pub period: Option<String>,
}

// --- Response types ---

#[derive(Debug, Serialize)]
pub struct PerspectiveMetrics {
    pub perspective: String,
    pub count: i64,
    pub success_count: i64,
    pub failure_count: i64,
    pub avg_duration_seconds: f64,
}

#[derive(Debug, Serialize)]
pub struct ModelMetrics {
    pub model: String,
    pub count: i64,
    pub cost_usd: f64,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceStatusCounts {
    pub running: i64,
    pub stopped: i64,
    pub failed: i64,
}

#[derive(Debug, Serialize)]
pub struct MetricsSummary {
    pub invocation_count: i64,
    pub success_count: i64,
    pub failure_count: i64,
    pub success_rate: f64,
    pub avg_duration_seconds: f64,
    pub p50_duration_seconds: f64,
    pub p95_duration_seconds: f64,
    pub pending_count: i64,
    pub by_perspective: Vec<PerspectiveMetrics>,
    pub by_model: Vec<ModelMetrics>,
    pub workspace_status: WorkspaceStatusCounts,
    pub period: String,
}

#[derive(Debug, Serialize)]
pub struct TimelineBucket {
    pub timestamp: DateTime<Utc>,
    pub completed: i64,
    pub failed: i64,
    pub pending: i64,
}

#[derive(Debug, Serialize)]
pub struct InvocationTimeline {
    pub buckets: Vec<TimelineBucket>,
    pub bucket_size: String,
    pub period: String,
}

// --- Helpers ---

/// Parse period string to a PostgreSQL interval string.
/// Returns (interval_str, bucket_trunc, bucket_size_label).
fn parse_period(period: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match period {
        "1h" => Some(("1 hour", "minute", "1m")),
        "24h" => Some(("24 hours", "hour", "1h")),
        "7d" => Some(("7 days", "day", "1d")),
        "30d" => Some(("30 days", "day", "1d")),
        _ => None,
    }
}

/// Verify project membership; returns Err(NOT_FOUND) when the user is not a member.
async fn verify_project_member(
    db: &sqlx::PgPool,
    project_id: Uuid,
    user_id: Uuid,
) -> Result<(), StatusCode> {
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM projects WHERE id = $1 AND org_id IN (
             SELECT org_id FROM org_memberships WHERE user_id = $2
         )",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("verify_project_member query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(())
}

// --- Handlers ---

/// GET /api/projects/:project_id/metrics/summary
#[tracing::instrument(skip(state, claims), fields(project_id = %project_id))]
pub async fn project_metrics_summary(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Query(params): Query<MetricsPeriodQuery>,
) -> Result<Json<MetricsSummary>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let period = params.period.as_deref().unwrap_or("24h");
    let (interval, _, _) = parse_period(period).unwrap_or(("24 hours", "hour", "1h"));

    // Overall counts and durations
    let totals: (i64, i64, i64, i64, Option<f64>) = sqlx::query_as(&format!(
        "SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'completed' AND (exit_code = 0 OR exit_code IS NULL)) AS success_count,
             COUNT(*) FILTER (WHERE status = 'failed' OR (status = 'completed' AND exit_code IS NOT NULL AND exit_code != 0)) AS failure_count,
             COUNT(*) FILTER (WHERE status IN ('pending', 'running')) AS pending_count,
             AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL) AS avg_duration_seconds
         FROM invocations
         WHERE project_id = $1
           AND created_at > NOW() - INTERVAL '{interval}'"
    ))
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to aggregate invocation totals: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (invocation_count, success_count, failure_count, pending_count, avg_duration) = totals;

    // Percentiles for completed invocations
    let percentiles: (Option<f64>, Option<f64>) = sqlx::query_as(&format!(
        "SELECT
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))),
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)))
         FROM invocations
         WHERE project_id = $1
           AND completed_at IS NOT NULL
           AND started_at IS NOT NULL
           AND created_at > NOW() - INTERVAL '{interval}'"
    ))
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to compute duration percentiles: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let (p50, p95) = percentiles;

    // By perspective
    let perspective_rows: Vec<(String, i64, i64, i64, Option<f64>)> = sqlx::query_as(&format!(
        "SELECT
             agent_perspective,
             COUNT(*) AS count,
             COUNT(*) FILTER (WHERE status = 'completed' AND (exit_code = 0 OR exit_code IS NULL)) AS success_count,
             COUNT(*) FILTER (WHERE status = 'failed' OR (status = 'completed' AND exit_code IS NOT NULL AND exit_code != 0)) AS failure_count,
             AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL) AS avg_duration_seconds
         FROM invocations
         WHERE project_id = $1
           AND created_at > NOW() - INTERVAL '{interval}'
         GROUP BY agent_perspective
         ORDER BY COUNT(*) DESC"
    ))
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to aggregate invocations by perspective: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let by_perspective = perspective_rows
        .into_iter()
        .map(|(perspective, count, sc, fc, avg)| PerspectiveMetrics {
            perspective,
            count,
            success_count: sc,
            failure_count: fc,
            avg_duration_seconds: avg.unwrap_or(0.0),
        })
        .collect();

    // By model (only where model_used is set)
    let model_rows: Vec<(String, i64, Option<f64>)> = sqlx::query_as(&format!(
        "SELECT
             model_used,
             COUNT(*) AS count,
             COALESCE(SUM(cost_usd), 0.0) AS cost_usd
         FROM invocations
         WHERE project_id = $1
           AND model_used IS NOT NULL
           AND created_at > NOW() - INTERVAL '{interval}'
         GROUP BY model_used
         ORDER BY COUNT(*) DESC"
    ))
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to aggregate invocations by model: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let by_model = model_rows
        .into_iter()
        .map(|(model, count, cost)| ModelMetrics {
            model,
            count,
            cost_usd: cost.unwrap_or(0.0),
        })
        .collect();

    // Workspace status counts (all workspaces for the project, not time-filtered)
    let ws_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT status, COUNT(*) FROM workspaces WHERE project_id = $1 GROUP BY status",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to aggregate workspace statuses: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut ws_running = 0i64;
    let mut ws_stopped = 0i64;
    let mut ws_failed = 0i64;
    for (status, count) in ws_rows {
        match status.as_str() {
            "running" => ws_running = count,
            "stopped" => ws_stopped = count,
            "failed" => ws_failed = count,
            _ => {}
        }
    }

    let success_rate = if invocation_count > 0 {
        success_count as f64 / invocation_count as f64
    } else {
        0.0
    };

    Ok(Json(MetricsSummary {
        invocation_count,
        success_count,
        failure_count,
        success_rate,
        avg_duration_seconds: avg_duration.unwrap_or(0.0),
        p50_duration_seconds: p50.unwrap_or(0.0),
        p95_duration_seconds: p95.unwrap_or(0.0),
        pending_count,
        by_perspective,
        by_model,
        workspace_status: WorkspaceStatusCounts {
            running: ws_running,
            stopped: ws_stopped,
            failed: ws_failed,
        },
        period: period.to_string(),
    }))
}

/// GET /api/projects/:project_id/metrics/invocation-timeline
#[tracing::instrument(skip(state, claims), fields(project_id = %project_id))]
pub async fn invocation_timeline(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Query(params): Query<MetricsPeriodQuery>,
) -> Result<Json<InvocationTimeline>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let period = params.period.as_deref().unwrap_or("24h");
    let (interval, bucket_trunc, bucket_size_label) =
        parse_period(period).unwrap_or(("24 hours", "hour", "1h"));

    // Time-bucketed counts
    let bucket_rows: Vec<(DateTime<Utc>, i64, i64, i64)> = sqlx::query_as(&format!(
        "SELECT
             DATE_TRUNC('{bucket_trunc}', created_at) AS bucket,
             COUNT(*) FILTER (WHERE status = 'completed' AND (exit_code = 0 OR exit_code IS NULL)) AS completed,
             COUNT(*) FILTER (WHERE status = 'failed' OR (status = 'completed' AND exit_code IS NOT NULL AND exit_code != 0)) AS failed,
             COUNT(*) FILTER (WHERE status IN ('pending', 'running')) AS pending
         FROM invocations
         WHERE project_id = $1
           AND created_at > NOW() - INTERVAL '{interval}'
         GROUP BY bucket
         ORDER BY bucket ASC"
    ))
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to aggregate invocation timeline: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let buckets = bucket_rows
        .into_iter()
        .map(|(timestamp, completed, failed, pending)| TimelineBucket {
            timestamp,
            completed,
            failed,
            pending,
        })
        .collect();

    Ok(Json(InvocationTimeline {
        buckets,
        bucket_size: bucket_size_label.to_string(),
        period: period.to_string(),
    }))
}
