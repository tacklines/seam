//! Integration tests for credential schema constraints.
//! Tests CHECK constraints on credential_type, UNIQUE constraints, cascades.
//! Does NOT test encryption (needs CREDENTIAL_MASTER_KEY) — only schema invariants.
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
        .bind(org_id).bind("Org").bind(format!("org-{}", Uuid::new_v4()))
        .execute(db).await.unwrap();
    org_id
}

// -- Org credential DEK tests --

#[tokio::test]
async fn test_org_dek_one_per_org() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;

    sqlx::query("INSERT INTO org_credential_keys (org_id, encrypted_dek) VALUES ($1, $2)")
        .bind(org_id).bind(b"fake-dek-bytes".as_slice())
        .execute(&db).await.unwrap();

    // Duplicate should fail (PK constraint)
    let result = sqlx::query("INSERT INTO org_credential_keys (org_id, encrypted_dek) VALUES ($1, $2)")
        .bind(org_id).bind(b"another-dek".as_slice())
        .execute(&db).await;

    assert!(result.is_err(), "Only one DEK per org allowed");
}

#[tokio::test]
async fn test_org_dek_cascade_on_org_delete() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;

    sqlx::query("INSERT INTO org_credential_keys (org_id, encrypted_dek) VALUES ($1, $2)")
        .bind(org_id).bind(b"fake-dek".as_slice())
        .execute(&db).await.unwrap();

    sqlx::query("DELETE FROM organizations WHERE id = $1")
        .bind(org_id).execute(&db).await.unwrap();

    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM org_credential_keys WHERE org_id = $1)")
        .bind(org_id).fetch_one(&db).await.unwrap();

    assert!(!exists, "Org DEK should cascade-delete with org");
}

// -- Org credential tests --

#[tokio::test]
async fn test_org_credential_valid_types() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    for ctype in &["claude_oauth", "anthropic_api_key", "openai_api_key", "google_api_key", "git_token", "custom"] {
        sqlx::query(
            "INSERT INTO org_credentials (org_id, name, credential_type, encrypted_value, created_by)
             VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(org_id).bind(format!("cred-{ctype}"))
        .bind(*ctype).bind(b"encrypted".as_slice()).bind(user_id)
        .execute(&db).await
        .unwrap_or_else(|e| panic!("Valid credential type '{ctype}' should be accepted: {e}"));
    }
}

#[tokio::test]
async fn test_org_credential_invalid_type() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    let result = sqlx::query(
        "INSERT INTO org_credentials (org_id, name, credential_type, encrypted_value, created_by)
         VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(org_id).bind("bad-cred").bind("aws_key")
    .bind(b"encrypted".as_slice()).bind(user_id)
    .execute(&db).await;

    assert!(result.is_err(), "Invalid credential_type should be rejected by CHECK constraint");
}

#[tokio::test]
async fn test_org_credential_unique_name_per_org() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    sqlx::query(
        "INSERT INTO org_credentials (org_id, name, credential_type, encrypted_value, created_by)
         VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(org_id).bind("my-key").bind("anthropic_api_key")
    .bind(b"encrypted".as_slice()).bind(user_id)
    .execute(&db).await.unwrap();

    // Same name, same org — should fail
    let result = sqlx::query(
        "INSERT INTO org_credentials (org_id, name, credential_type, encrypted_value, created_by)
         VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(org_id).bind("my-key").bind("openai_api_key")
    .bind(b"encrypted".as_slice()).bind(user_id)
    .execute(&db).await;

    assert!(result.is_err(), "Duplicate credential name per org should be rejected");
}

#[tokio::test]
async fn test_org_credential_same_name_different_orgs() {
    let db = setup_db().await;
    let org1 = create_org(&db).await;
    let org2 = create_org(&db).await;
    let user_id = create_user(&db).await;

    for org_id in &[org1, org2] {
        sqlx::query(
            "INSERT INTO org_credentials (org_id, name, credential_type, encrypted_value, created_by)
             VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(org_id).bind("api-key").bind("anthropic_api_key")
        .bind(b"encrypted".as_slice()).bind(user_id)
        .execute(&db).await.unwrap();
    }

    // Both should exist — different orgs can have the same credential name
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM org_credentials WHERE name = 'api-key' AND org_id IN ($1, $2)"
    )
    .bind(org1).bind(org2)
    .fetch_one(&db).await.unwrap();

    assert_eq!(count, 2, "Different orgs should be able to have credentials with the same name");
}

#[tokio::test]
async fn test_org_credential_cascade_on_org_delete() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    sqlx::query(
        "INSERT INTO org_credentials (org_id, name, credential_type, encrypted_value, created_by)
         VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(org_id).bind("will-cascade").bind("git_token")
    .bind(b"encrypted".as_slice()).bind(user_id)
    .execute(&db).await.unwrap();

    sqlx::query("DELETE FROM organizations WHERE id = $1")
        .bind(org_id).execute(&db).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM org_credentials WHERE org_id = $1"
    )
    .bind(org_id).fetch_one(&db).await.unwrap();

    assert_eq!(count, 0, "Org credentials should cascade-delete with org");
}

