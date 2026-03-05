use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db;
use crate::models::*;
use crate::AppState;

/// List projects the authenticated user belongs to
pub async fn list_projects(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<ProjectView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let projects = sqlx::query_as::<_, Project>(
        "SELECT p.* FROM projects p
         JOIN project_members pm ON pm.project_id = p.id
         WHERE pm.user_id = $1
         ORDER BY p.created_at"
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list projects: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(projects.into_iter().map(|p| ProjectView {
        id: p.id,
        name: p.name,
        slug: p.slug,
        ticket_prefix: p.ticket_prefix,
        created_at: p.created_at,
        repo_url: p.repo_url,
        default_branch: Some(p.default_branch),
    }).collect()))
}

/// Get a single project by ID
pub async fn get_project(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
) -> Result<Json<ProjectView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Verify membership and fetch project in one query
    let project = sqlx::query_as::<_, Project>(
        "SELECT p.* FROM projects p
         JOIN project_members pm ON pm.project_id = p.id
         WHERE p.id = $1 AND pm.user_id = $2"
    )
    .bind(project_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get project: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(ProjectView {
        id: project.id,
        name: project.name,
        slug: project.slug,
        ticket_prefix: project.ticket_prefix,
        created_at: project.created_at,
        repo_url: project.repo_url,
        default_branch: Some(project.default_branch),
    }))
}

/// Create a new project in the user's default org
pub async fn create_project(
    State(state): State<Arc<AppState>>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ProjectView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Find the user's org, bootstrapping one if needed
    let org_id: Uuid = match sqlx::query_scalar(
        "SELECT org_id FROM org_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1"
    )
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to find org: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })? {
        Some(id) => id,
        None => {
            // Auto-bootstrap org via ensure_default_project, then read org_id
            let _ = db::ensure_default_project(&state.db, user.id).await
                .map_err(|e| {
                    tracing::error!("Failed to bootstrap default org: {e}");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
            sqlx::query_scalar(
                "SELECT org_id FROM org_members WHERE user_id = $1 ORDER BY joined_at LIMIT 1"
            )
            .bind(user.id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to find org after bootstrap: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
        }
    };

    let slug = req.slug.unwrap_or_else(|| slugify(&req.name));
    let ticket_prefix = req.ticket_prefix.unwrap_or_else(|| "TASK".to_string());
    let default_branch = req.default_branch.unwrap_or_else(|| "main".to_string());
    let project_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO projects (id, org_id, name, slug, ticket_prefix, repo_url, default_branch, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())"
    )
    .bind(project_id)
    .bind(org_id)
    .bind(&req.name)
    .bind(&slug)
    .bind(&ticket_prefix)
    .bind(&req.repo_url)
    .bind(&default_branch)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create project: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Add creator as project admin
    sqlx::query(
        "INSERT INTO project_members (project_id, user_id, role, joined_at)
         VALUES ($1, $2, 'admin', NOW())"
    )
    .bind(project_id)
    .bind(user.id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to add project member: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok((StatusCode::CREATED, Json(ProjectView {
        id: project_id,
        name: req.name,
        slug,
        ticket_prefix,
        created_at: chrono::Utc::now(),
        repo_url: req.repo_url,
        default_branch: Some(default_branch),
    })))
}

/// Update project settings
pub async fn update_project(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpdateProjectRequest>,
) -> Result<Json<ProjectView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Verify user is admin of this project
    let role: Option<(ProjectRole,)> = sqlx::query_as(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2"
    )
    .bind(project_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check project membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match role {
        Some((ProjectRole::Admin,)) => {},
        Some(_) => return Err(StatusCode::FORBIDDEN),
        None => return Err(StatusCode::NOT_FOUND),
    }

    // Build dynamic update
    let has_updates = req.name.is_some() || req.ticket_prefix.is_some()
        || req.repo_url.is_some() || req.default_branch.is_some();
    let project = if has_updates {
        let mut set_clauses = Vec::new();
        let mut i = 2; // $1 is project_id

        if req.name.is_some() {
            set_clauses.push(format!("name = ${i}"));
            i += 1;
        }
        if req.ticket_prefix.is_some() {
            set_clauses.push(format!("ticket_prefix = ${i}"));
            i += 1;
        }
        if req.repo_url.is_some() {
            set_clauses.push(format!("repo_url = ${i}"));
            i += 1;
        }
        if req.default_branch.is_some() {
            set_clauses.push(format!("default_branch = ${i}"));
            let _ = i; // suppress unused warning
        }

        let query = format!(
            "UPDATE projects SET {} WHERE id = $1 RETURNING *",
            set_clauses.join(", ")
        );

        let mut q = sqlx::query_as::<_, Project>(&query).bind(project_id);
        if let Some(ref name) = req.name {
            q = q.bind(name);
        }
        if let Some(ref prefix) = req.ticket_prefix {
            q = q.bind(prefix);
        }
        if let Some(ref repo_url) = req.repo_url {
            q = q.bind(repo_url);
        }
        if let Some(ref default_branch) = req.default_branch {
            q = q.bind(default_branch);
        }

        q.fetch_one(&state.db).await.map_err(|e| {
            tracing::error!("Failed to update project: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
    } else {
        // Nothing to update, just fetch
        sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = $1")
            .bind(project_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to fetch project: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
    };

    Ok(Json(ProjectView {
        id: project.id,
        name: project.name,
        slug: project.slug,
        ticket_prefix: project.ticket_prefix,
        created_at: project.created_at,
        repo_url: project.repo_url,
        default_branch: Some(project.default_branch),
    }))
}

/// List sessions within a project
pub async fn list_project_sessions(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<SessionView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Verify membership
    let _: (Uuid,) = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2"
    )
    .bind(project_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check project membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let project = sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch project: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let sessions = sqlx::query_as::<_, Session>(
        "SELECT * FROM sessions WHERE project_id = $1 ORDER BY created_at DESC"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list sessions: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut views = Vec::new();
    for session in sessions {
        let participants: Vec<Participant> = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 AND disconnected_at IS NULL ORDER BY joined_at"
        )
        .bind(session.id)
        .fetch_all(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let online_ids = state.connections.online_participant_ids(&session.code);

        views.push(SessionView {
            id: session.id,
            code: session.code.clone(),
            name: session.name,
            project_id: session.project_id,
            project_name: project.name.clone(),
            created_at: session.created_at,
            participants: participants.into_iter().map(|p| {
                let is_online = online_ids.contains(&p.id.to_string());
                ParticipantView {
                    id: p.id,
                    display_name: p.display_name,
                    participant_type: p.participant_type,
                    sponsor_id: p.sponsor_id,
                    joined_at: p.joined_at,
                    is_online,
                }
            }).collect(),
        });
    }

    Ok(Json(views))
}

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
