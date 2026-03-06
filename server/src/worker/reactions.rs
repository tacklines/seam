use lapin::Channel;
use sqlx::PgPool;
use tracing::info;

/// Run the reactions consumer loop (Phase 3).
pub async fn run(_pool: PgPool, _channel: Channel) {
    info!("Reactions consumer started (not yet implemented)");
    // Will consume from seam.reactions queue and match against event_reactions table
    std::future::pending::<()>().await;
}
