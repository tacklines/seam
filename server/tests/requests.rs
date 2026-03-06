//! Integration tests for the requests system (request-to-requirements flow).
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

/// Create a test user, org, project.
/// Returns (user_id, project_id).
async fn create_test_context(db: &PgPool) -> (Uuid, Uuid) {
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

    (user_id, project_id)
}

#[tokio::test]
async fn test_create_request() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    let req_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())"
    )
    .bind(req_id)
    .bind(project_id)
    .bind(user_id)
    .bind("I want real-time collaboration")
    .bind("Multiple users should be able to edit the same document simultaneously with live cursor presence.")
    .execute(&db).await.unwrap();

    let row: (String, String, String) = sqlx::query_as(
        "SELECT title, status, body FROM requests WHERE id = $1"
    )
    .bind(req_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(row.0, "I want real-time collaboration");
    assert_eq!(row.1, "pending");
    assert!(row.2.contains("cursor presence"));
}

#[tokio::test]
async fn test_request_status_constraint() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    // Valid statuses
    for status in &["pending", "analyzing", "decomposed", "archived"] {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'body', $5, NOW(), NOW())"
        )
        .bind(id).bind(project_id).bind(user_id).bind(format!("Req {status}")).bind(status)
        .execute(&db).await.unwrap();
    }

    // Invalid status should fail
    let result = sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Bad', 'body', 'invalid_status', NOW(), NOW())"
    )
    .bind(Uuid::new_v4()).bind(project_id).bind(user_id)
    .execute(&db).await;

    assert!(result.is_err(), "Invalid status should be rejected by CHECK constraint");
}

#[tokio::test]
async fn test_request_status_transitions() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    let req_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Test', 'body', 'pending', NOW(), NOW())"
    )
    .bind(req_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    // pending -> analyzing -> decomposed -> archived
    for status in &["analyzing", "decomposed", "archived"] {
        sqlx::query("UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2")
            .bind(status).bind(req_id)
            .execute(&db).await.unwrap();

        let current: (String,) = sqlx::query_as("SELECT status FROM requests WHERE id = $1")
            .bind(req_id).fetch_one(&db).await.unwrap();
        assert_eq!(current.0, *status);
    }
}

#[tokio::test]
async fn test_request_analysis_field() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    let req_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Feature request', 'I want X', 'analyzing', NOW(), NOW())"
    )
    .bind(req_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Analysis starts as NULL
    let row: (Option<String>,) = sqlx::query_as("SELECT analysis FROM requests WHERE id = $1")
        .bind(req_id).fetch_one(&db).await.unwrap();
    assert!(row.0.is_none());

    // Agent writes analysis
    let analysis = "## Analysis\n\nThis request maps to 3 existing requirements and needs 2 new ones.";
    sqlx::query("UPDATE requests SET analysis = $1, status = 'decomposed', updated_at = NOW() WHERE id = $2")
        .bind(analysis).bind(req_id)
        .execute(&db).await.unwrap();

    let row: (Option<String>, String) = sqlx::query_as("SELECT analysis, status FROM requests WHERE id = $1")
        .bind(req_id).fetch_one(&db).await.unwrap();
    assert_eq!(row.0.as_deref(), Some(analysis));
    assert_eq!(row.1, "decomposed");
}

#[tokio::test]
async fn test_request_requirement_linking() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    // Create a request
    let request_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Real-time collab', 'I want live editing', 'decomposed', NOW(), NOW())"
    )
    .bind(request_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Create requirements
    let req1_id = Uuid::new_v4();
    let req2_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'Cursor presence', 'See cursors', 'active', 'high', $3, NOW(), NOW())"
    )
    .bind(req1_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'CRDT editing', 'Conflict-free edits', 'draft', 'high', $3, NOW(), NOW())"
    )
    .bind(req2_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Link requirements to request (M:N relationship)
    sqlx::query("INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2)")
        .bind(request_id).bind(req1_id)
        .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2)")
        .bind(request_id).bind(req2_id)
        .execute(&db).await.unwrap();

    // Verify forward links (request -> requirements)
    let linked: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT requirement_id FROM request_requirements WHERE request_id = $1 ORDER BY requirement_id"
    )
    .bind(request_id)
    .fetch_all(&db).await.unwrap();
    assert_eq!(linked.len(), 2);

    // Verify reverse lookup (requirement -> requests)
    let reverse: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT request_id FROM request_requirements WHERE requirement_id = $1"
    )
    .bind(req1_id)
    .fetch_all(&db).await.unwrap();
    assert_eq!(reverse.len(), 1);
    assert_eq!(reverse[0].0, request_id);

    // Duplicate link should be prevented
    let dup = sqlx::query("INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(request_id).bind(req1_id)
        .execute(&db).await.unwrap();
    assert_eq!(dup.rows_affected(), 0);
}

