use cron::Schedule;
use chrono::Utc;
use sqlx::PgPool;
use std::str::FromStr;
use std::time::Duration;
use tracing::{info, warn, error};
use uuid::Uuid;

const POLL_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Debug, sqlx::FromRow)]
struct ScheduledJob {
    id: Uuid,
    project_id: Uuid,
    name: String,
    cron_expr: String,
    action_type: String,
    action_config: serde_json::Value,
}

/// Run the cron scheduler loop.
pub async fn run(pool: PgPool) {
    info!("Cron scheduler started (30s poll interval)");

    loop {
        match poll_and_dispatch(&pool).await {
            Ok(count) => {
                if count > 0 {
                    info!(count, "Dispatched scheduled jobs");
                }
            }
            Err(e) => {
                error!(error = %e, "Scheduler poll failed");
            }
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

async fn poll_and_dispatch(pool: &PgPool) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let now = Utc::now();

    // Fetch due jobs
    let jobs: Vec<ScheduledJob> = sqlx::query_as(
        "SELECT id, project_id, name, cron_expr, action_type, action_config
         FROM scheduled_jobs
         WHERE enabled = true AND next_run_at <= $1
         ORDER BY next_run_at
         LIMIT 50"
    )
    .bind(now)
    .fetch_all(pool)
    .await?;

    let mut dispatched = 0;

    for job in &jobs {
        info!(
            job_id = %job.id,
            job_name = %job.name,
            action_type = %job.action_type,
            "Dispatching scheduled job"
        );

        // Dispatch the action
        if let Err(e) = dispatch_job_action(pool, job).await {
            error!(
                job_id = %job.id,
                error = %e,
                "Failed to dispatch scheduled job"
            );
            // Continue to update next_run_at even on failure
        }

        // Compute next run time
        match compute_next_run(&job.cron_expr) {
            Ok(next) => {
                sqlx::query(
                    "UPDATE scheduled_jobs
                     SET last_run_at = $2, next_run_at = $3, updated_at = now()
                     WHERE id = $1"
                )
                .bind(job.id)
                .bind(now)
                .bind(next)
                .execute(pool)
                .await?;
            }
            Err(e) => {
                // Disable jobs with invalid cron expressions
                warn!(
                    job_id = %job.id,
                    cron_expr = %job.cron_expr,
                    error = %e,
                    "Invalid cron expression, disabling job"
                );
                sqlx::query(
                    "UPDATE scheduled_jobs SET enabled = false, updated_at = now() WHERE id = $1"
                )
                .bind(job.id)
                .execute(pool)
                .await?;
            }
        }

        dispatched += 1;
    }

    Ok(dispatched)
}

fn compute_next_run(cron_expr: &str) -> Result<chrono::DateTime<Utc>, Box<dyn std::error::Error + Send + Sync>> {
    // The cron crate expects 7-field expressions (sec min hour day month weekday year)
    // but users write 5-field (min hour day month weekday).
    // Prepend "0 " for seconds and append " *" for year if needed.
    let normalized = match cron_expr.split_whitespace().count() {
        5 => format!("0 {} *", cron_expr),
        6 => format!("0 {}", cron_expr),
        7 => cron_expr.to_string(),
        _ => return Err(format!("Invalid cron expression: {}", cron_expr).into()),
    };

    let schedule = Schedule::from_str(&normalized)?;
    schedule
        .upcoming(Utc)
        .next()
        .ok_or_else(|| "No upcoming schedule time".into())
}

async fn dispatch_job_action(
    pool: &PgPool,
    job: &ScheduledJob,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ctx = super::actions::ActionContext {
        event_payload: None,
        project_id: job.project_id,
        source: format!("schedule:{}", job.name),
    };
    super::actions::dispatch(pool, &job.action_type, &job.action_config, &ctx).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_next_run_5_field() {
        // Every minute
        let result = compute_next_run("* * * * *");
        assert!(result.is_ok());
        let next = result.unwrap();
        assert!(next > Utc::now());
    }

    #[test]
    fn test_compute_next_run_daily() {
        // Daily at 3am
        let result = compute_next_run("0 3 * * *");
        assert!(result.is_ok());
    }

    #[test]
    fn test_compute_next_run_invalid() {
        let result = compute_next_run("not a cron");
        assert!(result.is_err());
    }
}
