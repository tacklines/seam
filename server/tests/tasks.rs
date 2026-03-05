//! Integration tests for the task management system.
//! Requires Docker Compose running (Postgres on :5433).

use sqlx::PgPool;
use uuid::Uuid;
use chrono::Utc;
use std::sync::atomic::{AtomicI32, Ordering};

/// Per-test ticket counter to avoid unique constraint violations across concurrent tests.
static TICKET_COUNTER: AtomicI32 = AtomicI32::new(10000);

fn next_ticket() -> i32 {
    TICKET_COUNTER.fetch_add(1, Ordering::Relaxed)
}

async fn setup_db() -> PgPool {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());
    let db = PgPool::connect(&url).await.expect("Failed to connect to test database");
    sqlx::migrate!("./migrations").run(&db).await.expect("Failed to run migrations");
    db
}

/// Create a test user, org, project, session, and participant for task tests.
/// Returns (session_id, project_id, participant_id).
async fn create_test_session(db: &PgPool) -> (Uuid, Uuid, Uuid) {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id)
        .bind(&external_id)
        .bind(&external_id)
        .bind("Test User")
        .execute(db).await.unwrap();

    let org_id = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(org_id)
        .bind("Test Org")
        .bind(format!("test-org-{}", &external_id[..8]))
        .execute(db).await.unwrap();

    let project_id = Uuid::new_v4();
    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id)
        .bind(org_id)
        .bind("Test Project")
        .bind(format!("test-proj-{}", &external_id[..8]))
        .execute(db).await.unwrap();

    let session_id = Uuid::new_v4();
    let session_code = format!("{}", &session_id.to_string()[..6]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id)
        .bind(project_id)
        .bind(&session_code)
        .bind(user_id)
        .execute(db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query("INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) VALUES ($1, $2, $3, $4, 'human', NOW())")
        .bind(participant_id)
        .bind(session_id)
        .bind(user_id)
        .bind("Test User")
        .execute(db).await.unwrap();

    (session_id, project_id, participant_id)
}

#[tokio::test]
async fn test_create_task() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, parent_id, task_type, title, description, status, assigned_to, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, 'task', $5, $6, 'open', NULL, $7, NOW(), NOW())"
    )
    .bind(task_id)
    .bind(session_id)
    .bind(project_id)
    .bind(next_ticket())
    .bind("Implement login form")
    .bind("Add username/password fields with validation")
    .bind(participant_id)
    .execute(&db).await.unwrap();

    // Verify it was created
    let row: (String, String, String) = sqlx::query_as(
        "SELECT title, task_type, status FROM tasks WHERE id = $1"
    )
    .bind(task_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(row.0, "Implement login form");
    assert_eq!(row.1, "task");
    assert_eq!(row.2, "open");
}

#[tokio::test]
async fn test_task_hierarchy() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    // Create epic
    let epic_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'epic', 'User Authentication', 'open', $5, NOW(), NOW())"
    )
    .bind(epic_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await.unwrap();

    // Create story under epic
    let story_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, parent_id, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'story', 'Login flow', 'open', $6, NOW(), NOW())"
    )
    .bind(story_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(epic_id).bind(participant_id)
    .execute(&db).await.unwrap();

    // Create task under story
    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, parent_id, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'task', 'Build login form', 'open', $6, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(story_id).bind(participant_id)
    .execute(&db).await.unwrap();

    // Create subtask under task
    let subtask_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, parent_id, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'subtask', 'Add password validation', 'open', $6, NOW(), NOW())"
    )
    .bind(subtask_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(task_id).bind(participant_id)
    .execute(&db).await.unwrap();

    // Query children of epic
    let children: Vec<(Uuid, String, String)> = sqlx::query_as(
        "SELECT id, task_type, title FROM tasks WHERE parent_id = $1 ORDER BY created_at"
    )
    .bind(epic_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(children.len(), 1);
    assert_eq!(children[0].1, "story");
    assert_eq!(children[0].2, "Login flow");

    // Query children of story
    let story_children: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, title FROM tasks WHERE parent_id = $1"
    )
    .bind(story_id)
    .fetch_all(&db).await.unwrap();
    assert_eq!(story_children.len(), 1);
    assert_eq!(story_children[0].1, "Build login form");

    // Query children of task
    let task_children: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, title FROM tasks WHERE parent_id = $1"
    )
    .bind(task_id)
    .fetch_all(&db).await.unwrap();
    assert_eq!(task_children.len(), 1);
    assert_eq!(task_children[0].1, "Add password validation");
}

