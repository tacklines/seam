use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::Claims;
use crate::models::User;

/// Upsert a user from JWT claims. Returns the internal user record.
pub async fn upsert_user(pool: &PgPool, claims: &Claims) -> Result<User, sqlx::Error> {
    let username = claims
        .resolved_username()
        .unwrap_or(&claims.sub)
        .to_string();
    let display = claims.resolved_name().unwrap_or(&username).to_string();

    sqlx::query_as::<_, User>(
        "INSERT INTO users (id, external_id, username, display_name, email, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
         ON CONFLICT (external_id)
         DO UPDATE SET username = EXCLUDED.username,
                       display_name = EXCLUDED.display_name,
                       email = EXCLUDED.email
         RETURNING *",
    )
    .bind(&claims.sub)
    .bind(&username)
    .bind(&display)
    .bind(claims.resolved_email())
    .fetch_one(pool)
    .await
}

/// Ensure the user has at least one org + project. Returns the default project_id.
pub async fn ensure_default_project(pool: &PgPool, user_id: Uuid) -> Result<Uuid, sqlx::Error> {
    // Check if user has any org membership
    let existing: Option<(Uuid,)> = sqlx::query_as(
        "SELECT p.id FROM projects p
         JOIN org_members om ON om.org_id = p.org_id
         WHERE om.user_id = $1
         ORDER BY p.created_at
         LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    if let Some((project_id,)) = existing {
        return Ok(project_id);
    }

    // Create personal org
    let org_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO organizations (id, name, slug, personal, created_at)
         VALUES ($1, 'Personal', $2, true, NOW())",
    )
    .bind(org_id)
    .bind(format!("personal-{}", &user_id.to_string()[..8]))
    .execute(pool)
    .await?;

    // Make user the owner
    sqlx::query(
        "INSERT INTO org_members (org_id, user_id, role, joined_at)
         VALUES ($1, $2, 'owner', NOW())",
    )
    .bind(org_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    // Create default project
    let project_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO projects (id, org_id, name, slug, created_at)
         VALUES ($1, $2, 'Default', 'default', NOW())",
    )
    .bind(project_id)
    .bind(org_id)
    .execute(pool)
    .await?;

    // Add user as project admin
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role, joined_at)
         VALUES ($1, $2, 'admin', NOW())",
    )
    .bind(project_id)
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(project_id)
}
