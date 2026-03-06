//! Integration tests for the requirements system.
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

/// Create a test user, org, project, session, and participant.
/// Returns (user_id, project_id, session_id, participant_id).
async fn create_test_context(db: &PgPool) -> (Uuid, Uuid, Uuid, Uuid) {
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
        .bind(format!("test-org-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();

    let project_id = Uuid::new_v4();
    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id)
        .bind(org_id)
        .bind("Test Project")
        .bind(format!("test-proj-{}", Uuid::new_v4()))
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

    (user_id, project_id, session_id, participant_id)
}

#[tokio::test]
async fn test_create_requirement() {
    let db = setup_db().await;
    let (user_id, project_id, _, _) = create_test_context(&db).await;

    let req_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'draft', 'medium', $5, NOW(), NOW())"
    )
    .bind(req_id)
    .bind(project_id)
    .bind("Real-time cursor presence")
    .bind("Users should see each other's cursor positions in real time")
    .bind(user_id)
    .execute(&db).await.unwrap();

    let row: (String, String, String) = sqlx::query_as(
        "SELECT title, status, priority FROM requirements WHERE id = $1"
    )
    .bind(req_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(row.0, "Real-time cursor presence");
    assert_eq!(row.1, "draft");
    assert_eq!(row.2, "medium");
}

#[tokio::test]
async fn test_requirement_hierarchy() {
    let db = setup_db().await;
    let (user_id, project_id, _, _) = create_test_context(&db).await;

    // Create parent requirement (feature-level)
    let parent_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'Real-time collaboration', 'Full real-time editing', 'active', 'high', $3, NOW(), NOW())"
    )
    .bind(parent_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Create child requirements (acceptance criteria)
    let child1_id = Uuid::new_v4();
    let child2_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requirements (id, project_id, parent_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'Cursor presence', 'See other cursors', 'draft', 'medium', $4, NOW(), NOW())"
    )
    .bind(child1_id).bind(project_id).bind(parent_id).bind(user_id)
    .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO requirements (id, project_id, parent_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'Conflict resolution', 'Handle concurrent edits', 'draft', 'high', $4, NOW(), NOW())"
    )
    .bind(child2_id).bind(project_id).bind(parent_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Query children
    let children: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, title FROM requirements WHERE parent_id = $1 ORDER BY created_at"
    )
    .bind(parent_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(children.len(), 2);
    assert_eq!(children[0].1, "Cursor presence");
    assert_eq!(children[1].1, "Conflict resolution");

    // Top-level requirements should not include children
    let top_level: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM requirements WHERE project_id = $1 AND parent_id IS NULL"
    )
    .bind(project_id)
    .fetch_all(&db).await.unwrap();
    assert_eq!(top_level.len(), 1);
    assert_eq!(top_level[0].0, parent_id);
}

#[tokio::test]
async fn test_requirement_status_constraint() {
    let db = setup_db().await;
    let (user_id, project_id, _, _) = create_test_context(&db).await;

    // Valid statuses
    for status in &["draft", "active", "satisfied", "archived"] {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, '', $4, 'medium', $5, NOW(), NOW())"
        )
        .bind(id).bind(project_id).bind(format!("Req {status}")).bind(status).bind(user_id)
        .execute(&db).await.unwrap();
    }

    // Invalid status should fail
    let result = sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'Bad', '', 'invalid_status', 'medium', $3, NOW(), NOW())"
    )
    .bind(Uuid::new_v4()).bind(project_id).bind(user_id)
    .execute(&db).await;

    assert!(result.is_err(), "Invalid status should be rejected by CHECK constraint");
}

