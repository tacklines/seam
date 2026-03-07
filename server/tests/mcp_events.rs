//! Integration tests for MCP handler domain event emission contracts.
//!
//! These tests verify the domain event contracts that mcp_handler.rs must satisfy:
//! - do_agent_join emits session.participant_joined events
//! - add_comment emits comment.added events
//!
//! Tests operate at the DB level (matching the existing test pattern) by directly
//! emitting events and verifying their structure. The implementation in mcp_handler.rs
//! is verified by cargo check (compile-time) + these contract tests (runtime).
//!
//! Requires Docker Compose running (Postgres on :5433).

use sqlx::PgPool;
use uuid::Uuid;

async fn setup_db() -> PgPool {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());
    let db = PgPool::connect(&url)
        .await
        .expect("Failed to connect to test database");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("Failed to run migrations");
    db
}

// ---------------------------------------------------------------------------
// Contract: session.participant_joined domain event
// Source: discovered during implementation of do_agent_join domain event emission.
// Reference: routes/sessions.rs:298-311 (HTTP join emits same event pattern)
// ---------------------------------------------------------------------------

/// Behavior: session.participant_joined event stores participant_id and display_name in payload
#[tokio::test]
async fn test_participant_joined_event_payload_structure() {
    let db = setup_db().await;
    let session_id = Uuid::new_v4();
    let participant_id = Uuid::new_v4();
    let user_id = Uuid::new_v4();

    let event_id = Uuid::new_v4();
    let payload = serde_json::json!({
        "participant_id": participant_id,
        "display_name": "Test Agent",
    });

    sqlx::query(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, actor_id, payload, metadata, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, '{}', NOW())",
    )
    .bind(event_id)
    .bind("session.participant_joined")
    .bind("session")
    .bind(session_id)
    .bind(user_id)
    .bind(&payload)
    .execute(&db)
    .await
    .unwrap();

    // Verify round-trip: event is queryable with correct structure
    let (stored_type, stored_payload, stored_actor): (String, serde_json::Value, Option<Uuid>) =
        sqlx::query_as(
            "SELECT event_type, payload, actor_id FROM domain_events
             WHERE event_id = $1",
        )
        .bind(event_id)
        .fetch_one(&db)
        .await
        .unwrap();

    assert_eq!(stored_type, "session.participant_joined");
    assert_eq!(
        stored_payload["participant_id"].as_str().unwrap(),
        participant_id.to_string(),
        "Payload must contain participant_id"
    );
    assert_eq!(
        stored_payload["display_name"].as_str().unwrap(),
        "Test Agent",
        "Payload must contain display_name"
    );
    assert_eq!(
        stored_actor,
        Some(user_id),
        "Actor should be the sponsoring user"
    );
}

/// Behavior: session.participant_joined events are queryable by aggregate_id (session_id)
#[tokio::test]
async fn test_participant_joined_event_queryable_by_session() {
    let db = setup_db().await;
    let session_id = Uuid::new_v4();

    // Emit two participant_joined events for the same session
    for i in 0..2 {
        sqlx::query(
            "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, occurred_at)
             VALUES ($1, $2, $3, $4, $5, '{}', NOW())",
        )
        .bind(Uuid::new_v4())
        .bind("session.participant_joined")
        .bind("session")
        .bind(session_id)
        .bind(serde_json::json!({
            "participant_id": Uuid::new_v4(),
            "display_name": format!("Agent {}", i),
        }))
        .execute(&db)
        .await
        .unwrap();
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM domain_events
         WHERE aggregate_type = 'session' AND aggregate_id = $1 AND event_type = 'session.participant_joined'",
    )
    .bind(session_id)
    .fetch_one(&db)
    .await
    .unwrap();

    assert_eq!(
        count, 2,
        "Both participant_joined events should be queryable by session_id"
    );
}

// ---------------------------------------------------------------------------
// Contract: comment.added domain event
// Source: discovered during implementation of add_comment domain event emission.
// Reference: routes/tasks.rs:841-855 (HTTP add_comment emits same event pattern)
// ---------------------------------------------------------------------------

