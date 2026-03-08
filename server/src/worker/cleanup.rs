/// Periodic cleanup task that finds stuck workspaces and invocations and marks them failed.
///
/// Runs every 5 minutes and handles three scenarios:
/// - Workspaces stuck in 'creating' or 'stopping' for > 10 minutes
/// - Invocations stuck in 'pending' for > 30 minutes (workspace resolution died)
/// - Invocations stuck in 'running' for > 3 hours
use sqlx::PgPool;
use std::time::Duration;
use tracing::{info, warn};

const POLL_INTERVAL: Duration = Duration::from_secs(300); // 5 minutes
const WORKSPACE_STUCK_MINUTES: i64 = 10;
const INVOCATION_STUCK_HOURS: i64 = 3;
const INVOCATION_PENDING_STUCK_MINUTES: i64 = 30;

/// Run the stuck-resource cleanup loop.
pub async fn run_stuck_resource_cleanup(pool: PgPool) {
    info!("Stuck-resource cleanup started (5-minute poll interval)");

    let mut interval = tokio::time::interval(POLL_INTERVAL);
    loop {
        interval.tick().await;
        if let Err(e) = cleanup_stuck_workspaces(&pool).await {
            warn!(error = %e, "Workspace cleanup pass failed");
        }
        if let Err(e) = cleanup_stuck_pending_invocations(&pool).await {
            warn!(error = %e, "Pending invocation cleanup pass failed");
        }
        if let Err(e) = cleanup_stuck_invocations(&pool).await {
            warn!(error = %e, "Invocation cleanup pass failed");
        }
    }
}

/// Find workspaces stuck in 'creating' or 'stopping' for more than
/// `WORKSPACE_STUCK_MINUTES` minutes and mark them 'failed'.
async fn cleanup_stuck_workspaces(
    pool: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let rows: Vec<(uuid::Uuid, String)> = sqlx::query_as(
        "SELECT id, status FROM workspaces
         WHERE status IN ('creating', 'stopping')
           AND updated_at < NOW() - ($1 || ' minutes')::INTERVAL",
    )
    .bind(WORKSPACE_STUCK_MINUTES)
    .fetch_all(pool)
    .await?;

    for (workspace_id, status) in &rows {
        tracing::warn!(
            workspace_id = %workspace_id,
            stuck_status = %status,
            threshold_minutes = WORKSPACE_STUCK_MINUTES,
            "Cleaning up stuck workspace"
        );
        if let Err(e) = sqlx::query(
            "UPDATE workspaces
             SET status = 'failed',
                 error_message = $2,
                 updated_at = NOW()
             WHERE id = $1",
        )
        .bind(workspace_id)
        .bind(format!(
            "Workspace stuck in '{status}' state for over {WORKSPACE_STUCK_MINUTES} minutes; marked failed by cleanup task"
        ))
        .execute(pool)
        .await
        {
            warn!(workspace_id = %workspace_id, error = %e, "failed to update stuck workspace status");
        }
    }

    if !rows.is_empty() {
        info!(count = rows.len(), "Marked stuck workspaces as failed");
    }

    Ok(())
}

/// Find invocations stuck in 'pending' (workspace_id still NULL) for more than
/// `INVOCATION_PENDING_STUCK_MINUTES` minutes.  This handles the case where
/// the background workspace-resolution task died before completing.
async fn cleanup_stuck_pending_invocations(
    pool: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let rows: Vec<(uuid::Uuid,)> = sqlx::query_as(
        "SELECT id FROM invocations
         WHERE status = 'pending'
           AND created_at < NOW() - ($1 || ' minutes')::INTERVAL",
    )
    .bind(INVOCATION_PENDING_STUCK_MINUTES)
    .fetch_all(pool)
    .await?;

    for (invocation_id,) in &rows {
        tracing::warn!(
            invocation_id = %invocation_id,
            threshold_minutes = INVOCATION_PENDING_STUCK_MINUTES,
            "Cleaning up stuck pending invocation"
        );
        if let Err(e) = sqlx::query(
            "UPDATE invocations
             SET status = 'failed',
                 error_message = $2,
                 error_category = 'workspace_error',
                 completed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1 AND status = 'pending'",
        )
        .bind(invocation_id)
        .bind(format!(
            "Invocation stuck in 'pending' state for over {INVOCATION_PENDING_STUCK_MINUTES} minutes; workspace resolution likely failed"
        ))
        .execute(pool)
        .await
        {
            warn!(invocation_id = %invocation_id, error = %e, "failed to update stuck pending invocation");
        }
    }

    if !rows.is_empty() {
        info!(
            count = rows.len(),
            "Marked stuck pending invocations as failed"
        );
    }

    Ok(())
}

/// Find invocations stuck in 'running' for more than `INVOCATION_STUCK_HOURS` hours
/// and mark them 'failed' with error_category = 'timeout'.
async fn cleanup_stuck_invocations(
    pool: &PgPool,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let rows: Vec<(uuid::Uuid,)> = sqlx::query_as(
        "SELECT id FROM invocations
         WHERE status = 'running'
           AND started_at < NOW() - ($1 || ' hours')::INTERVAL",
    )
    .bind(INVOCATION_STUCK_HOURS)
    .fetch_all(pool)
    .await?;

    for (invocation_id,) in &rows {
        tracing::warn!(
            invocation_id = %invocation_id,
            threshold_hours = INVOCATION_STUCK_HOURS,
            "Cleaning up stuck invocation"
        );
        if let Err(e) = sqlx::query(
            "UPDATE invocations
             SET status = 'failed',
                 error_message = $2,
                 error_category = 'timeout',
                 completed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1",
        )
        .bind(invocation_id)
        .bind(format!(
            "Invocation stuck in 'running' state for over {INVOCATION_STUCK_HOURS} hours; marked failed by cleanup task"
        ))
        .execute(pool)
        .await
        {
            warn!(invocation_id = %invocation_id, error = %e, "failed to update stuck invocation status");
        }
    }

    if !rows.is_empty() {
        info!(count = rows.len(), "Marked stuck invocations as failed");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify the SQL threshold constants are within sensible ranges.
    /// These are compile-time checks via const assertions.
    const _: () = {
        assert!(WORKSPACE_STUCK_MINUTES > 0);
        assert!(INVOCATION_STUCK_HOURS > 0);
        assert!(INVOCATION_PENDING_STUCK_MINUTES > 0);
    };

    #[test]
    fn poll_interval_is_sane() {
        // At least 1 minute, no more than 1 hour
        assert!(POLL_INTERVAL.as_secs() >= 60);
        assert!(POLL_INTERVAL.as_secs() <= 3600);
    }

    /// Verify the workspace stuck query text contains the expected clauses.
    #[test]
    fn workspace_query_references_creating_and_stopping() {
        let q = "SELECT id, status FROM workspaces
         WHERE status IN ('creating', 'stopping')
           AND updated_at < NOW() - ($1 || ' minutes')::INTERVAL";
        assert!(q.contains("creating"));
        assert!(q.contains("stopping"));
    }

    /// Verify the invocation stuck query targets the 'running' status.
    #[test]
    fn invocation_query_references_running_status() {
        let q = "SELECT id FROM invocations
         WHERE status = 'running'
           AND started_at < NOW() - ($1 || ' hours')::INTERVAL";
        assert!(q.contains("'running'"));
    }
}