// -- User credential tests --

#[tokio::test]
async fn test_user_credential_valid_types() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;

    for ctype in &["claude_oauth", "anthropic_api_key", "openai_api_key", "google_api_key", "git_token", "custom"] {
        sqlx::query(
            "INSERT INTO user_credentials (user_id, name, credential_type, encrypted_value)
             VALUES ($1, $2, $3, $4)"
        )
        .bind(user_id).bind(format!("user-cred-{ctype}"))
        .bind(*ctype).bind(b"encrypted".as_slice())
        .execute(&db).await
        .unwrap_or_else(|e| panic!("Valid credential type '{ctype}' should be accepted: {e}"));
    }
}

#[tokio::test]
async fn test_user_credential_invalid_type() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;

    let result = sqlx::query(
        "INSERT INTO user_credentials (user_id, name, credential_type, encrypted_value)
         VALUES ($1, $2, $3, $4)"
    )
    .bind(user_id).bind("bad").bind("azure_key")
    .bind(b"encrypted".as_slice())
    .execute(&db).await;

    assert!(result.is_err(), "Invalid credential_type should be rejected");
}

#[tokio::test]
async fn test_user_credential_unique_name_per_user() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;

    sqlx::query(
        "INSERT INTO user_credentials (user_id, name, credential_type, encrypted_value)
         VALUES ($1, $2, $3, $4)"
    )
    .bind(user_id).bind("my-token").bind("claude_oauth")
    .bind(b"encrypted".as_slice())
    .execute(&db).await.unwrap();

    let result = sqlx::query(
        "INSERT INTO user_credentials (user_id, name, credential_type, encrypted_value)
         VALUES ($1, $2, $3, $4)"
    )
    .bind(user_id).bind("my-token").bind("anthropic_api_key")
    .bind(b"encrypted".as_slice())
    .execute(&db).await;

    assert!(result.is_err(), "Duplicate credential name per user should be rejected");
}

#[tokio::test]
async fn test_user_dek_cascade_on_user_delete() {
    let db = setup_db().await;
    let user_id = create_user(&db).await;

    sqlx::query("INSERT INTO user_credential_keys (user_id, encrypted_dek) VALUES ($1, $2)")
        .bind(user_id).bind(b"fake-dek".as_slice())
        .execute(&db).await.unwrap();

    sqlx::query(
        "INSERT INTO user_credentials (user_id, name, credential_type, encrypted_value)
         VALUES ($1, $2, $3, $4)"
    )
    .bind(user_id).bind("cascade-test").bind("git_token")
    .bind(b"encrypted".as_slice())
    .execute(&db).await.unwrap();

    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id).execute(&db).await.unwrap();

    let dek_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM user_credential_keys WHERE user_id = $1)")
        .bind(user_id).fetch_one(&db).await.unwrap();
    let cred_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_credentials WHERE user_id = $1")
        .bind(user_id).fetch_one(&db).await.unwrap();

    assert!(!dek_exists, "User DEK should cascade-delete with user");
    assert_eq!(cred_count, 0, "User credentials should cascade-delete with user");
}

#[tokio::test]
async fn test_org_credential_custom_env_var() {
    let db = setup_db().await;
    let org_id = create_org(&db).await;
    let user_id = create_user(&db).await;

    let cred_id: Uuid = sqlx::query_scalar(
        "INSERT INTO org_credentials (org_id, name, credential_type, encrypted_value, created_by, env_var_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id"
    )
    .bind(org_id).bind("custom-cred").bind("custom")
    .bind(b"encrypted".as_slice()).bind(user_id).bind("MY_CUSTOM_VAR")
    .fetch_one(&db).await.unwrap();

    let env_var: Option<String> = sqlx::query_scalar(
        "SELECT env_var_name FROM org_credentials WHERE id = $1"
    )
    .bind(cred_id).fetch_one(&db).await.unwrap();

    assert_eq!(env_var, Some("MY_CUSTOM_VAR".to_string()));
}
