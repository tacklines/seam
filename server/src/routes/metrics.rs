use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Duration, DurationRound, Utc};
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

/// Map a period string to (granularity, num_periods, Duration per period).
/// Returns None for periods that don't align with pre-aggregated snapshots (e.g. "1h" uses minutes).
fn period_to_snapshot_granularity(period: &str) -> Option<(&'static str, i64, Duration)> {
    match period {
        "24h" => Some(("hourly", 24, Duration::hours(1))),
        "7d" => Some(("daily", 7, Duration::days(1))),
        "30d" => Some(("daily", 30, Duration::days(1))),
        _ => None,
    }
}

/// Try to build a MetricsSummary from pre-aggregated snapshots.
/// Returns None if snapshots are not available or incomplete.
async fn summary_from_snapshots(
    db: &sqlx::PgPool,
    project_id: Uuid,
    period: &str,
) -> Option<(MetricsSummary, String)> {
    let (granularity, num_periods, step) = period_to_snapshot_granularity(period)?;

    let now = Utc::now();
    let current_bucket = match granularity {
        "hourly" => now.duration_trunc(Duration::hours(1)).ok()?,
        "daily" => now.duration_trunc(Duration::days(1)).ok()?,
        _ => return None,
    };

    // Window: the last `num_periods` complete periods plus the incomplete current one
    let window_start = current_bucket - step * num_periods as i32;

    // Fetch all invocation_summary snapshots in the window
    let snapshots: Vec<(DateTime<Utc>, DateTime<Utc>, serde_json::Value)> = sqlx::query_as(
        "SELECT period_start, period_end, data
         FROM metrics_snapshots
         WHERE project_id = $1
           AND metric_type = 'invocation_summary'
           AND granularity = $2
           AND period_start >= $3
         ORDER BY period_start ASC",
    )
    .bind(project_id)
    .bind(granularity)
    .bind(window_start)
    .fetch_all(db)
    .await
    .ok()?;

    // If we have fewer than half of expected snapshots, fall back
    if snapshots.len() < (num_periods / 2) as usize {
        return None;
    }

    // Merge invocation_summary snapshots
    let mut invocation_count = 0i64;
    let mut success_count = 0i64;
    let mut failure_count = 0i64;
    let mut pending_count = 0i64;

    for (_, _, data) in &snapshots {
        invocation_count += data["invocation_count"].as_i64().unwrap_or(0);
        success_count += data["success_count"].as_i64().unwrap_or(0);
        failure_count += data["failure_count"].as_i64().unwrap_or(0);
        pending_count += data["pending_count"].as_i64().unwrap_or(0);
    }

    // For the current incomplete period, add a live query
    let live: Option<(i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT
             COUNT(*),
             COUNT(*) FILTER (WHERE status = 'completed' AND (exit_code = 0 OR exit_code IS NULL)),
             COUNT(*) FILTER (WHERE status = 'failed' OR (status = 'completed' AND exit_code IS NOT NULL AND exit_code != 0)),
             COUNT(*) FILTER (WHERE status IN ('pending', 'running'))
         FROM invocations
         WHERE project_id = $1
           AND created_at >= $2",
    )
    .bind(project_id)
    .bind(current_bucket)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    if let Some((lc, ls, lf, lp)) = live {
        invocation_count += lc;
        success_count += ls;
        failure_count += lf;
        pending_count += lp;
    }

    // Fetch perspective breakdown snapshots
    let persp_snapshots: Vec<(serde_json::Value,)> = sqlx::query_as(
        "SELECT data
         FROM metrics_snapshots
         WHERE project_id = $1
           AND metric_type = 'perspective_breakdown'
           AND granularity = $2
           AND period_start >= $3
         ORDER BY period_start ASC",
    )
    .bind(project_id)
    .bind(granularity)
    .bind(window_start)
    .fetch_all(db)
    .await
    .ok()?;

    // Merge perspective data
    let mut persp_map: std::collections::HashMap<String, (i64, i64, i64, f64, i64)> =
        std::collections::HashMap::new();
    for (data,) in &persp_snapshots {
        if let Some(arr) = data["by_perspective"].as_array() {
            for item in arr {
                let key = item["perspective"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string();
                let count = item["count"].as_i64().unwrap_or(0);
                let sc = item["success_count"].as_i64().unwrap_or(0);
                let fc = item["failure_count"].as_i64().unwrap_or(0);
                let avg = item["avg_duration_seconds"].as_f64().unwrap_or(0.0);
                let entry = persp_map.entry(key).or_insert((0, 0, 0, 0.0, 0));
                entry.0 += count;
                entry.1 += sc;
                entry.2 += fc;
                // Weighted average approximation
                if count > 0 {
                    let total_n = entry.4 + count;
                    entry.3 = (entry.3 * entry.4 as f64 + avg * count as f64) / total_n as f64;
                    entry.4 = total_n;
                }
            }
        }
    }

    let mut by_perspective: Vec<PerspectiveMetrics> = persp_map
        .into_iter()
        .map(
            |(perspective, (count, sc, fc, avg, _))| PerspectiveMetrics {
                perspective,
                count,
                success_count: sc,
                failure_count: fc,
                avg_duration_seconds: avg,
            },
        )
        .collect();
    by_perspective.sort_by(|a, b| b.count.cmp(&a.count));

    // Fetch model breakdown snapshots
    let model_snapshots: Vec<(serde_json::Value,)> = sqlx::query_as(
        "SELECT data
         FROM metrics_snapshots
         WHERE project_id = $1
           AND metric_type = 'model_breakdown'
           AND granularity = $2
           AND period_start >= $3
         ORDER BY period_start ASC",
    )
    .bind(project_id)
    .bind(granularity)
    .bind(window_start)
    .fetch_all(db)
    .await
    .ok()?;

    let mut model_map: std::collections::HashMap<String, (i64, f64)> =
        std::collections::HashMap::new();
    for (data,) in &model_snapshots {
        if let Some(arr) = data["by_model"].as_array() {
            for item in arr {
                let key = item["model"].as_str().unwrap_or("unknown").to_string();
                let count = item["count"].as_i64().unwrap_or(0);
                let cost = item["cost_usd"].as_f64().unwrap_or(0.0);
                let entry = model_map.entry(key).or_insert((0, 0.0));
                entry.0 += count;
                entry.1 += cost;
            }
        }
    }

    let mut by_model: Vec<ModelMetrics> = model_map
        .into_iter()
        .map(|(model, (count, cost_usd))| ModelMetrics {
            model,
            count,
            cost_usd,
        })
        .collect();
    by_model.sort_by(|a, b| b.count.cmp(&a.count));

    // Workspace status (always live — not time-filtered)
    let ws_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT status, COUNT(*) FROM workspaces WHERE project_id = $1 GROUP BY status",
    )
    .bind(project_id)
    .fetch_all(db)
    .await
    .ok()?;

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

    Some((
        MetricsSummary {
            invocation_count,
            success_count,
            failure_count,
            success_rate,
            avg_duration_seconds: 0.0, // merged avg not reliable without raw data; live query fills this
            p50_duration_seconds: 0.0,
            p95_duration_seconds: 0.0,
            pending_count,
            by_perspective,
            by_model,
            workspace_status: WorkspaceStatusCounts {
                running: ws_running,
                stopped: ws_stopped,
                failed: ws_failed,
            },
            period: period.to_string(),
        },
        "snapshot".to_string(),
    ))
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

    // Try pre-aggregated snapshots first for supported periods
    if let Some((mut summary, _source)) =
        summary_from_snapshots(&state.db, project_id, period).await
    {
        // Fill in duration percentiles with a targeted live query (cheap: only completed rows)
        let (interval, _, _) = parse_period(period).unwrap_or(("24 hours", "hour", "1h"));
        let percentiles: Option<(Option<f64>, Option<f64>, Option<f64>)> =
            sqlx::query_as(&format!(
                "SELECT
                     AVG(EXTRACT(EPOCH FROM (completed_at - started_at))),
                     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))),
                     PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at)))
                 FROM invocations
                 WHERE project_id = $1
                   AND completed_at IS NOT NULL
                   AND started_at IS NOT NULL
                   AND created_at > NOW() - INTERVAL '{interval}'"
            ))
            .bind(project_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
        if let Some((avg, p50, p95)) = percentiles {
            summary.avg_duration_seconds = avg.unwrap_or(0.0);
            summary.p50_duration_seconds = p50.unwrap_or(0.0);
            summary.p95_duration_seconds = p95.unwrap_or(0.0);
        }
        return Ok(Json(summary));
    }

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