#[tokio::test]
async fn test_task_types() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    for task_type in &["epic", "story", "task", "subtask", "bug"] {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, NOW(), NOW())"
        )
        .bind(id).bind(session_id).bind(project_id).bind(next_ticket()).bind(task_type).bind(format!("Test {task_type}")).bind(participant_id)
        .execute(&db).await.unwrap();
    }

    // Invalid type should fail
    let result = sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'invalid_type', 'Bad', 'open', $5, NOW(), NOW())"
    )
    .bind(Uuid::new_v4()).bind(session_id).bind(project_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await;

    assert!(result.is_err(), "Invalid task_type should be rejected by CHECK constraint");
}

#[tokio::test]
async fn test_task_statuses() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'task', 'Status test', 'open', $5, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await.unwrap();

    // Transition through statuses
    for status in &["in_progress", "done", "closed"] {
        sqlx::query("UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2")
            .bind(status).bind(task_id)
            .execute(&db).await.unwrap();

        let current: (String,) = sqlx::query_as("SELECT status FROM tasks WHERE id = $1")
            .bind(task_id).fetch_one(&db).await.unwrap();
        assert_eq!(current.0, *status);
    }

    // Invalid status should fail
    let result = sqlx::query("UPDATE tasks SET status = 'invalid' WHERE id = $1")
        .bind(task_id).execute(&db).await;
    assert!(result.is_err(), "Invalid status should be rejected by CHECK constraint");
}

#[tokio::test]
async fn test_task_comments() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'bug', 'Login broken', 'open', $5, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await.unwrap();

    // Add comments
    let c1 = Uuid::new_v4();
    sqlx::query("INSERT INTO task_comments (id, task_id, author_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(c1).bind(task_id).bind(participant_id)
        .bind("Found the issue in `auth.rs:42` — token validation skips expiry check")
        .execute(&db).await.unwrap();

    let c2 = Uuid::new_v4();
    sqlx::query("INSERT INTO task_comments (id, task_id, author_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(c2).bind(task_id).bind(participant_id)
        .bind("Fixed in commit abc123")
        .execute(&db).await.unwrap();

    // Fetch comments
    let comments: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, content FROM task_comments WHERE task_id = $1 ORDER BY created_at"
    )
    .bind(task_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(comments.len(), 2);
    assert!(comments[0].1.contains("auth.rs:42"));
    assert!(comments[1].1.contains("abc123"));
}

#[tokio::test]
async fn test_task_commit_link() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'task', 'Fix the thing', 'in_progress', $5, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await.unwrap();

    // Close with commit SHA
    let sha = "abc123def456";
    sqlx::query(
        "UPDATE tasks SET status = 'closed', commit_sha = $1, closed_at = NOW(), updated_at = NOW() WHERE id = $2"
    )
    .bind(sha).bind(task_id)
    .execute(&db).await.unwrap();

    let row: (String, String, Option<chrono::DateTime<Utc>>) = sqlx::query_as(
        "SELECT status, commit_sha, closed_at FROM tasks WHERE id = $1"
    )
    .bind(task_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(row.0, "closed");
    assert_eq!(row.1, sha);
    assert!(row.2.is_some(), "closed_at should be set");
}

#[tokio::test]
async fn test_task_assignment() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, assigned_to, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'task', 'Assigned task', 'open', $5, $5, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await.unwrap();

    let row: (Option<Uuid>,) = sqlx::query_as("SELECT assigned_to FROM tasks WHERE id = $1")
        .bind(task_id).fetch_one(&db).await.unwrap();
    assert_eq!(row.0, Some(participant_id));

    // Unassign
    sqlx::query("UPDATE tasks SET assigned_to = NULL WHERE id = $1")
        .bind(task_id).execute(&db).await.unwrap();

    let row: (Option<Uuid>,) = sqlx::query_as("SELECT assigned_to FROM tasks WHERE id = $1")
        .bind(task_id).fetch_one(&db).await.unwrap();
    assert_eq!(row.0, None);
}

