use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::coder;
use crate::db;
use crate::models::*;
use crate::AppState;

fn workspace_view(w: &Workspace) -> WorkspaceView {
    WorkspaceView {
        id: w.id,
        task_id: w.task_id,
        status: w.status,
        coder_workspace_name: w.coder_workspace_name.clone(),
        template_name: w.template_name.clone(),
        branch: w.branch.clone(),
        started_at: w.started_at,
        stopped_at: w.stopped_at,
        error_message: w.error_message.clone(),
    }
}

/// Verify project membership. Returns the project for downstream use.
async fn verify_project_member(
    db: &sqlx::PgPool,
    project_id: Uuid,
    user_id: Uuid,
) -> Result<(), StatusCode> {
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check project membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(())
}

fn require_coder(state: &AppState) -> Result<&coder::CoderClient, StatusCode> {
    state.coder.as_ref().ok_or_else(|| {
        tracing::warn!("Coder integration not configured");
        StatusCode::SERVICE_UNAVAILABLE
    })
}

/// POST /api/projects/:project_id/workspaces
/// Create a workspace for a task. Initiates Coder workspace creation.
pub async fn create_workspace(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateWorkspaceRequest>,
) -> Result<(StatusCode, Json<WorkspaceView>), StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    // Verify Coder is configured before accepting the request
    require_coder(&state)?;

    // Verify task exists and belongs to this project
    let task: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM tasks WHERE id = $1 AND project_id = $2",
    )
    .bind(req.task_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check task: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if task.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let template_name = req.template_name.unwrap_or_else(|| "seam-agent".to_string());

    // Insert workspace record in pending state
    let workspace = sqlx::query_as::<_, Workspace>(
        "INSERT INTO workspaces (task_id, project_id, template_name, branch, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *",
    )
    .bind(req.task_id)
    .bind(project_id)
    .bind(&template_name)
    .bind(&req.branch)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create workspace record: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Emit workspace.requested event
    let event = crate::events::DomainEvent::new(
        "workspace.requested",
        "workspace",
        workspace.id,
        Some(user.id),
        serde_json::json!({
            "task_id": req.task_id,
            "template_name": template_name,
            "branch": req.branch,
            "project_id": project_id,
        }),
    );
    if let Err(e) = crate::events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    // Spawn async task to create the Coder workspace
    let ws_id = workspace.id;
    let db = state.db.clone();
    let coder_url = std::env::var("CODER_URL").unwrap_or_default();
    let coder_token = std::env::var("CODER_TOKEN").unwrap_or_default();
    let branch = req.branch.clone();

    tokio::spawn(async move {
        let client = coder::CoderClient::new(coder_url, coder_token);
        provision_workspace(&db, &client, ws_id, &template_name, branch.as_deref()).await;
    });

    Ok((StatusCode::CREATED, Json(workspace_view(&workspace))))
}

