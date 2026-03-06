//! Event-driven knowledge indexing consumer.
//!
//! Watches the `domain_events` table via PG NOTIFY and indexes task, comment,
//! and plan content into the `knowledge_chunks` table for hybrid search.
//!
//! Embeddings are NOT generated here — they are left NULL for a downstream
//! embedding service (seam-38) to fill in.

use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::time::Duration;
use uuid::Uuid;

use crate::events::DomainEvent;
use crate::knowledge::{delete_chunks_for_source, upsert_chunk, ChunkInput};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Start the indexing consumer as a background Tokio task.
/// Call this from main.rs after creating the DB pool.
pub async fn start_indexer(pool: PgPool) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            if let Err(e) = run_indexer(&pool).await {
                tracing::warn!("knowledge indexer error, restarting in 10s: {e}");
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        }
    })
}

// ---------------------------------------------------------------------------
// Internal runner
// ---------------------------------------------------------------------------

async fn run_indexer(pool: &PgPool) -> Result<(), anyhow::Error> {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());

    let mut listener = sqlx::postgres::PgListener::connect(&database_url).await?;
    // The trigger in 012_domain_events.sql fires on channel 'domain_events'
    listener.listen("domain_events").await?;

    tracing::info!("knowledge indexer started, listening on 'domain_events' channel");

    loop {
        // Process any events accumulated since last cursor (startup catch-up or
        // after a reconnect). Then wait for the next NOTIFY or a 5-second poll.
        process_pending_events(pool).await;

        tokio::select! {
            result = listener.recv() => {
                match result {
                    Ok(_) => {
                        // A new event was notified — drain the pending batch.
                        process_pending_events(pool).await;
                    }
                    Err(e) => {
                        tracing::warn!("PG listener recv error: {e}");
                        return Err(e.into());
                    }
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(5)) => {
                // Fallback poll — covers events that somehow slipped past NOTIFY.
            }
        }
    }
}

/// Read all unprocessed events since the cursor, process them, and advance.
async fn process_pending_events(pool: &PgPool) {
    let cursor = match get_cursor(pool).await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("failed to read indexer cursor: {e}");
            return;
        }
    };

    loop {
        let rows: Vec<DomainEventRow> = match sqlx::query_as(
            "SELECT id, event_id, event_type, aggregate_type, aggregate_id, actor_id, payload, metadata, occurred_at
             FROM domain_events
             WHERE id > $1
             ORDER BY id
             LIMIT 100",
        )
        .bind(cursor)
        .fetch_all(pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("failed to query domain_events: {e}");
                return;
            }
        };

        if rows.is_empty() {
            break;
        }

        let last_id = rows.last().map(|r| r.id).unwrap_or(cursor);
        let events: Vec<DomainEvent> = rows.into_iter().map(Into::into).collect();

        if let Err(e) = process_events(pool, events).await {
            tracing::warn!("failed to process event batch ending at {last_id}: {e}");
            // Do not advance cursor — we'll retry on next wake-up.
            return;
        }

        if let Err(e) = update_cursor(pool, last_id).await {
            tracing::warn!("failed to update indexer cursor: {e}");
            return;
        }

        // If we got a full page, keep draining.
        if last_id == cursor {
            break;
        }
        // Only continue if we fetched a full batch (more may exist)
        // We break if we processed fewer than 100 to avoid infinite loops on errors.
        // Actually we just loop again — if empty it breaks at top.
    }
}

/// Process a batch of domain events into knowledge chunks.
async fn process_events(
    pool: &PgPool,
    events: Vec<DomainEvent>,
) -> Result<(), anyhow::Error> {
    for event in events {
        let id = event.id.unwrap_or(0);
        if let Err(e) = process_single_event(pool, &event).await {
            tracing::warn!(
                event_id = %event.event_id,
                event_type = %event.event_type,
                seq_id = id,
                "failed to index event: {e}"
            );
            // Continue processing other events; don't fail the whole batch.
        }
    }
    Ok(())
}

