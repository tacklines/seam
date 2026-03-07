//! Integration tests for event reactions and scheduled jobs.
//! Tests CRUD lifecycle, project scoping, enable/disable, and cascade behavior.
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

async fn create_project(db: &PgPool) -> Uuid {
    let org_id = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(org_id).bind("Org").bind(format!("org-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    let project_id = Uuid::new_v4();
    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id).bind(org_id).bind("Proj").bind(format!("proj-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    project_id
}

// --- Event Reactions ---

#[tokio::test]
async fn test_create_event_reaction() {
    let db = setup_db().await;
    let project_id = create_project(&db).await;

    let reaction_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO event_reactions (id, project_id, name, event_type, aggregate_type, filter, action_type, action_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
    )
    .bind(reaction_id).bind(project_id)
    .bind("Auto-assign on create")
    .bind("task_created").bind("task")
    .bind(serde_json::json!({"priority": 1}))
    .bind("invoke_agent")
    .bind(serde_json::json!({"skill": "triage"}))
    .execute(&db).await.unwrap();

    let (name, event_type, enabled): (String, String, bool) = sqlx::query_as(
        "SELECT name, event_type, enabled FROM event_reactions WHERE id = $1"
    )
    .bind(reaction_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(name, "Auto-assign on create");
    assert_eq!(event_type, "task_created");
    assert!(enabled, "Should default to enabled");
}

#[tokio::test]
async fn test_disable_event_reaction() {
    let db = setup_db().await;
    let project_id = create_project(&db).await;

    let reaction_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO event_reactions (id, project_id, name, event_type, aggregate_type, action_type, action_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(reaction_id).bind(project_id)
    .bind("Test Reaction").bind("task_created").bind("task")
    .bind("webhook").bind(serde_json::json!({"url": "https://example.com"}))
    .execute(&db).await.unwrap();

    sqlx::query("UPDATE event_reactions SET enabled = false WHERE id = $1")
        .bind(reaction_id).execute(&db).await.unwrap();

    let enabled: bool = sqlx::query_scalar("SELECT enabled FROM event_reactions WHERE id = $1")
        .bind(reaction_id).fetch_one(&db).await.unwrap();
    assert!(!enabled);
}

#[tokio::test]
async fn test_event_reaction_project_scoping() {
    let db = setup_db().await;
    let project_a = create_project(&db).await;
    let project_b = create_project(&db).await;

    sqlx::query(
        "INSERT INTO event_reactions (id, project_id, name, event_type, aggregate_type, action_type, action_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(Uuid::new_v4()).bind(project_a)
    .bind("Reaction A").bind("task_created").bind("task")
    .bind("webhook").bind(serde_json::json!({}))
    .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO event_reactions (id, project_id, name, event_type, aggregate_type, action_type, action_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(Uuid::new_v4()).bind(project_b)
    .bind("Reaction B").bind("task_updated").bind("task")
    .bind("invoke_agent").bind(serde_json::json!({}))
    .execute(&db).await.unwrap();

    let count_a: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM event_reactions WHERE project_id = $1"
    )
    .bind(project_a).fetch_one(&db).await.unwrap();
    assert_eq!(count_a, 1);

    let count_b: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM event_reactions WHERE project_id = $1"
    )
    .bind(project_b).fetch_one(&db).await.unwrap();
    assert_eq!(count_b, 1);
}

#[tokio::test]
async fn test_delete_event_reaction() {
    let db = setup_db().await;
    let project_id = create_project(&db).await;

    let reaction_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO event_reactions (id, project_id, name, event_type, aggregate_type, action_type, action_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(reaction_id).bind(project_id)
    .bind("Deletable").bind("task_deleted").bind("task")
    .bind("webhook").bind(serde_json::json!({}))
    .execute(&db).await.unwrap();

    let result = sqlx::query("DELETE FROM event_reactions WHERE id = $1 AND project_id = $2")
        .bind(reaction_id).bind(project_id)
        .execute(&db).await.unwrap();
    assert_eq!(result.rows_affected(), 1);

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM event_reactions WHERE id = $1)"
    )
    .bind(reaction_id).fetch_one(&db).await.unwrap();
    assert!(!exists);
}

#[tokio::test]
async fn test_event_reaction_cascade_on_project_delete() {
    let db = setup_db().await;
    let project_id = create_project(&db).await;

    sqlx::query(
        "INSERT INTO event_reactions (id, project_id, name, event_type, aggregate_type, action_type, action_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7)"
    )
    .bind(Uuid::new_v4()).bind(project_id)
    .bind("Cascade Test").bind("task_created").bind("task")
    .bind("webhook").bind(serde_json::json!({}))
    .execute(&db).await.unwrap();

    sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(project_id).execute(&db).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM event_reactions WHERE project_id = $1"
    )
    .bind(project_id).fetch_one(&db).await.unwrap();
    assert_eq!(count, 0, "Reactions should cascade-delete with project");
}

// --- Scheduled Jobs ---

#[tokio::test]
async fn test_create_scheduled_job() {
    let db = setup_db().await;
    let project_id = create_project(&db).await;

    let job_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO scheduled_jobs (id, project_id, name, cron_expr, action_type, action_config, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour')"
    )
    .bind(job_id).bind(project_id)
    .bind("Hourly Triage").bind("0 * * * *")
    .bind("invoke_agent").bind(serde_json::json!({"skill": "triage"}))
    .execute(&db).await.unwrap();

    let (name, cron, enabled): (String, String, bool) = sqlx::query_as(
        "SELECT name, cron_expr, enabled FROM scheduled_jobs WHERE id = $1"
    )
    .bind(job_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(name, "Hourly Triage");
    assert_eq!(cron, "0 * * * *");
    assert!(enabled, "Should default to enabled");
}

#[tokio::test]
async fn test_disable_scheduled_job() {
    let db = setup_db().await;
    let project_id = create_project(&db).await;

    let job_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO scheduled_jobs (id, project_id, name, cron_expr, action_type, action_config, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour')"
    )
    .bind(job_id).bind(project_id)
    .bind("Disable Me").bind("*/5 * * * *")
    .bind("webhook").bind(serde_json::json!({}))
    .execute(&db).await.unwrap();

    sqlx::query("UPDATE scheduled_jobs SET enabled = false WHERE id = $1")
        .bind(job_id).execute(&db).await.unwrap();

    let enabled: bool = sqlx::query_scalar("SELECT enabled FROM scheduled_jobs WHERE id = $1")
        .bind(job_id).fetch_one(&db).await.unwrap();
    assert!(!enabled);
}

#[tokio::test]
async fn test_scheduled_job_project_scoping() {
    let db = setup_db().await;
    let project_a = create_project(&db).await;
    let project_b = create_project(&db).await;

    sqlx::query(
        "INSERT INTO scheduled_jobs (id, project_id, name, cron_expr, action_type, action_config, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour')"
    )
    .bind(Uuid::new_v4()).bind(project_a)
    .bind("Job A").bind("0 * * * *")
    .bind("invoke_agent").bind(serde_json::json!({}))
    .execute(&db).await.unwrap();

    let count_a: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM scheduled_jobs WHERE project_id = $1"
    )
    .bind(project_a).fetch_one(&db).await.unwrap();
    assert_eq!(count_a, 1);

    let count_b: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM scheduled_jobs WHERE project_id = $1"
    )
    .bind(project_b).fetch_one(&db).await.unwrap();
    assert_eq!(count_b, 0);
}

#[tokio::test]
async fn test_scheduled_job_last_run_tracking() {
    let db = setup_db().await;
    let project_id = create_project(&db).await;

    let job_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO scheduled_jobs (id, project_id, name, cron_expr, action_type, action_config, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour')"
    )
    .bind(job_id).bind(project_id)
    .bind("Track Runs").bind("0 * * * *")
    .bind("webhook").bind(serde_json::json!({}))
    .execute(&db).await.unwrap();

    // Initially last_run_at should be NULL
    let last_run: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT last_run_at FROM scheduled_jobs WHERE id = $1"
    )
    .bind(job_id).fetch_one(&db).await.unwrap();
    assert!(last_run.is_none());

    // Simulate a run
    sqlx::query(
        "UPDATE scheduled_jobs SET last_run_at = NOW(), next_run_at = NOW() + INTERVAL '1 hour' WHERE id = $1"
    )
    .bind(job_id).execute(&db).await.unwrap();

    let last_run: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT last_run_at FROM scheduled_jobs WHERE id = $1"
    )
    .bind(job_id).fetch_one(&db).await.unwrap();
    assert!(last_run.is_some());
}

