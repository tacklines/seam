//! Integration tests for the domain events system.
//! Requires Docker Compose running (Postgres on :5433).

use sqlx::PgPool;
use uuid::Uuid;

async fn setup_db() -> PgPool {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());
    let db = PgPool::connect(&url).await.expect("Failed to connect to test database");
    sqlx::migrate!("./migrations").run(&db).await.expect("Failed to run migrations");
    db
}

#[tokio::test]
async fn test_emit_domain_event() {
    let db = setup_db().await;
    let event_id = Uuid::new_v4();
    let aggregate_id = Uuid::new_v4();

    let id: (i64,) = sqlx::query_as(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, actor_id, payload, metadata, occurred_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, NOW())
         RETURNING id",
    )
    .bind(event_id)
    .bind("task.created")
    .bind("task")
    .bind(aggregate_id)
    .bind(serde_json::json!({"title": "Test task"}))
    .bind(serde_json::json!({}))
    .fetch_one(&db)
    .await
    .unwrap();

    assert!(id.0 > 0, "Should return a positive sequence ID");
}

#[tokio::test]
async fn test_query_events_for_aggregate() {
    let db = setup_db().await;
    let aggregate_id = Uuid::new_v4();

    // Emit 3 events for the same aggregate
    for event_type in &["task.created", "task.updated", "task.closed"] {
        sqlx::query(
            "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, occurred_at)
             VALUES ($1, $2, 'task', $3, $4, '{}', NOW())",
        )
        .bind(Uuid::new_v4())
        .bind(event_type)
        .bind(aggregate_id)
        .bind(serde_json::json!({}))
        .execute(&db)
        .await
        .unwrap();
    }

    // Query all events for this aggregate
    let events: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, event_type FROM domain_events WHERE aggregate_type = 'task' AND aggregate_id = $1 ORDER BY id",
    )
    .bind(aggregate_id)
    .fetch_all(&db)
    .await
    .unwrap();

    assert_eq!(events.len(), 3);
    assert_eq!(events[0].1, "task.created");
    assert_eq!(events[1].1, "task.updated");
    assert_eq!(events[2].1, "task.closed");
}

#[tokio::test]
async fn test_events_after_cursor() {
    let db = setup_db().await;
    let aggregate_id = Uuid::new_v4();

    // Emit 3 events, capture the ID of the second
    let mut ids = Vec::new();
    for i in 0..3 {
        let row: (i64,) = sqlx::query_as(
            "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, occurred_at)
             VALUES ($1, $2, 'task', $3, $4, '{}', NOW())
             RETURNING id",
        )
        .bind(Uuid::new_v4())
        .bind(format!("event_{i}"))
        .bind(aggregate_id)
        .bind(serde_json::json!({}))
        .fetch_one(&db)
        .await
        .unwrap();
        ids.push(row.0);
    }

    // Query events after the second one
    let events: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, event_type FROM domain_events WHERE aggregate_type = 'task' AND aggregate_id = $1 AND id > $2 ORDER BY id",
    )
    .bind(aggregate_id)
    .bind(ids[1])
    .fetch_all(&db)
    .await
    .unwrap();

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].1, "event_2");
}

#[tokio::test]
async fn test_event_payload_preserved() {
    let db = setup_db().await;
    let aggregate_id = Uuid::new_v4();
    let payload = serde_json::json!({
        "title": "Complex task",
        "tags": ["backend", "urgent"],
        "nested": {"key": "value", "count": 42}
    });

    sqlx::query(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, occurred_at)
         VALUES ($1, 'task.created', 'task', $2, $3, '{}', NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(aggregate_id)
    .bind(&payload)
    .execute(&db)
    .await
    .unwrap();

    let stored: (serde_json::Value,) = sqlx::query_as(
        "SELECT payload FROM domain_events WHERE aggregate_id = $1",
    )
    .bind(aggregate_id)
    .fetch_one(&db)
    .await
    .unwrap();

    assert_eq!(stored.0, payload);
    assert_eq!(stored.0["nested"]["count"], 42);
}

#[tokio::test]
async fn test_pg_notify_trigger() {
    let db = setup_db().await;

    // Listen for domain_events notifications
    let mut listener = sqlx::postgres::PgListener::connect_with(&db).await.unwrap();
    listener.listen("domain_events").await.unwrap();

    let aggregate_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, occurred_at)
         VALUES ($1, 'task.created', 'task', $2, '{}', '{}', NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(aggregate_id)
    .execute(&db)
    .await
    .unwrap();

    // Drain and find our specific notification (other tests may emit events concurrently)
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let notification = tokio::time::timeout_at(
            deadline,
            listener.recv(),
        )
        .await
        .expect("Timeout waiting for PG NOTIFY")
        .expect("Error receiving notification");

        let payload: serde_json::Value = serde_json::from_str(notification.payload()).unwrap();
        if payload["aggregate_id"] == aggregate_id.to_string() {
            assert_eq!(payload["event_type"], "task.created");
            assert_eq!(payload["aggregate_type"], "task");
            break;
        }
        // Not our event, keep draining
    }
}