#[tokio::test]
async fn test_cascade_delete_on_parent() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    let parent_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'story', 'Parent story', 'open', $5, NOW(), NOW())"
    )
    .bind(parent_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await.unwrap();

    let child_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, parent_id, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'task', 'Child task', 'open', $6, NOW(), NOW())"
    )
    .bind(child_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(parent_id).bind(participant_id)
    .execute(&db).await.unwrap();

    // Add a comment to the child
    sqlx::query("INSERT INTO task_comments (id, task_id, author_id, content, created_at) VALUES ($1, $2, $3, 'test comment', NOW())")
        .bind(Uuid::new_v4()).bind(child_id).bind(participant_id)
        .execute(&db).await.unwrap();

    // Delete parent — should cascade to child and child's comments
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(parent_id).execute(&db).await.unwrap();

    let child_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)")
        .bind(child_id).fetch_one(&db).await.unwrap();
    assert!(!child_exists, "Child task should be cascade deleted");

    let comment_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM task_comments WHERE task_id = $1)")
        .bind(child_id).fetch_one(&db).await.unwrap();
    assert!(!comment_exists, "Child's comments should be cascade deleted");
}

#[tokio::test]
async fn test_list_tasks_by_filter() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    // Create tasks of different types and statuses
    for (task_type, title, status) in &[
        ("epic", "Epic 1", "open"),
        ("story", "Story 1", "open"),
        ("task", "Task 1", "in_progress"),
        ("bug", "Bug 1", "open"),
        ("task", "Task 2", "done"),
    ] {
        sqlx::query(
            "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())"
        )
        .bind(Uuid::new_v4()).bind(session_id).bind(project_id).bind(next_ticket()).bind(task_type).bind(title).bind(status).bind(participant_id)
        .execute(&db).await.unwrap();
    }

    // Filter by type
    let bugs: Vec<(String,)> = sqlx::query_as(
        "SELECT title FROM tasks WHERE session_id = $1 AND task_type = 'bug'"
    ).bind(session_id).fetch_all(&db).await.unwrap();
    assert_eq!(bugs.len(), 1);
    assert_eq!(bugs[0].0, "Bug 1");

    // Filter by status
    let in_progress: Vec<(String,)> = sqlx::query_as(
        "SELECT title FROM tasks WHERE session_id = $1 AND status = 'in_progress'"
    ).bind(session_id).fetch_all(&db).await.unwrap();
    assert_eq!(in_progress.len(), 1);
    assert_eq!(in_progress[0].0, "Task 1");

    // Top-level only (no parent)
    let top_level: Vec<(String,)> = sqlx::query_as(
        "SELECT title FROM tasks WHERE session_id = $1 AND parent_id IS NULL ORDER BY created_at"
    ).bind(session_id).fetch_all(&db).await.unwrap();
    assert_eq!(top_level.len(), 5);
}

#[tokio::test]
async fn test_delete_task_standalone() {
    let db = setup_db().await;
    let (session_id, project_id, participant_id) = create_test_session(&db).await;

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'task', 'Delete me', 'open', $5, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(next_ticket()).bind(participant_id)
    .execute(&db).await.unwrap();

    // Verify it exists
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)")
        .bind(task_id).fetch_one(&db).await.unwrap();
    assert!(exists);

    // Delete it
    let result = sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(task_id).execute(&db).await.unwrap();
    assert_eq!(result.rows_affected(), 1);

    // Verify it's gone
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)")
        .bind(task_id).fetch_one(&db).await.unwrap();
    assert!(!exists, "Task should be deleted");
}

#[tokio::test]
async fn test_delete_nonexistent_task() {
    let db = setup_db().await;

    let fake_id = Uuid::new_v4();
    let result = sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(fake_id).execute(&db).await.unwrap();
    assert_eq!(result.rows_affected(), 0, "Deleting nonexistent task should affect 0 rows");
}
