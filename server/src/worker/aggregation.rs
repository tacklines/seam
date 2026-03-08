use chrono::{DateTime, Duration, DurationRound, Utc};
use sqlx::PgPool;
use std::time::Duration as StdDuration;
use tracing::{info, warn};
use uuid::Uuid;

const POLL_INTERVAL: StdDuration = StdDuration::from_secs(300); // every 5 minutes

/// Run the metrics aggregation loop.
pub async fn run(pool: PgPool) {
    info!("Metrics aggregation started (5-minute poll interval)");

    // Use interval so the first tick fires immediately
    let mut interval = tokio::time::interval(POLL_INTERVAL);
    loop {
        interval.tick().await;
        if let Err(e) = aggregate_metrics(&pool).await {
            warn!(error = %e, "Metrics aggregation failed");
        }
    }
}

async fn aggregate_metrics(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Fetch all project IDs that have at least one invocation
    let project_ids: Vec<(Uuid,)> = sqlx::query_as("SELECT DISTINCT project_id FROM invocations")
        .fetch_all(pool)
        .await?;

    let now = Utc::now();
    let current_hour = now.duration_trunc(Duration::hours(1))?;
    let current_day = now.duration_trunc(Duration::days(1))?;

    let mut total_upserted = 0usize;

    for (project_id,) in &project_ids {
        // Aggregate hourly buckets for the past 7 days (168 hours)
        let hourly_count = aggregate_hourly(pool, *project_id, current_hour, 168).await?;

        // Aggregate daily buckets for the past 90 days
        let daily_count = aggregate_daily(pool, *project_id, current_day, 90).await?;

        total_upserted += hourly_count + daily_count;
    }

    if total_upserted > 0 {
        info!(
            upserted = total_upserted,
            projects = project_ids.len(),
            "Metrics snapshots updated"
        );
    }

    Ok(())
}

/// Aggregate hourly snapshots for `project_id`, covering the last `lookback_hours` complete hours.
/// Returns the number of rows upserted.
async fn aggregate_hourly(
    pool: &PgPool,
    project_id: Uuid,
    current_hour: DateTime<Utc>,
    lookback_hours: i64,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    // Find the oldest existing hourly snapshot for this project
    let oldest_row: (Option<DateTime<Utc>>,) = sqlx::query_as(
        "SELECT MIN(period_start)
         FROM metrics_snapshots
         WHERE project_id = $1 AND granularity = 'hourly' AND metric_type = 'invocation_summary'",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;
    let oldest_existing: Option<(DateTime<Utc>,)> = oldest_row.0.map(|ts| (ts,));

    let window_start = current_hour - Duration::hours(lookback_hours);

    // Only process hours that either don't exist yet or are incomplete (last 2 hours)
    // We always re-aggregate the last 2 hours since they may still be accumulating data
    let recompute_threshold = current_hour - Duration::hours(2);

    let mut upserted = 0usize;

    // Generate the list of hours to process
    let mut hour = if let Some((oldest,)) = oldest_existing {
        // Re-aggregate from 2 hours ago through current, and fill any gaps from window_start
        std::cmp::min(oldest, recompute_threshold)
    } else {
        window_start
    };

    // Clamp to the window
    if hour < window_start {
        hour = window_start;
    }

    while hour <= current_hour - Duration::hours(1) {
        let period_end = hour + Duration::hours(1);

        // Only re-aggregate if: period is recent enough to still be changing, or no snapshot exists
        let should_update = hour >= recompute_threshold;
        if !should_update {
            // Check if snapshot already exists
            let exists: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM metrics_snapshots
                 WHERE project_id = $1 AND metric_type = 'invocation_summary'
                   AND period_start = $2 AND granularity = 'hourly'",
            )
            .bind(project_id)
            .bind(hour)
            .fetch_optional(pool)
            .await?;

            if exists.is_some() {
                hour = period_end;
                continue;
            }
        }

        upserted += upsert_invocation_summary(pool, project_id, hour, period_end, "hourly").await?;
        upserted +=
            upsert_perspective_breakdown(pool, project_id, hour, period_end, "hourly").await?;
        upserted += upsert_model_breakdown(pool, project_id, hour, period_end, "hourly").await?;

        hour = period_end;
    }

    Ok(upserted)
}

/// Aggregate daily snapshots for `project_id`, covering the last `lookback_days` complete days.
/// Returns the number of rows upserted.
async fn aggregate_daily(
    pool: &PgPool,
    project_id: Uuid,
    current_day: DateTime<Utc>,
    lookback_days: i64,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let window_start = current_day - Duration::days(lookback_days);
    let recompute_threshold = current_day - Duration::days(2);

    let oldest_row: (Option<DateTime<Utc>>,) = sqlx::query_as(
        "SELECT MIN(period_start)
         FROM metrics_snapshots
         WHERE project_id = $1 AND granularity = 'daily' AND metric_type = 'invocation_summary'",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;
    let oldest_existing: Option<(DateTime<Utc>,)> = oldest_row.0.map(|ts| (ts,));

    let mut day = if let Some((oldest,)) = oldest_existing {
        std::cmp::min(oldest, recompute_threshold)
    } else {
        window_start
    };

    if day < window_start {
        day = window_start;
    }

    let mut upserted = 0usize;

    while day <= current_day - Duration::days(1) {
        let period_end = day + Duration::days(1);

        let should_update = day >= recompute_threshold;
        if !should_update {
            let exists: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM metrics_snapshots
                 WHERE project_id = $1 AND metric_type = 'invocation_summary'
                   AND period_start = $2 AND granularity = 'daily'",
            )
            .bind(project_id)
            .bind(day)
            .fetch_optional(pool)
            .await?;

            if exists.is_some() {
                day = period_end;
                continue;
            }
        }

        upserted += upsert_invocation_summary(pool, project_id, day, period_end, "daily").await?;
        upserted +=
            upsert_perspective_breakdown(pool, project_id, day, period_end, "daily").await?;
        upserted += upsert_model_breakdown(pool, project_id, day, period_end, "daily").await?;

        day = period_end;
    }

    Ok(upserted)
}

