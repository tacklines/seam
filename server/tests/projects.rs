//! Integration tests for the projects data model.
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

async fn create_user(db: &PgPool) -> Uuid {
    let user_id = Uuid::new_v4();
    let external_id = format!("test-{}", Uuid::new_v4());
    sqlx::query("INSERT INTO users (id, external_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(user_id).bind(&external_id).bind(&external_id).bind("Test User")
        .execute(db).await.unwrap();
    user_id
}

async fn create_org(db: &PgPool) -> Uuid {
    let org_id = Uuid::new_v4();
    sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(org_id).bind("Test Org").bind(format!("org-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();
    org_id
}

#[tokio::test]
async fn test_create_project() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let project_id = Uuid::new_v4();
    let slug = format!("proj-{}", Uuid::new_v4());

    sqlx::query(
        "INSERT INTO projects (id, org_id, name, slug, ticket_prefix, repo_url, default_branch, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())"
    )
    .bind(project_id).bind(org_id).bind("My Project").bind(&slug)
    .bind("PROJ").bind(Some("https://github.com/example/repo")).bind("main")
    .execute(&db).await.unwrap();

    let row: (String, String, String, Option<String>, String) = sqlx::query_as(
        "SELECT name, slug, ticket_prefix, repo_url, default_branch FROM projects WHERE id = $1"
    )
    .bind(project_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(row.0, "My Project");
    assert_eq!(row.1, slug);
    assert_eq!(row.2, "PROJ");
    assert_eq!(row.3, Some("https://github.com/example/repo".to_string()));
    assert_eq!(row.4, "main");
}

#[tokio::test]
async fn test_project_default_branch() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let project_id = Uuid::new_v4();

    // default_branch has a default of 'main'
    sqlx::query(
        "INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())"
    )
    .bind(project_id).bind(org_id).bind("Default Branch Project").bind(format!("dbp-{}", Uuid::new_v4()))
    .execute(&db).await.unwrap();

    let branch: String = sqlx::query_scalar("SELECT default_branch FROM projects WHERE id = $1")
        .bind(project_id).fetch_one(&db).await.unwrap();

    assert_eq!(branch, "main");
}

#[tokio::test]
async fn test_project_member_roles() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let project_id = Uuid::new_v4();
    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id).bind(org_id).bind("Team Project").bind(format!("tp-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();

    let admin_id = create_user(&db).await;
    let member_id = create_user(&db).await;
    let viewer_id = create_user(&db).await;

    sqlx::query("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES ($1, $2, 'admin', NOW())")
        .bind(project_id).bind(admin_id).execute(&db).await.unwrap();
    sqlx::query("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES ($1, $2, 'member', NOW())")
        .bind(project_id).bind(member_id).execute(&db).await.unwrap();
    sqlx::query("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES ($1, $2, 'viewer', NOW())")
        .bind(project_id).bind(viewer_id).execute(&db).await.unwrap();

    let roles: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT user_id, role::text FROM project_members WHERE project_id = $1 ORDER BY role"
    )
    .bind(project_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(roles.len(), 3);
    let role_set: std::collections::HashSet<String> = roles.iter().map(|r| r.1.clone()).collect();
    assert!(role_set.contains("admin"));
    assert!(role_set.contains("member"));
    assert!(role_set.contains("viewer"));
}

#[tokio::test]
async fn test_project_member_uniqueness() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let project_id = Uuid::new_v4();
    let user_id = create_user(&db).await;

    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id).bind(org_id).bind("Unique Members").bind(format!("um-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES ($1, $2, 'admin', NOW())")
        .bind(project_id).bind(user_id).execute(&db).await.unwrap();

    // Duplicate should fail
    let result = sqlx::query("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES ($1, $2, 'member', NOW())")
        .bind(project_id).bind(user_id).execute(&db).await;

    assert!(result.is_err(), "Duplicate project member should be rejected");
}

#[tokio::test]
async fn test_project_sessions_cascade() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;
    let project_id = Uuid::new_v4();

    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id).bind(org_id).bind("Cascade Project").bind(format!("cp-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();

    let session_id = Uuid::new_v4();
    sqlx::query("INSERT INTO sessions (id, project_id, code, created_by, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(session_id).bind(project_id).bind(format!("X{}", &Uuid::new_v4().to_string()[..5]).to_uppercase()).bind(user_id)
        .execute(&db).await.unwrap();

    // Sessions belong to project
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE project_id = $1")
        .bind(project_id).fetch_one(&db).await.unwrap();
    assert_eq!(count, 1);
}

#[tokio::test]
async fn test_project_ticket_prefix_default() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let project_id = Uuid::new_v4();

    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_id).bind(org_id).bind("Default Prefix").bind(format!("dp-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();

    let prefix: String = sqlx::query_scalar("SELECT ticket_prefix FROM projects WHERE id = $1")
        .bind(project_id).fetch_one(&db).await.unwrap();

    assert_eq!(prefix, "TASK");
}

#[tokio::test]
async fn test_project_user_membership_query() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;
    let other_user_id = create_user(&db).await;

    // Create two projects, user is member of only one
    let project_a = Uuid::new_v4();
    let project_b = Uuid::new_v4();

    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_a).bind(org_id).bind("Project A").bind(format!("pa-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();
    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_b).bind(org_id).bind("Project B").bind(format!("pb-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES ($1, $2, 'member', NOW())")
        .bind(project_a).bind(user_id).execute(&db).await.unwrap();
    sqlx::query("INSERT INTO project_members (project_id, user_id, role, joined_at) VALUES ($1, $2, 'admin', NOW())")
        .bind(project_b).bind(other_user_id).execute(&db).await.unwrap();

    // User should only see project_a via membership JOIN
    let user_projects: Vec<(Uuid,)> = sqlx::query_as(
        "SELECT p.id FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = $1"
    )
    .bind(user_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(user_projects.len(), 1);
    assert_eq!(user_projects[0].0, project_a);
}