#[tokio::test]
async fn test_scheduled_job_cascade_on_project_delete() {
    let db = setup_db().await;
    let project_id = create_project(&db).await;

    sqlx::query(
        "INSERT INTO scheduled_jobs (id, project_id, name, cron_expr, action_type, action_config, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour')"
    )
    .bind(Uuid::new_v4()).bind(project_id)
    .bind("Cascade Job").bind("0 * * * *")
    .bind("webhook").bind(serde_json::json!({}))
    .execute(&db).await.unwrap();

    sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(project_id).execute(&db).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM scheduled_jobs WHERE project_id = $1"
    )
    .bind(project_id).fetch_one(&db).await.unwrap();
    assert_eq!(count, 0, "Jobs should cascade-delete with project");
}

// --- Event Bridge Cursor ---

#[tokio::test]
async fn test_event_bridge_cursor_singleton() {
    let db = setup_db().await;

    // Should have exactly one row from migration
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM event_bridge_cursor")
        .fetch_one(&db).await.unwrap();
    assert_eq!(count, 1);

    // Update cursor
    sqlx::query("UPDATE event_bridge_cursor SET last_event_id = 42, updated_at = NOW() WHERE id = 1")
        .execute(&db).await.unwrap();

    let last_id: i64 = sqlx::query_scalar("SELECT last_event_id FROM event_bridge_cursor WHERE id = 1")
        .fetch_one(&db).await.unwrap();
    assert_eq!(last_id, 42);

    // Cannot insert a second row (CHECK id = 1)
    let result = sqlx::query(
        "INSERT INTO event_bridge_cursor (id, last_event_id) VALUES (2, 0)"
    )
    .execute(&db).await;
    assert!(result.is_err(), "Should not allow second cursor row");
}