/// Background task: resolve template, create Coder workspace, update DB.
async fn provision_workspace(
    db: &sqlx::PgPool,
    client: &coder::CoderClient,
    workspace_id: Uuid,
    template_name: &str,
    branch: Option<&str>,
) {
    // Mark as creating
    let _ = sqlx::query(
        "UPDATE workspaces SET status = 'creating', updated_at = NOW() WHERE id = $1",
    )
    .bind(workspace_id)
    .execute(db)
    .await;

    // Resolve template
    let template = match client.get_template_by_name(template_name).await {
        Ok(Some(t)) => t,
        Ok(None) => {
            tracing::error!("Coder template '{template_name}' not found");
            let error_message = format!("Template '{template_name}' not found in Coder");
            let _ = sqlx::query(
                "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(&error_message)
            .execute(db)
            .await;
            let event = crate::events::DomainEvent::new(
                "workspace.failed",
                "workspace",
                workspace_id,
                None,
                serde_json::json!({ "error_message": error_message }),
            );
            if let Err(e) = crate::events::emit(db, &event).await {
                tracing::warn!("Failed to emit domain event: {e}");
            }
            return;
        }
        Err(e) => {
            tracing::error!("Failed to resolve Coder template: {e}");
            let error_message = format!("Failed to resolve template: {e}");
            let _ = sqlx::query(
                "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(&error_message)
            .execute(db)
            .await;
            let event = crate::events::DomainEvent::new(
                "workspace.failed",
                "workspace",
                workspace_id,
                None,
                serde_json::json!({ "error_message": error_message }),
            );
            if let Err(e) = crate::events::emit(db, &event).await {
                tracing::warn!("Failed to emit domain event: {e}");
            }
            return;
        }
    };

    // Build workspace name: seam-<short-uuid>
    let ws_name = format!("seam-{}", &workspace_id.to_string()[..8]);

    let mut params = Vec::new();
    if let Some(b) = branch {
        params.push(coder::RichParameterValue {
            name: "branch".to_string(),
            value: b.to_string(),
        });
    }

    let req = coder::CreateWorkspaceRequest {
        name: ws_name,
        template_id: template.id,
        rich_parameter_values: params,
    };

    match client.create_workspace("me", req).await {
        Ok(coder_ws) => {
            let _ = sqlx::query(
                "UPDATE workspaces SET
                    coder_workspace_id = $2,
                    coder_workspace_name = $3,
                    status = 'running',
                    started_at = NOW(),
                    updated_at = NOW()
                 WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(coder_ws.id)
            .bind(&coder_ws.name)
            .execute(db)
            .await;

            // Emit workspace.running event
            let event = crate::events::DomainEvent::new(
                "workspace.running",
                "workspace",
                workspace_id,
                None,
                serde_json::json!({
                    "coder_workspace_id": coder_ws.id,
                    "coder_workspace_name": coder_ws.name,
                }),
            );
            if let Err(e) = crate::events::emit(db, &event).await {
                tracing::warn!("Failed to emit domain event: {e}");
            }

            tracing::info!(
                workspace_id = %workspace_id,
                coder_id = %coder_ws.id,
                "Coder workspace created"
            );
        }
        Err(e) => {
            tracing::error!("Failed to create Coder workspace: {e}");
            let error_message = format!("Failed to create workspace: {e}");
            let _ = sqlx::query(
                "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(&error_message)
            .execute(db)
            .await;
            let event = crate::events::DomainEvent::new(
                "workspace.failed",
                "workspace",
                workspace_id,
                None,
                serde_json::json!({ "error_message": error_message }),
            );
            if let Err(e) = crate::events::emit(db, &event).await {
                tracing::warn!("Failed to emit domain event: {e}");
            }
        }
    }
}

/// GET /api/projects/:project_id/workspaces
/// List workspaces for a project.
pub async fn list_workspaces(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<WorkspaceView>>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let workspaces = sqlx::query_as::<_, Workspace>(
        "SELECT * FROM workspaces WHERE project_id = $1 ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list workspaces: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(workspaces.iter().map(workspace_view).collect()))
}

/// GET /api/projects/:project_id/workspaces/:workspace_id
/// Get a single workspace with current status.
pub async fn get_workspace(
    State(state): State<Arc<AppState>>,
    Path((project_id, workspace_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<Json<WorkspaceView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let workspace = sqlx::query_as::<_, Workspace>(
        "SELECT * FROM workspaces WHERE id = $1 AND project_id = $2",
    )
    .bind(workspace_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get workspace: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(workspace_view(&workspace)))
}

/// POST /api/projects/:project_id/workspaces/:workspace_id/stop
/// Stop a running workspace.
pub async fn stop_workspace(
    State(state): State<Arc<AppState>>,
    Path((project_id, workspace_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<Json<WorkspaceView>, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let coder_client = require_coder(&state)?;

    let workspace = sqlx::query_as::<_, Workspace>(
        "SELECT * FROM workspaces WHERE id = $1 AND project_id = $2",
    )
    .bind(workspace_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get workspace: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    if workspace.status != WorkspaceStatus::Running {
        return Err(StatusCode::CONFLICT);
    }

    let coder_ws_id = workspace.coder_workspace_id.ok_or_else(|| {
        tracing::error!("Workspace has no Coder ID");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Update to stopping
    let _ = sqlx::query(
        "UPDATE workspaces SET status = 'stopping', updated_at = NOW() WHERE id = $1",
    )
    .bind(workspace_id)
    .execute(&state.db)
    .await;

    match coder_client.stop_workspace(coder_ws_id).await {
        Ok(_) => {
            let updated = sqlx::query_as::<_, Workspace>(
                "UPDATE workspaces SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
                 WHERE id = $1 RETURNING *",
            )
            .bind(workspace_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to update workspace: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            // Emit workspace.stopped event
            let event = crate::events::DomainEvent::new(
                "workspace.stopped",
                "workspace",
                workspace_id,
                Some(user.id),
                serde_json::json!({ "coder_workspace_id": coder_ws_id }),
            );
            if let Err(e) = crate::events::emit(&state.db, &event).await {
                tracing::warn!("Failed to emit domain event: {e}");
            }

            Ok(Json(workspace_view(&updated)))
        }
        Err(e) => {
            tracing::error!("Failed to stop Coder workspace: {e}");
            let error_message = format!("Failed to stop: {e}");
            let _ = sqlx::query(
                "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(&error_message)
            .execute(&state.db)
            .await;
            let event = crate::events::DomainEvent::new(
                "workspace.failed",
                "workspace",
                workspace_id,
                None,
                serde_json::json!({ "error_message": error_message }),
            );
            if let Err(err) = crate::events::emit(&state.db, &event).await {
                tracing::warn!("Failed to emit domain event: {err}");
            }
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

/// DELETE /api/projects/:project_id/workspaces/:workspace_id
/// Destroy a workspace (stop + delete from Coder).
pub async fn destroy_workspace(
    State(state): State<Arc<AppState>>,
    Path((project_id, workspace_id)): Path<(Uuid, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    verify_project_member(&state.db, project_id, user.id).await?;

    let coder_client = require_coder(&state)?;

    let workspace = sqlx::query_as::<_, Workspace>(
        "SELECT * FROM workspaces WHERE id = $1 AND project_id = $2",
    )
    .bind(workspace_id)
    .bind(project_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get workspace: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Delete from Coder if it was created there
    if let Some(coder_ws_id) = workspace.coder_workspace_id {
        if let Err(e) = coder_client.delete_workspace(coder_ws_id).await {
            tracing::warn!("Failed to delete Coder workspace (may already be gone): {e}");
        }
    }

    // Mark as destroyed
    let _ = sqlx::query(
        "UPDATE workspaces SET status = 'destroyed', stopped_at = NOW(), updated_at = NOW() WHERE id = $1",
    )
    .bind(workspace_id)
    .execute(&state.db)
    .await;

    // Emit workspace.destroyed event
    let event = crate::events::DomainEvent::new(
        "workspace.destroyed",
        "workspace",
        workspace_id,
        Some(user.id),
        serde_json::json!({ "coder_workspace_id": workspace.coder_workspace_id }),
    );
    if let Err(e) = crate::events::emit(&state.db, &event).await {
        tracing::warn!("Failed to emit domain event: {e}");
    }

    Ok(StatusCode::NO_CONTENT)
}
