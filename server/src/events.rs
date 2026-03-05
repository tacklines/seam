use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainEvent {
    pub id: Option<i64>,
    pub event_id: Uuid,
    pub event_type: String,
    pub aggregate_type: String,
    pub aggregate_id: Uuid,
    pub actor_id: Option<Uuid>,
    pub payload: serde_json::Value,
    pub metadata: serde_json::Value,
    pub occurred_at: DateTime<Utc>,
}

impl DomainEvent {
    pub fn new(
        event_type: &str,
        aggregate_type: &str,
        aggregate_id: Uuid,
        actor_id: Option<Uuid>,
        payload: serde_json::Value,
    ) -> Self {
        Self {
            id: None,
            event_id: Uuid::new_v4(),
            event_type: event_type.to_string(),
            aggregate_type: aggregate_type.to_string(),
            aggregate_id,
            actor_id,
            payload,
            metadata: serde_json::json!({}),
            occurred_at: Utc::now(),
        }
    }

    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = metadata;
        self
    }
}

/// Persist a domain event to the ledger. Returns the assigned sequence ID.
pub async fn emit(db: &sqlx::PgPool, event: &DomainEvent) -> Result<i64, sqlx::Error> {
    let id: (i64,) = sqlx::query_as(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, actor_id, payload, metadata, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id",
    )
    .bind(event.event_id)
    .bind(&event.event_type)
    .bind(&event.aggregate_type)
    .bind(event.aggregate_id)
    .bind(event.actor_id)
    .bind(&event.payload)
    .bind(&event.metadata)
    .bind(event.occurred_at)
    .fetch_one(db)
    .await?;

    Ok(id.0)
}

/// Query events for an aggregate, ordered by sequence.
pub async fn events_for_aggregate(
    db: &sqlx::PgPool,
    aggregate_type: &str,
    aggregate_id: Uuid,
    after_id: Option<i64>,
) -> Result<Vec<DomainEvent>, sqlx::Error> {
    let after = after_id.unwrap_or(0);
    sqlx::query_as::<_, DomainEventRow>(
        "SELECT id, event_id, event_type, aggregate_type, aggregate_id, actor_id, payload, metadata, occurred_at
         FROM domain_events
         WHERE aggregate_type = $1 AND aggregate_id = $2 AND id > $3
         ORDER BY id",
    )
    .bind(aggregate_type)
    .bind(aggregate_id)
    .bind(after)
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(Into::into).collect())
}

#[derive(Debug, sqlx::FromRow)]
struct DomainEventRow {
    id: i64,
    event_id: Uuid,
    event_type: String,
    aggregate_type: String,
    aggregate_id: Uuid,
    actor_id: Option<Uuid>,
    payload: serde_json::Value,
    metadata: serde_json::Value,
    occurred_at: DateTime<Utc>,
}

impl From<DomainEventRow> for DomainEvent {
    fn from(row: DomainEventRow) -> Self {
        Self {
            id: Some(row.id),
            event_id: row.event_id,
            event_type: row.event_type,
            aggregate_type: row.aggregate_type,
            aggregate_id: row.aggregate_id,
            actor_id: row.actor_id,
            payload: row.payload,
            metadata: row.metadata,
            occurred_at: row.occurred_at,
        }
    }
}
