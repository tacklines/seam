//! Integration tests for organizations, org membership, and RBAC.
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
        .bind(org_id).bind("Test Org").bind(format!("test-org-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();
    org_id
}

async fn add_org_member(db: &PgPool, org_id: Uuid, user_id: Uuid, role: &str) {
    sqlx::query("INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES ($1, $2, $3, NOW())")
        .bind(org_id).bind(user_id).bind(role)
        .execute(db).await.unwrap();
}

#[tokio::test]
async fn test_create_org() {
    let db = setup_db().await;
    let org_id = Uuid::new_v4();
    let slug = format!("org-{}", Uuid::new_v4());

    sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(org_id).bind("My Org").bind(&slug)
        .execute(&db).await.unwrap();

    let row: (String, String, bool) = sqlx::query_as(
        "SELECT name, slug, personal FROM organizations WHERE id = $1"
    )
    .bind(org_id)
    .fetch_one(&db).await.unwrap();

    assert_eq!(row.0, "My Org");
    assert_eq!(row.1, slug);
    assert!(!row.2, "Default personal should be false");
}

#[tokio::test]
async fn test_personal_org() {
    let db = setup_db().await;
    let org_id = Uuid::new_v4();

    sqlx::query("INSERT INTO organizations (id, name, slug, personal, created_at) VALUES ($1, $2, $3, true, NOW())")
        .bind(org_id).bind("Personal").bind(format!("personal-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();

    let personal: bool = sqlx::query_scalar("SELECT personal FROM organizations WHERE id = $1")
        .bind(org_id).fetch_one(&db).await.unwrap();
    assert!(personal);
}

#[tokio::test]
async fn test_org_slug_uniqueness() {
    let db = setup_db().await;
    let slug = format!("unique-{}", Uuid::new_v4());

    sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(Uuid::new_v4()).bind("Org A").bind(&slug)
        .execute(&db).await.unwrap();

    let result = sqlx::query("INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, NOW())")
        .bind(Uuid::new_v4()).bind("Org B").bind(&slug)
        .execute(&db).await;

    assert!(result.is_err(), "Duplicate org slug should be rejected");
}

#[tokio::test]
async fn test_org_membership_roles() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let owner_id = create_user(&db).await;
    let admin_id = create_user(&db).await;
    let member_id = create_user(&db).await;

    add_org_member(&db, org_id, owner_id, "owner").await;
    add_org_member(&db, org_id, admin_id, "admin").await;
    add_org_member(&db, org_id, member_id, "member").await;

    // Verify roles
    let roles: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT user_id, role::text FROM org_members WHERE org_id = $1 ORDER BY role"
    )
    .bind(org_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(roles.len(), 3);
    // Roles are enum-ordered, just check all three are present
    let role_set: std::collections::HashSet<String> = roles.iter().map(|r| r.1.clone()).collect();
    assert!(role_set.contains("owner"));
    assert!(role_set.contains("admin"));
    assert!(role_set.contains("member"));
}

#[tokio::test]
async fn test_org_membership_unique_constraint() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    add_org_member(&db, org_id, user_id, "member").await;

    // Duplicate membership should fail
    let result = sqlx::query("INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES ($1, $2, 'admin', NOW())")
        .bind(org_id).bind(user_id)
        .execute(&db).await;

    assert!(result.is_err(), "Duplicate org membership should be rejected");
}

#[tokio::test]
async fn test_org_role_update() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    add_org_member(&db, org_id, user_id, "member").await;

    // Promote to admin
    sqlx::query("UPDATE org_members SET role = 'admin' WHERE org_id = $1 AND user_id = $2")
        .bind(org_id).bind(user_id)
        .execute(&db).await.unwrap();

    let role: String = sqlx::query_scalar("SELECT role::text FROM org_members WHERE org_id = $1 AND user_id = $2")
        .bind(org_id).bind(user_id)
        .fetch_one(&db).await.unwrap();

    assert_eq!(role, "admin");
}

#[tokio::test]
async fn test_org_member_removal() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    add_org_member(&db, org_id, user_id, "member").await;

    let result = sqlx::query("DELETE FROM org_members WHERE org_id = $1 AND user_id = $2")
        .bind(org_id).bind(user_id)
        .execute(&db).await.unwrap();

    assert_eq!(result.rows_affected(), 1);

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2)"
    )
    .bind(org_id).bind(user_id)
    .fetch_one(&db).await.unwrap();

    assert!(!exists);
}

#[tokio::test]
async fn test_org_projects_scoping() {
    let db = setup_db().await;
    let org_a = create_org(&db).await;
    let org_b = create_org(&db).await;

    let project_a = Uuid::new_v4();
    let project_b = Uuid::new_v4();

    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_a).bind(org_a).bind("Project A").bind(format!("proj-a-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();

    sqlx::query("INSERT INTO projects (id, org_id, name, slug, created_at) VALUES ($1, $2, $3, $4, NOW())")
        .bind(project_b).bind(org_b).bind("Project B").bind(format!("proj-b-{}", Uuid::new_v4()))
        .execute(&db).await.unwrap();

    // Only project_a should appear under org_a
    let projects: Vec<(Uuid,)> = sqlx::query_as("SELECT id FROM projects WHERE org_id = $1")
        .bind(org_a)
        .fetch_all(&db).await.unwrap();

    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].0, project_a);
}

#[tokio::test]
async fn test_user_multi_org_membership() {
    let db = setup_db().await;
    let org_a = create_org(&db).await;
    let org_b = create_org(&db).await;
    let user_id = create_user(&db).await;

    add_org_member(&db, org_a, user_id, "owner").await;
    add_org_member(&db, org_b, user_id, "member").await;

    let orgs: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT o.id, om.role::text FROM organizations o JOIN org_members om ON om.org_id = o.id WHERE om.user_id = $1 ORDER BY o.name"
    )
    .bind(user_id)
    .fetch_all(&db).await.unwrap();

    assert_eq!(orgs.len(), 2);
}

#[tokio::test]
async fn test_invalid_org_role() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    let result = sqlx::query("INSERT INTO org_members (org_id, user_id, role, joined_at) VALUES ($1, $2, 'superadmin', NOW())")
        .bind(org_id).bind(user_id)
        .execute(&db).await;

    assert!(result.is_err(), "Invalid role should be rejected by enum constraint");
}