#[tokio::test]
async fn test_request_many_to_many_shared_requirements() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    // Two different requests
    let req_a = Uuid::new_v4();
    let req_b = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Request A', 'Feature A', 'decomposed', NOW(), NOW())"
    )
    .bind(req_a).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Request B', 'Feature B', 'decomposed', NOW(), NOW())"
    )
    .bind(req_b).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Shared requirement (i18n support needed by both)
    let shared_req = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'i18n support', 'Internationalization', 'active', 'medium', $3, NOW(), NOW())"
    )
    .bind(shared_req).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    // Both requests link to the same requirement
    sqlx::query("INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2)")
        .bind(req_a).bind(shared_req)
        .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2)")
        .bind(req_b).bind(shared_req)
        .execute(&db).await.unwrap();

    // Requirement should be linked to both requests
    let requests_for_req: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT request_id FROM request_requirements WHERE requirement_id = $1 ORDER BY request_id"
    )
    .bind(shared_req)
    .fetch_all(&db).await.unwrap();
    assert_eq!(requests_for_req.len(), 2);
}

#[tokio::test]
async fn test_request_cascade_delete() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    let request_id = Uuid::new_v4();
    let req_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Delete me', 'body', 'pending', NOW(), NOW())"
    )
    .bind(request_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'Linked req', 'desc', 'draft', 'medium', $3, NOW(), NOW())"
    )
    .bind(req_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2)")
        .bind(request_id).bind(req_id)
        .execute(&db).await.unwrap();

    // Delete request — link should cascade, but requirement should survive
    sqlx::query("DELETE FROM requests WHERE id = $1")
        .bind(request_id).execute(&db).await.unwrap();

    let link_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM request_requirements WHERE request_id = $1)"
    )
    .bind(request_id).fetch_one(&db).await.unwrap();
    assert!(!link_exists, "Link should be cascade deleted with request");

    let req_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM requirements WHERE id = $1)"
    )
    .bind(req_id).fetch_one(&db).await.unwrap();
    assert!(req_exists, "Requirement should NOT be cascade deleted");
}

#[tokio::test]
async fn test_full_request_to_task_chain() {
    let db = setup_db().await;
    let (user_id, project_id) = create_test_context(&db).await;

    // Create session + participant for tasks
    let session_id = Uuid::new_v4();
    let session_code = format!("{}", &session_id.to_string()[..6]).to_uppercase();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id).bind(&session_code).bind(user_id)
        .execute(&db).await.unwrap();

    let participant_id = Uuid::new_v4();
    sqlx::query("INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at) VALUES ($1, $2, $3, $4, 'human', NOW())")
        .bind(participant_id).bind(session_id).bind(user_id).bind("Test User")
        .execute(&db).await.unwrap();

    // Full chain: Request -> Requirement -> Task
    let request_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requests (id, project_id, author_id, title, body, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Live editing', 'Want collaborative docs', 'decomposed', NOW(), NOW())"
    )
    .bind(request_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    let requirement_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO requirements (id, project_id, title, description, status, priority, created_by, created_at, updated_at)
         VALUES ($1, $2, 'WebSocket sync', 'Real-time data sync via WS', 'active', 'high', $3, NOW(), NOW())"
    )
    .bind(requirement_id).bind(project_id).bind(user_id)
    .execute(&db).await.unwrap();

    let task_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO tasks (id, session_id, project_id, ticket_number, task_type, title, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, 60001, 'task', 'Implement WS broadcast', 'open', $4, NOW(), NOW())"
    )
    .bind(task_id).bind(session_id).bind(project_id).bind(participant_id)
    .execute(&db).await.unwrap();

    // Wire up the chain
    sqlx::query("INSERT INTO request_requirements (request_id, requirement_id) VALUES ($1, $2)")
        .bind(request_id).bind(requirement_id)
        .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO requirement_tasks (requirement_id, task_id) VALUES ($1, $2)")
        .bind(requirement_id).bind(task_id)
        .execute(&db).await.unwrap();

    // Verify full chain traversal: request -> requirements -> tasks
    let tasks_from_request: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT t.id, t.title
         FROM requests req
         JOIN request_requirements rr ON rr.request_id = req.id
         JOIN requirement_tasks rt ON rt.requirement_id = rr.requirement_id
         JOIN tasks t ON t.id = rt.task_id
         WHERE req.id = $1"
    )
    .bind(request_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(tasks_from_request.len(), 1);
    assert_eq!(tasks_from_request[0].0, task_id);
    assert_eq!(tasks_from_request[0].1, "Implement WS broadcast");

    // Reverse traversal: task -> requirements -> requests
    let requests_from_task: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT req.id, req.title
         FROM tasks t
         JOIN requirement_tasks rt ON rt.task_id = t.id
         JOIN request_requirements rr ON rr.requirement_id = rt.requirement_id
         JOIN requests req ON req.id = rr.request_id
         WHERE t.id = $1"
    )
    .bind(task_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(requests_from_task.len(), 1);
    assert_eq!(requests_from_task[0].0, request_id);
    assert_eq!(requests_from_task[0].1, "Live editing");
}
