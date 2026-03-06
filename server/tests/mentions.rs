//! Integration tests for comment_mentions and unread_mentions tables.
//! Tests mention tracking, unread state, cascades, and unique constraints.
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
    session_id: Uuid,
    participant_id: Uuid,
    task_id: Uuid,
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
        .bind(format!("MN{}", &Uuid::new_v4().to_string()[..4]).to_uppercase())
        .bind(user_id)
        .execute(db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(participant_id).bind(session_id).bind(user_id).bind("Human")
    .execute(db).await.unwrap();

    let task_id = Uuid::new_v4();
    let ticket_num: i32 = rand::random::<u16>() as i32 + 1;
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'task', $5, 'open', $6, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(ticket_num)
    .bind("Test Task").bind(participant_id)
    .execute(db).await.unwrap();

    TestContext { session_id, participant_id, task_id }
}

async fn create_comment(db: &PgPool, task_id: Uuid, author_id: Uuid, content: &str) -> Uuid {
    let comment_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO task_comments (id, task_id, author_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())"
    )
    .bind(comment_id).bind(task_id).bind(author_id).bind(content)
    .execute(db).await.unwrap();
    comment_id
}

async fn create_participant(db: &PgPool, session_id: Uuid, name: &str) -> Uuid {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id).bind(&external_id).bind(&external_id).bind(name)
        .execute(db).await.unwrap();

    let pid = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(pid).bind(session_id).bind(user_id).bind(name)
    .execute(db).await.unwrap();
    pid
}

#[tokio::test]
async fn test_create_mention() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let mentioned = create_participant(&db, ctx.session_id, "Alice").await;

    let comment_id = create_comment(&db, ctx.task_id, ctx.participant_id, "Hey @Alice check this").await;

    sqlx::query(
        "INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2)"
    )
    .bind(comment_id).bind(mentioned)
    .execute(&db).await.unwrap();

    let (cid, pid): (Uuid, Uuid) = sqlx::query_as(
        "SELECT comment_id, participant_id FROM comment_mentions WHERE comment_id = $1"
    )
    .bind(comment_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(cid, comment_id);
    assert_eq!(pid, mentioned);
}

#[tokio::test]
async fn test_unread_mention() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let mentioned = create_participant(&db, ctx.session_id, "Bob").await;

    let comment_id = create_comment(&db, ctx.task_id, ctx.participant_id, "@Bob review needed").await;

    // Create both mention and unread
    sqlx::query("INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2)")
        .bind(comment_id).bind(mentioned)
        .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO unread_mentions (participant_id, comment_id, task_id, session_id) VALUES ($1, $2, $3, $4)"
    )
    .bind(mentioned).bind(comment_id).bind(ctx.task_id).bind(ctx.session_id)
    .execute(&db).await.unwrap();

    // Query unread count for the mentioned participant
    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM unread_mentions WHERE participant_id = $1"
    )
    .bind(mentioned)
    .fetch_one(&db).await.unwrap();

    assert_eq!(unread_count, 1);
}

#[tokio::test]
async fn test_clear_unread_mentions() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let mentioned = create_participant(&db, ctx.session_id, "Charlie").await;

    let comment_id = create_comment(&db, ctx.task_id, ctx.participant_id, "@Charlie done").await;

    sqlx::query("INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2)")
        .bind(comment_id).bind(mentioned)
        .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO unread_mentions (participant_id, comment_id, task_id, session_id) VALUES ($1, $2, $3, $4)"
    )
    .bind(mentioned).bind(comment_id).bind(ctx.task_id).bind(ctx.session_id)
    .execute(&db).await.unwrap();

    // User views the task — clear unread mentions
    sqlx::query("DELETE FROM unread_mentions WHERE participant_id = $1 AND task_id = $2")
        .bind(mentioned).bind(ctx.task_id)
        .execute(&db).await.unwrap();

    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM unread_mentions WHERE participant_id = $1"
    )
    .bind(mentioned)
    .fetch_one(&db).await.unwrap();

    assert_eq!(unread_count, 0, "Unread mentions should be cleared after viewing");
}

