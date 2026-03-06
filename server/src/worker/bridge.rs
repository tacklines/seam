use lapin::{options::*, BasicProperties, Channel};
use sqlx::PgPool;
use std::time::Duration;
use tracing::{error, info};

const POLL_INTERVAL: Duration = Duration::from_secs(5);
const BATCH_SIZE: i64 = 100;

/// Run the event bridge loop. Polls domain_events for new events
/// and publishes them to the seam.events RabbitMQ exchange.
pub async fn run(pool: PgPool, channel: Channel) {
    info!("Event bridge started");

    loop {
        match poll_and_publish(&pool, &channel).await {
            Ok(count) => {
                if count > 0 {
                    info!(count, "Bridged events to RabbitMQ");
                }
            }
            Err(e) => {
                error!(error = %e, "Event bridge poll failed");
            }
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

async fn poll_and_publish(
    pool: &PgPool,
    channel: &Channel,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    // Get current cursor position
    let cursor: (i64,) =
        sqlx::query_as("SELECT last_event_id FROM event_bridge_cursor WHERE id = 1")
            .fetch_one(pool)
            .await?;

    // Fetch new events
    let events: Vec<BridgeEvent> = sqlx::query_as(
        "SELECT id, event_type, aggregate_type, payload, metadata, occurred_at
         FROM domain_events
         WHERE id > $1
         ORDER BY id
         LIMIT $2",
    )
    .bind(cursor.0)
    .bind(BATCH_SIZE)
    .fetch_all(pool)
    .await?;

    if events.is_empty() {
        return Ok(0);
    }

    let count = events.len();
    let mut last_id = cursor.0;

    for event in &events {
        let routing_key = format!("{}.{}", event.aggregate_type, event.event_type);
        let body = serde_json::json!({
            "id": event.id,
            "event_type": event.event_type,
            "aggregate_type": event.aggregate_type,
            "payload": event.payload,
            "metadata": event.metadata,
            "occurred_at": event.occurred_at,
        });

        channel
            .basic_publish(
                "seam.events",
                &routing_key,
                BasicPublishOptions::default(),
                &serde_json::to_vec(&body)?,
                BasicProperties::default()
                    .with_content_type("application/json".into())
                    .with_delivery_mode(2), // persistent
            )
            .await?
            .await?; // wait for confirm

        last_id = event.id;
    }

    // Advance cursor atomically
    sqlx::query("UPDATE event_bridge_cursor SET last_event_id = $1, updated_at = now() WHERE id = 1")
        .bind(last_id)
        .execute(pool)
        .await?;

    Ok(count)
}

#[derive(Debug, sqlx::FromRow)]
struct BridgeEvent {
    id: i64,
    event_type: String,
    aggregate_type: String,
    payload: serde_json::Value,
    metadata: serde_json::Value,
    occurred_at: chrono::DateTime<chrono::Utc>,
}