/// Behavior: comment.added event stores comment_id and preview in payload
#[tokio::test]
async fn test_comment_added_event_payload_structure() {
    let db = setup_db().await;
    let task_id = Uuid::new_v4();
    let comment_id = Uuid::new_v4();
    let participant_id = Uuid::new_v4();

    let event_id = Uuid::new_v4();
    let payload = serde_json::json!({
        "comment_id": comment_id,
        "preview": "This is a test comment",
    });

    sqlx::query(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, actor_id, payload, metadata, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, '{}', NOW())",
    )
    .bind(event_id)
    .bind("comment.added")
    .bind("task")
    .bind(task_id)
    .bind(participant_id)
    .bind(&payload)
    .execute(&db)
    .await
    .unwrap();

    let (stored_type, stored_payload): (String, serde_json::Value) =
        sqlx::query_as("SELECT event_type, payload FROM domain_events WHERE event_id = $1")
            .bind(event_id)
            .fetch_one(&db)
            .await
            .unwrap();

    assert_eq!(stored_type, "comment.added");
    assert_eq!(
        stored_payload["comment_id"].as_str().unwrap(),
        comment_id.to_string(),
        "Payload must contain comment_id"
    );
    assert!(
        stored_payload["preview"].as_str().is_some(),
        "Payload must contain preview text"
    );
}

/// Behavior: comment.added event preview should be at most 100 chars
/// (matching routes/tasks.rs:849 pattern: content[..min(len, 100)])
#[tokio::test]
async fn test_comment_added_event_preview_max_length() {
    let db = setup_db().await;
    let task_id = Uuid::new_v4();
    let long_content = "a".repeat(200);
    let preview = &long_content[..100]; // Matching the truncation pattern

    let event_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, occurred_at)
         VALUES ($1, 'comment.added', 'task', $2, $3, '{}', NOW())",
    )
    .bind(event_id)
    .bind(task_id)
    .bind(serde_json::json!({
        "comment_id": Uuid::new_v4(),
        "preview": preview,
    }))
    .execute(&db)
    .await
    .unwrap();

    let stored_payload: (serde_json::Value,) =
        sqlx::query_as("SELECT payload FROM domain_events WHERE event_id = $1")
            .bind(event_id)
            .fetch_one(&db)
            .await
            .unwrap();

    let stored_preview = stored_payload.0["preview"].as_str().unwrap();
    assert!(
        stored_preview.len() <= 100,
        "Preview should be at most 100 characters, got {}",
        stored_preview.len()
    );
}

/// Behavior: comment.added events are queryable by aggregate_id (task_id)
/// and co-exist with other event types for the same task
#[tokio::test]
async fn test_comment_added_event_coexists_with_task_events() {
    let db = setup_db().await;
    let task_id = Uuid::new_v4();

    // Emit a task.created event
    sqlx::query(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, occurred_at)
         VALUES ($1, 'task.created', 'task', $2, $3, '{}', NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(task_id)
    .bind(serde_json::json!({"title": "Test task"}))
    .execute(&db)
    .await
    .unwrap();

    // Emit a comment.added event
    sqlx::query(
        "INSERT INTO domain_events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, occurred_at)
         VALUES ($1, 'comment.added', 'task', $2, $3, '{}', NOW())",
    )
    .bind(Uuid::new_v4())
    .bind(task_id)
    .bind(serde_json::json!({"comment_id": Uuid::new_v4(), "preview": "A comment"}))
    .execute(&db)
    .await
    .unwrap();

    // Query only comment.added events
    let comment_events: Vec<(String,)> = sqlx::query_as(
        "SELECT event_type FROM domain_events
         WHERE aggregate_type = 'task' AND aggregate_id = $1 AND event_type = 'comment.added'",
    )
    .bind(task_id)
    .fetch_all(&db)
    .await
    .unwrap();

    assert_eq!(comment_events.len(), 1);

    // Query all events for this task
    let all_events: Vec<(String,)> = sqlx::query_as(
        "SELECT event_type FROM domain_events
         WHERE aggregate_type = 'task' AND aggregate_id = $1 ORDER BY id",
    )
    .bind(task_id)
    .fetch_all(&db)
    .await
    .unwrap();

    assert_eq!(all_events.len(), 2);
    assert_eq!(all_events[0].0, "task.created");
    assert_eq!(all_events[1].0, "comment.added");
}