#[tokio::test]
async fn test_unread_mention_unique_constraint() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let mentioned = create_participant(&db, ctx.session_id, "Diana").await;

    let comment_id = create_comment(&db, ctx.task_id, ctx.participant_id, "@Diana hey").await;

    sqlx::query(
        "INSERT INTO unread_mentions (participant_id, comment_id, task_id, session_id) VALUES ($1, $2, $3, $4)"
    )
    .bind(mentioned).bind(comment_id).bind(ctx.task_id).bind(ctx.session_id)
    .execute(&db).await.unwrap();

    // Duplicate should fail
    let result = sqlx::query(
        "INSERT INTO unread_mentions (participant_id, comment_id, task_id, session_id) VALUES ($1, $2, $3, $4)"
    )
    .bind(mentioned).bind(comment_id).bind(ctx.task_id).bind(ctx.session_id)
    .execute(&db).await;

    assert!(result.is_err(), "Duplicate unread mention (same participant + comment) should be rejected");
}

#[tokio::test]
async fn test_mention_cascade_on_comment_delete() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let mentioned = create_participant(&db, ctx.session_id, "Eve").await;

    let comment_id = create_comment(&db, ctx.task_id, ctx.participant_id, "@Eve look").await;

    sqlx::query("INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2)")
        .bind(comment_id).bind(mentioned)
        .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO unread_mentions (participant_id, comment_id, task_id, session_id) VALUES ($1, $2, $3, $4)"
    )
    .bind(mentioned).bind(comment_id).bind(ctx.task_id).bind(ctx.session_id)
    .execute(&db).await.unwrap();

    // Delete the comment
    sqlx::query("DELETE FROM task_comments WHERE id = $1")
        .bind(comment_id)
        .execute(&db).await.unwrap();

    let mention_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM comment_mentions WHERE comment_id = $1"
    )
    .bind(comment_id)
    .fetch_one(&db).await.unwrap();

    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM unread_mentions WHERE comment_id = $1"
    )
    .bind(comment_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(mention_count, 0, "Mentions should cascade-delete with comment");
    assert_eq!(unread_count, 0, "Unread mentions should cascade-delete with comment");
}

#[tokio::test]
async fn test_mention_cascade_on_task_delete() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let mentioned = create_participant(&db, ctx.session_id, "Frank").await;

    let comment_id = create_comment(&db, ctx.task_id, ctx.participant_id, "@Frank check").await;

    sqlx::query("INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2)")
        .bind(comment_id).bind(mentioned)
        .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO unread_mentions (participant_id, comment_id, task_id, session_id) VALUES ($1, $2, $3, $4)"
    )
    .bind(mentioned).bind(comment_id).bind(ctx.task_id).bind(ctx.session_id)
    .execute(&db).await.unwrap();

    // Delete the task — should cascade to comments → mentions
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(ctx.task_id)
        .execute(&db).await.unwrap();

    let mention_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM comment_mentions WHERE comment_id = $1"
    )
    .bind(comment_id)
    .fetch_one(&db).await.unwrap();

    let unread_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM unread_mentions WHERE task_id = $1"
    )
    .bind(ctx.task_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(mention_count, 0, "Mentions should cascade when task is deleted");
    assert_eq!(unread_count, 0, "Unread mentions should cascade when task is deleted");
}

#[tokio::test]
async fn test_multiple_mentions_per_comment() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;

    let alice = create_participant(&db, ctx.session_id, "Alice").await;
    let bob = create_participant(&db, ctx.session_id, "Bob").await;
    let charlie = create_participant(&db, ctx.session_id, "Charlie").await;

    let comment_id = create_comment(&db, ctx.task_id, ctx.participant_id, "@Alice @Bob @Charlie all hands").await;

    for pid in &[alice, bob, charlie] {
        sqlx::query("INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2)")
            .bind(comment_id).bind(pid)
            .execute(&db).await.unwrap();
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM comment_mentions WHERE comment_id = $1"
    )
    .bind(comment_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(count, 3, "Should support multiple mentions per comment");
}

#[tokio::test]
async fn test_query_mentions_for_participant() {
    let db = setup_db().await;
    let ctx = create_test_context(&db).await;
    let mentioned = create_participant(&db, ctx.session_id, "Grace").await;

    // Create 3 comments mentioning Grace
    for i in 0..3 {
        let cid = create_comment(&db, ctx.task_id, ctx.participant_id, &format!("@Grace item {i}")).await;
        sqlx::query("INSERT INTO comment_mentions (comment_id, participant_id) VALUES ($1, $2)")
            .bind(cid).bind(mentioned)
            .execute(&db).await.unwrap();
    }

    // Query: "all comments that mention this participant"
    let mentions: Vec<Uuid> = sqlx::query_scalar(
        "SELECT comment_id FROM comment_mentions WHERE participant_id = $1"
    )
    .bind(mentioned)
    .fetch_all(&db).await.unwrap();

    assert_eq!(mentions.len(), 3, "Should find all comments mentioning the participant");
}