async fn process_single_event(
    pool: &PgPool,
    event: &DomainEvent,
) -> Result<(), anyhow::Error> {
    match event.event_type.as_str() {
        "task.created" | "task.updated" | "task.closed" => {
            // Re-fetch the full task to get current title, description, org_id, project_id
            index_task(pool, event.aggregate_id).await?;
        }
        "task.deleted" => {
            // Remove all chunks for this task
            delete_chunks_for_source(pool, event.aggregate_id).await?;
        }
        "comment.added" => {
            if let Some(comment_id_val) = event.payload.get("comment_id") {
                if let Some(comment_id_str) = comment_id_val.as_str() {
                    if let Ok(comment_id) = comment_id_str.parse::<Uuid>() {
                        index_comment(pool, comment_id, event.aggregate_id).await?;
                    }
                }
            }
        }
        "plan.created" | "plan.updated" => {
            index_plan(pool, event.aggregate_id).await?;
        }
        "plan.deleted" => {
            delete_chunks_for_source(pool, event.aggregate_id).await?;
        }
        _ => {
            // Event type not indexed — skip silently.
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Per-entity indexers
// ---------------------------------------------------------------------------

/// Look up the full task and upsert title + description chunks.
async fn index_task(pool: &PgPool, task_id: Uuid) -> Result<(), anyhow::Error> {
    #[derive(sqlx::FromRow)]
    struct TaskRow {
        title: String,
        description: Option<String>,
        project_id: Uuid,
        org_id: Uuid,
        ticket_number: i32,
    }

    let row: Option<TaskRow> = sqlx::query_as(
        "SELECT t.title, t.description, t.project_id,
                p.org_id,
                t.ticket_number
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.id = $1",
    )
    .bind(task_id)
    .fetch_optional(pool)
    .await?;

    let Some(task) = row else {
        // Task was deleted before we processed it — nothing to index.
        return Ok(());
    };

    // Title chunk
    upsert_chunk(
        pool,
        &ChunkInput {
            org_id: task.org_id,
            project_id: Some(task.project_id),
            content_type: "task".to_string(),
            source_id: task_id,
            source_field: Some("title".to_string()),
            chunk_hash: sha256_hex(&task.title),
            chunk_text: task.title.clone(),
            embedding: None,
            metadata: serde_json::json!({
                "ticket_number": task.ticket_number,
                "project_id": task.project_id,
            }),
        },
    )
    .await?;

    // Description chunk (only if non-empty)
    if let Some(desc) = task.description {
        if !desc.trim().is_empty() {
            upsert_chunk(
                pool,
                &ChunkInput {
                    org_id: task.org_id,
                    project_id: Some(task.project_id),
                    content_type: "task".to_string(),
                    source_id: task_id,
                    source_field: Some("description".to_string()),
                    chunk_hash: sha256_hex(&desc),
                    chunk_text: desc,
                    embedding: None,
                    metadata: serde_json::json!({
                        "ticket_number": task.ticket_number,
                        "project_id": task.project_id,
                    }),
                },
            )
            .await?;
        }
    }

    Ok(())
}

/// Look up the full comment and upsert a content chunk.
/// `task_id` is the `aggregate_id` from the event (comments belong to tasks).
async fn index_comment(
    pool: &PgPool,
    comment_id: Uuid,
    task_id: Uuid,
) -> Result<(), anyhow::Error> {
    #[derive(sqlx::FromRow)]
    struct CommentRow {
        content: String,
        project_id: Uuid,
        org_id: Uuid,
    }

    let row: Option<CommentRow> = sqlx::query_as(
        "SELECT tc.content, t.project_id, p.org_id
         FROM task_comments tc
         JOIN tasks t ON t.id = tc.task_id
         JOIN projects p ON p.id = t.project_id
         WHERE tc.id = $1",
    )
    .bind(comment_id)
    .fetch_optional(pool)
    .await?;

    let Some(comment) = row else {
        return Ok(());
    };

    if comment.content.trim().is_empty() {
        return Ok(());
    }

    upsert_chunk(
        pool,
        &ChunkInput {
            org_id: comment.org_id,
            project_id: Some(comment.project_id),
            content_type: "comment".to_string(),
            source_id: comment_id,
            source_field: Some("content".to_string()),
            chunk_hash: sha256_hex(&comment.content),
            chunk_text: comment.content,
            embedding: None,
            metadata: serde_json::json!({
                "task_id": task_id,
                "project_id": comment.project_id,
            }),
        },
    )
    .await?;

    Ok(())
}

/// Look up the full plan and upsert title + content chunks.
async fn index_plan(pool: &PgPool, plan_id: Uuid) -> Result<(), anyhow::Error> {
    #[derive(sqlx::FromRow)]
    struct PlanRow {
        title: String,
        content: Option<String>,
        project_id: Uuid,
        org_id: Uuid,
    }

    let row: Option<PlanRow> = sqlx::query_as(
        "SELECT pl.title, pl.content, pl.project_id, p.org_id
         FROM plans pl
         JOIN projects p ON p.id = pl.project_id
         WHERE pl.id = $1",
    )
    .bind(plan_id)
    .fetch_optional(pool)
    .await?;

    let Some(plan) = row else {
        return Ok(());
    };

    // Title chunk
    upsert_chunk(
        pool,
        &ChunkInput {
            org_id: plan.org_id,
            project_id: Some(plan.project_id),
            content_type: "plan".to_string(),
            source_id: plan_id,
            source_field: Some("title".to_string()),
            chunk_hash: sha256_hex(&plan.title),
            chunk_text: plan.title.clone(),
            embedding: None,
            metadata: serde_json::json!({ "project_id": plan.project_id }),
        },
    )
    .await?;

    // Content chunk (only if non-empty)
    if let Some(content) = plan.content {
        if !content.trim().is_empty() {
            upsert_chunk(
                pool,
                &ChunkInput {
                    org_id: plan.org_id,
                    project_id: Some(plan.project_id),
                    content_type: "plan".to_string(),
                    source_id: plan_id,
                    source_field: Some("content".to_string()),
                    chunk_hash: sha256_hex(&content),
                    chunk_text: content,
                    embedding: None,
                    metadata: serde_json::json!({ "project_id": plan.project_id }),
                },
            )
            .await?;
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Cursor management
// ---------------------------------------------------------------------------

async fn get_cursor(pool: &PgPool) -> Result<i64, sqlx::Error> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT last_processed_id FROM consumer_cursors WHERE consumer_name = 'knowledge_indexer'",
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.0).unwrap_or(0))
}

async fn update_cursor(pool: &PgPool, last_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO consumer_cursors (consumer_name, last_processed_id, updated_at)
         VALUES ('knowledge_indexer', $1, now())
         ON CONFLICT (consumer_name) DO UPDATE
             SET last_processed_id = $1, updated_at = now()",
    )
    .bind(last_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

// ---------------------------------------------------------------------------
// sqlx row type (mirrors DomainEventRow in events.rs, but local to indexer)
// ---------------------------------------------------------------------------

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
    occurred_at: chrono::DateTime<chrono::Utc>,
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