#[tokio::test]
async fn test_requirement_task_linking() {
    let db = setup_db().await;
    let (user_id, project_id, session_id, participant_id) = create_test_context(&db).await;

    // Create a requirement
    let req_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'CRDT merge logic', 'Implement conflict-free merging', 'active', 'high', $3, NOW(), NOW())"
    )
    .bind(req_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Create tasks
    let task1_id = Uuid::new_v4();
    let task2_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 50001, 'task', 'Implement CRDT', 'open', $4, NOW(), NOW())"
    )
    .bind(task1_id).bind(session_id).bind(project_id).bind(participant_id)
    .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 50002, 'task', 'Test CRDT edge cases', 'open', $4, NOW(), NOW())"
    )
    .bind(task2_id).bind(session_id).bind(project_id).bind(participant_id)
    .execute(&db).await.unwrap();

    // Link tasks to requirement
    sqlx::query("INSERT INTO requirement_tasks (requirement_id, task_id) VALUES ($1, $2)")
        .bind(req_id).bind(task1_id)
        .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO requirement_tasks (requirement_id, task_id) VALUES ($1, $2)")
        .bind(req_id).bind(task2_id)
        .execute(&db).await.unwrap();

    // Verify links
    let linked_tasks: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT task_id FROM requirement_tasks WHERE requirement_id = $1 ORDER BY task_id"
    )
    .bind(req_id)
    .fetch_all(&db).await.unwrap();
    assert_eq!(linked_tasks.len(), 2);

    // Duplicate link should be prevented (ON CONFLICT DO NOTHING or unique constraint)
    let dup_result = sqlx::query("INSERT INTO requirement_tasks (requirement_id, task_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(req_id).bind(task1_id)
        .execute(&db).await.unwrap();
    assert_eq!(dup_result.rows_affected(), 0);

    // Unlink one task
    sqlx::query("DELETE FROM requirement_tasks WHERE requirement_id = $1 AND task_id = $2")
        .bind(req_id).bind(task2_id)
        .execute(&db).await.unwrap();

    let remaining: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT task_id FROM requirement_tasks WHERE requirement_id = $1"
    )
    .bind(req_id)
    .fetch_all(&db).await.unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].0, task1_id);
}

#[tokio::test]
async fn test_requirement_cascade_delete() {
    let db = setup_db().await;
    let (user_id, project_id, session_id, participant_id) = create_test_context(&db).await;

    // Create parent + child requirements
    let parent_id = Uuid::new_v4();
    let child_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'Parent feature', 'Top level', 'active', 'high', $3, NOW(), NOW())"
    )
    .bind(parent_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO requirements (id, project_id, parent_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'Child req', 'Sub-requirement', 'draft', 'medium', $4, NOW(), NOW())"
    )
    .bind(child_id).bind(project_id).bind(parent_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Link a task to the child requirement
    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 50003, 'task', 'Linked task', 'open', $4, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(participant_id)
    .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO requirement_tasks (requirement_id, task_id) VALUES ($1, $2)")
        .bind(child_id).bind(task_id)
        .execute(&db).await.unwrap();

    // Delete parent — child should cascade, but task should survive
    sqlx::query("DELETE FROM requirements WHERE id = $1")
        .bind(parent_id).execute(&db).await.unwrap();

    let child_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM requirements WHERE id = $1)")
        .bind(child_id).fetch_one(&db).await.unwrap();
    assert!(!child_exists, "Child requirement should be cascade deleted");

    let link_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM requirement_tasks WHERE requirement_id = $1)")
        .bind(child_id).fetch_one(&db).await.unwrap();
    assert!(!link_exists, "Requirement-task link should be cascade deleted");

    let task_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM tasks WHERE id = $1)")
        .bind(task_id).fetch_one(&db).await.unwrap();
    assert!(task_exists, "Task should NOT be cascade deleted (only the link)");
}

#[tokio::test]
async fn test_requirement_priority_constraint() {
    let db = setup_db().await;
    let (user_id, project_id, _, _) = create_test_context(&db).await;

    // Valid priorities
    for priority in &["low", "medium", "high", "critical"] {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, '', 'draft', $4, $5, NOW(), NOW())"
        )
        .bind(id).bind(project_id).bind(format!("Req {priority}")).bind(priority).bind(user_id)
        .execute(&db).await.unwrap();
    }

    // Invalid priority should fail
    let result = sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'Bad', '', 'draft', 'super_high', $3, NOW(), NOW())"
    )
    .bind(Uuid::new_v4()).bind(project_id).bind(user_id)
    .execute(&db).await;

    assert!(result.is_err(), "Invalid priority should be rejected by CHECK constraint");
}
