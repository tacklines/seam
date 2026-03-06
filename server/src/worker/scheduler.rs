use sqlx::PgPool;
use tracing::info;

/// Run the cron scheduler loop (Phase 4).
pub async fn run(_pool: PgPool) {
    info!("Cron scheduler started (not yet implemented)");
    // Will poll scheduled_jobs for due jobs every 30s
    std::future::pending::<()>().await;
}
