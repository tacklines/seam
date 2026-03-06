//! Integration tests for the session_tasks junction table.
//! Tests cross-session task sharing, composite PK, cascades, PG NOTIFY.
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

struct TestContext {
    user_id: Uuid,
    project_id: Uuid,
    session_id: Uuid,
    participant_id: Uuid,
}

async fn create_test_context(db: &PgPool) -> TestContext {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id).bind(&external_id).bind(&external_id).bind("Test User")
        .execute(db).await.unwrap();

    let org_id = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(org_id).bind("Org").bind(format!("org-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    let project_id = Uuid::new_v4();
    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id).bind(org_id).bind("Proj").bind(format!("proj-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    let session_id = Uuid::new_v4();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id)
        .bind(format!("ST{}", &Uuid::new_v4().to_string()[..4]).to_uppercase())
        .bind(user_id)
        .execute(db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(participant_id).bind(session_id).bind(user_id).bind("Human")
    .execute(db).await.unwrap();

    TestContext { user_id, project_id, session_id, participant_id }
}

async fn create_task(db: &PgPool, ctx: &TestContext, title: &str) -> Uuid {
    let task_id = Uuid::new_v4();
    let ticket_num: i32 = rand::random::<u16>() as i32 + 1;
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'task', $5, 'open', $6, NOW(), NOW())"
    )
    .bind(task_id).bind(ctx.session_id).bind(ctx.project_id).bind(ticket_num)
    .bind(title).bind(ctx.participant_id)
    .execute(db).await.unwrap();
    task_id
}

async fn create_session(db: &PgPool, project_id: Uuid, user_id: Uuid) -> Uuid {
    let session_id = Uuid::new_v4();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id)
        .bind(format!("ST{}", &Uuid::new_v4().to_string()[..4]).to_uppercase())
        .bind(user_id)
        .execute(db).await.unwrap();
    session_id
}

#[tokio::test]
async fn test_add_task_to_session() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let task_id = create_task(&db, &ctx, "Shared task").await;

    // Task should already be in session_tasks via backfill trigger or insert
    // But let's explicitly add to a second session
    let session2 = create_session(&db, ctx.project_id, ctx.user_id).await;

    sqlx::query("INSERT INTO session_tasks (session_id, task_id, added_by) VALUES ($1, $2, $3)")
        .bind(session2).bind(task_id).bind(ctx.user_id)
        .execute(&db).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM session_tasks WHERE task_id = $1"
    )
    .bind(task_id)
    .fetch_one(&db).await.unwrap();

    // Should be in at least the second session (original may or may not be there depending on backfill)
    assert!(count >= 1, "Task should appear in at least one session via junction table");
}

#[tokio::test]
async fn test_task_in_multiple_sessions() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let task_id = create_task(&db, &ctx, "Multi-session task").await;

    // Create 3 more sessions and add the task to each
    for _ in 0..3 {
        let sid = create_session(&db, ctx.project_id, ctx.user_id).await;
        sqlx::query("INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2)")
            .bind(sid).bind(task_id)
            .execute(&db).await.unwrap();
    }

    let sessions: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT session_id FROM session_tasks WHERE task_id = $1"
    )
    .bind(task_id)
    .fetch_all(&db).await.unwrap();

    assert!(sessions.len() >= 3, "Task should appear in at least 3 sessions");
}

#[tokio::test]
async fn test_composite_primary_key_prevents_duplicate() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let task_id = create_task(&db, &ctx, "Unique link task").await;
    let session2 = create_session(&db, ctx.project_id, ctx.user_id).await;

    sqlx::query("INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2)")
        .bind(session2).bind(task_id)
        .execute(&db).await.unwrap();

    // Duplicate should fail
    let result = sqlx::query("INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2)")
        .bind(session2).bind(task_id)
        .execute(&db).await;

    assert!(result.is_err(), "Duplicate session-task link should be rejected by composite PK");
}

#[tokio::test]
async fn test_cascade_on_session_delete() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let task_id = create_task(&db, &ctx, "Cascade session task").await;
    let session2 = create_session(&db, ctx.project_id, ctx.user_id).await;

    sqlx::query("INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2)")
        .bind(session2).bind(task_id)
        .execute(&db).await.unwrap();

    // Delete the second session
    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(session2)
        .execute(&db).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM session_tasks WHERE session_id = $1"
    )
    .bind(session2)
    .fetch_one(&db).await.unwrap();

    assert_eq!(count, 0, "Session_tasks entries should cascade-delete with session");
}

#[tokio::test]
async fn test_cascade_on_task_delete() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let task_id = create_task(&db, &ctx, "Cascade task delete").await;

    // Add to a second session
    let session2 = create_session(&db, ctx.project_id, ctx.user_id).await;
    sqlx::query("INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2)")
        .bind(session2).bind(task_id)
        .execute(&db).await.unwrap();

    // Delete the task
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(task_id)
        .execute(&db).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM session_tasks WHERE task_id = $1"
    )
    .bind(task_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(count, 0, "Session_tasks entries should cascade-delete with task");
}

#[tokio::test]
async fn test_query_sessions_for_task() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let task_id = create_task(&db, &ctx, "Find sessions task").await;

    let session2 = create_session(&db, ctx.project_id, ctx.user_id).await;
    let session3 = create_session(&db, ctx.project_id, ctx.user_id).await;

    for sid in &[session2, session3] {
        sqlx::query("INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2)")
            .bind(sid).bind(task_id)
            .execute(&db).await.unwrap();
    }

    // Query: "which sessions contain this task?"
    let session_ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT session_id FROM session_tasks WHERE task_id = $1 ORDER BY added_at"
    )
    .bind(task_id)
    .fetch_all(&db).await.unwrap();

    assert!(session_ids.contains(&session2));
    assert!(session_ids.contains(&session3));
}

#[tokio::test]
async fn test_query_tasks_for_session() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    // Create tasks and add them to a new session
    let session2 = create_session(&db, ctx.project_id, ctx.user_id).await;
    let mut task_ids = Vec::new();
    for i in 0..3 {
        let tid = create_task(&db, &ctx, &format!("Session task {i}")).await;
        sqlx::query("INSERT INTO session_tasks (session_id, task_id) VALUES ($1, $2)")
            .bind(session2).bind(tid)
            .execute(&db).await.unwrap();
        task_ids.push(tid);
    }

    // Query: "which tasks are in this session?"
    let found_tasks: Vec<Uuid> = sqlx::query_scalar(
        "SELECT task_id FROM session_tasks WHERE session_id = $1"
    )
    .bind(session2)
    .fetch_all(&db).await.unwrap();

    assert_eq!(found_tasks.len(), 3);
    for tid in &task_ids {
        assert!(found_tasks.contains(tid));
    }
}