async fn upsert_invocation_summary(
    pool: &PgPool,
    project_id: Uuid,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
    granularity: &str,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    // Aggregate into a JSON object
    let row: (i64, i64, i64, i64, Option<f64>, Option<f64>, Option<f64>) = sqlx::query_as(
        "SELECT
             COUNT(*),
             COUNT(*) FILTER (WHERE status = 'completed' AND (exit_code = 0 OR exit_code IS NULL)),
             COUNT(*) FILTER (WHERE status = 'failed' OR (status = 'completed' AND exit_code IS NOT NULL AND exit_code != 0)),
             COUNT(*) FILTER (WHERE status IN ('pending', 'running')),
             AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL),
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL),
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL)
         FROM invocations
         WHERE project_id = $1
           AND created_at >= $2
           AND created_at < $3",
    )
    .bind(project_id)
    .bind(period_start)
    .bind(period_end)
    .fetch_one(pool)
    .await?;

    let (total, success, failure, pending, avg_dur, p50, p95) = row;

    let data = serde_json::json!({
        "invocation_count": total,
        "success_count": success,
        "failure_count": failure,
        "pending_count": pending,
        "avg_duration_seconds": avg_dur.unwrap_or(0.0),
        "p50_duration_seconds": p50.unwrap_or(0.0),
        "p95_duration_seconds": p95.unwrap_or(0.0),
    });

    sqlx::query(
        "INSERT INTO metrics_snapshots (project_id, metric_type, period_start, period_end, granularity, data)
         VALUES ($1, 'invocation_summary', $2, $3, $4, $5)
         ON CONFLICT (project_id, metric_type, period_start, granularity) DO UPDATE
         SET data = EXCLUDED.data, period_end = EXCLUDED.period_end, created_at = NOW()",
    )
    .bind(project_id)
    .bind(period_start)
    .bind(period_end)
    .bind(granularity)
    .bind(data)
    .execute(pool)
    .await?;

    Ok(1)
}

async fn upsert_perspective_breakdown(
    pool: &PgPool,
    project_id: Uuid,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
    granularity: &str,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let rows: Vec<(String, i64, i64, i64, Option<f64>)> = sqlx::query_as(
        "SELECT
             COALESCE(agent_perspective, 'unknown'),
             COUNT(*),
             COUNT(*) FILTER (WHERE status = 'completed' AND (exit_code = 0 OR exit_code IS NULL)),
             COUNT(*) FILTER (WHERE status = 'failed' OR (status = 'completed' AND exit_code IS NOT NULL AND exit_code != 0)),
             AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL)
         FROM invocations
         WHERE project_id = $1
           AND created_at >= $2
           AND created_at < $3
         GROUP BY agent_perspective
         ORDER BY COUNT(*) DESC",
    )
    .bind(project_id)
    .bind(period_start)
    .bind(period_end)
    .fetch_all(pool)
    .await?;

    let by_perspective: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|(perspective, count, success, failure, avg)| {
            serde_json::json!({
                "perspective": perspective,
                "count": count,
                "success_count": success,
                "failure_count": failure,
                "avg_duration_seconds": avg.unwrap_or(0.0),
            })
        })
        .collect();

    let data = serde_json::json!({ "by_perspective": by_perspective });

    sqlx::query(
        "INSERT INTO metrics_snapshots (project_id, metric_type, period_start, period_end, granularity, data)
         VALUES ($1, 'perspective_breakdown', $2, $3, $4, $5)
         ON CONFLICT (project_id, metric_type, period_start, granularity) DO UPDATE
         SET data = EXCLUDED.data, period_end = EXCLUDED.period_end, created_at = NOW()",
    )
    .bind(project_id)
    .bind(period_start)
    .bind(period_end)
    .bind(granularity)
    .bind(data)
    .execute(pool)
    .await?;

    Ok(1)
}

async fn upsert_model_breakdown(
    pool: &PgPool,
    project_id: Uuid,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
    granularity: &str,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let rows: Vec<(String, i64, Option<f64>)> = sqlx::query_as(
        "SELECT
             model_used,
             COUNT(*),
             COALESCE(SUM(cost_usd), 0.0)
         FROM invocations
         WHERE project_id = $1
           AND model_used IS NOT NULL
           AND created_at >= $2
           AND created_at < $3
         GROUP BY model_used
         ORDER BY COUNT(*) DESC",
    )
    .bind(project_id)
    .bind(period_start)
    .bind(period_end)
    .fetch_all(pool)
    .await?;

    let by_model: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|(model, count, cost)| {
            serde_json::json!({
                "model": model,
                "count": count,
                "cost_usd": cost.unwrap_or(0.0),
            })
        })
        .collect();

    let data = serde_json::json!({ "by_model": by_model });

    sqlx::query(
        "INSERT INTO metrics_snapshots (project_id, metric_type, period_start, period_end, granularity, data)
         VALUES ($1, 'model_breakdown', $2, $3, $4, $5)
         ON CONFLICT (project_id, metric_type, period_start, granularity) DO UPDATE
         SET data = EXCLUDED.data, period_end = EXCLUDED.period_end, created_at = NOW()",
    )
    .bind(project_id)
    .bind(period_start)
    .bind(period_end)
    .bind(granularity)
    .bind(data)
    .execute(pool)
    .await?;

    Ok(1)
}
