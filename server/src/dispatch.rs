/// Invocation dispatcher: executes `claude -p` commands inside Coder workspaces
/// via `coder ssh` and streams output back to the log buffer + WebSocket.
///
/// Also provides workspace pool resolution: find-or-create a workspace for a
/// project so that invocations don't need to specify a workspace up front.
use chrono::Utc;
use sqlx::PgPool;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::coder::CoderApi;
use crate::log_buffer::{LogBuffer, LogLine};
use crate::workspace_token::WorkspaceTokenProvider;
use crate::ws::ConnectionManager;

/// Lazily-initialized workspace token provider.
/// Configured from env vars on first access; None if not configured.
static WORKSPACE_TOKEN_PROVIDER: std::sync::OnceLock<Option<WorkspaceTokenProvider>> =
    std::sync::OnceLock::new();

fn workspace_token_provider() -> Option<&'static WorkspaceTokenProvider> {
    WORKSPACE_TOKEN_PROVIDER
        .get_or_init(WorkspaceTokenProvider::from_env)
        .as_ref()
}

#[derive(Debug, thiserror::Error)]
pub enum DispatchError {
    #[error("Database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("Invocation not found")]
    NotFound,
    #[error("Workspace not found or not running")]
    WorkspaceNotReady,
    #[error("Coder CLI not available")]
    CoderCliMissing,
    #[error("Command execution failed: {0}")]
    Exec(#[from] std::io::Error),
    #[error("Coder not configured")]
    CoderNotConfigured,
    #[error("No workspace available and Coder not configured to create one")]
    NoWorkspaceAvailable,
    #[error("Coder API error: {0}")]
    CoderApi(String),
}

/// Resolve a running workspace for the given project, or create one.
///
/// Pool strategy:
/// 1. Find a running workspace for this project (prefer one with matching pool_key)
/// 2. If a stopped workspace exists, start it via Coder API
/// 3. If no workspace exists at all, create one via Coder API
///
/// Returns the workspace_id of a running (or soon-to-be-running) workspace.
#[tracing::instrument(skip(db), fields(project_id = %project_id, branch = ?branch))]
pub async fn resolve_workspace(
    db: &PgPool,
    project_id: Uuid,
    branch: Option<&str>,
    user_id: Uuid,
) -> Result<Uuid, DispatchError> {
    let coder_url = std::env::var("CODER_URL").map_err(|_| DispatchError::CoderNotConfigured)?;
    let coder_token =
        std::env::var("CODER_TOKEN").map_err(|_| DispatchError::CoderNotConfigured)?;
    let client = crate::coder::CoderClient::new(coder_url, coder_token);
    resolve_workspace_with_client(db, project_id, branch, user_id, &client).await
}

/// Internal: resolve workspace using an explicit Coder API client.
///
/// Separated from `resolve_workspace` so tests can inject a `MockCoderClient`.
///
/// Uses a PostgreSQL advisory lock (`pg_advisory_xact_lock`) to serialize
/// concurrent find-or-create operations for the same pool_key. The lock is
/// acquired inside a short transaction that covers only the DB reads and the
/// initial workspace INSERT (status='creating'). The slow Coder API calls happen
/// after the transaction commits and the lock is released, preventing long-lived
/// lock contention while still preventing duplicate workspace creation.
pub(crate) async fn resolve_workspace_with_client<C: CoderApi>(
    db: &PgPool,
    project_id: Uuid,
    branch: Option<&str>,
    user_id: Uuid,
    client: &C,
) -> Result<Uuid, DispatchError> {
    let pool_key = pool_key_for(project_id, branch);

    // Derive a stable i64 lock key from the pool_key string using FNV-1a.
    // pg_advisory_xact_lock takes a bigint; using a simple hash avoids a
    // dependency on an external crate and is deterministic across requests.
    let lock_key = fnv1a_i64(pool_key.as_bytes());

    // --- Locked phase: find-or-reserve a workspace record ---
    //
    // Acquire the transaction-scoped advisory lock first.  Any concurrent
    // request with the same pool_key blocks here until we commit.  After we
    // commit the winner has either found an existing workspace or inserted a
    // new one in 'creating' status.  The next waiter then finds that record
    // and returns it rather than creating a duplicate.
    enum ResolveAction {
        /// Reuse an already-running workspace.
        UseRunning(Uuid),
        /// Wake a stopped workspace then use it.
        WakeStopped { workspace_id: Uuid, coder_id: Uuid },
        /// Provision a brand-new workspace (record already inserted as 'creating').
        CreateNew(Uuid),
    }

    let action: ResolveAction = {
        let mut txn = db.begin().await?;

        // Acquire the advisory lock for this pool_key.  The lock is
        // transaction-scoped and is released automatically when `txn` commits
        // or rolls back.
        sqlx::query("SELECT pg_advisory_xact_lock($1)")
            .bind(lock_key)
            .execute(&mut *txn)
            .await?;

        tracing::debug!(pool_key = %pool_key, lock_key = lock_key, "Advisory lock acquired");

        // 1. Try to find a running workspace with matching pool_key
        let running: Option<(Uuid,)> = sqlx::query_as(
            "SELECT id FROM workspaces
             WHERE project_id = $1 AND status = 'running' AND pool_key = $2
             ORDER BY last_invocation_at DESC NULLS LAST
             LIMIT 1",
        )
        .bind(project_id)
        .bind(&pool_key)
        .fetch_optional(&mut *txn)
        .await?;

        if let Some((ws_id,)) = running {
            tracing::info!(workspace_id = %ws_id, "Resolved running workspace from pool");
            txn.commit().await?;
            ResolveAction::UseRunning(ws_id)
        } else {
            // 2. Try to find any running workspace for this project (fallback)
            let any_running: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM workspaces
                 WHERE project_id = $1 AND status = 'running'
                 ORDER BY last_invocation_at DESC NULLS LAST
                 LIMIT 1",
            )
            .bind(project_id)
            .fetch_optional(&mut *txn)
            .await?;

            if let Some((ws_id,)) = any_running {
                tracing::info!(workspace_id = %ws_id, "Resolved running workspace (any) from pool");
                txn.commit().await?;
                ResolveAction::UseRunning(ws_id)
            } else {
                // 3. Try to find a stopped workspace to wake
                let stopped: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
                    "SELECT id, coder_workspace_id FROM workspaces
                     WHERE project_id = $1 AND status = 'stopped' AND pool_key = $2
                     ORDER BY stopped_at DESC NULLS LAST
                     LIMIT 1",
                )
                .bind(project_id)
                .bind(&pool_key)
                .fetch_optional(&mut *txn)
                .await?;

                if let Some((ws_id, Some(coder_id))) = stopped {
                    tracing::info!(workspace_id = %ws_id, "Waking stopped workspace");
                    // Update status to 'running' immediately so concurrent
                    // requests that acquire the lock next see it as running.
                    sqlx::query(
                        "UPDATE workspaces SET status = 'running', updated_at = NOW() WHERE id = $1",
                    )
                    .bind(ws_id)
                    .execute(&mut *txn)
                    .await?;
                    txn.commit().await?;
                    ResolveAction::WakeStopped {
                        workspace_id: ws_id,
                        coder_id,
                    }
                } else {
                    // 4. No usable workspace — insert a placeholder so
                    //    concurrent requests see it as 'creating' and don't
                    //    also try to create one.
                    tracing::info!(
                        project_id = %project_id,
                        pool_key = %pool_key,
                        "No workspace found; inserting placeholder for new workspace"
                    );
                    let workspace_id: Uuid = sqlx::query_scalar(
                        "INSERT INTO workspaces (project_id, template_name, branch, pool_key, status)
                         VALUES ($1, 'seam-agent', $2, $3, 'creating')
                         RETURNING id",
                    )
                    .bind(project_id)
                    .bind(branch)
                    .bind(&pool_key)
                    .fetch_one(&mut *txn)
                    .await?;
                    txn.commit().await?;
                    ResolveAction::CreateNew(workspace_id)
                }
            }
        }
    };
    // Advisory lock is released here (transaction committed above).

    // --- Slow phase: Coder API calls outside the lock ---
    match action {
        ResolveAction::UseRunning(ws_id) => Ok(ws_id),

        ResolveAction::WakeStopped {
            workspace_id,
            coder_id,
        } => {
            wake_workspace(db, workspace_id, coder_id, client).await?;
            Ok(workspace_id)
        }

        ResolveAction::CreateNew(workspace_id) => {
            tracing::info!(
                project_id = %project_id,
                pool_key = %pool_key,
                "Creating new workspace for pool"
            );
            provision_pool_workspace(
                db,
                project_id,
                workspace_id,
                branch,
                &pool_key,
                user_id,
                client,
            )
            .await
        }
    }
}

/// Compute a stable i64 from bytes using FNV-1a (64-bit).
///
/// Used to derive advisory lock keys from pool_key strings.  Two different
/// pool_keys may collide (1-in-2^64 chance) but that only causes unnecessary
/// serialization, not correctness problems.
fn fnv1a_i64(data: &[u8]) -> i64 {
    const OFFSET_BASIS: u64 = 14695981039346656037;
    const PRIME: u64 = 1099511628211;
    let hash = data.iter().fold(OFFSET_BASIS, |acc, &byte| {
        acc.wrapping_mul(PRIME) ^ (byte as u64)
    });
    // Reinterpret the unsigned hash as a signed i64 for pg_advisory_xact_lock
    hash as i64
}

/// Build a pool key for project + optional branch.
fn pool_key_for(project_id: Uuid, branch: Option<&str>) -> String {
    match branch {
        Some(b) => format!("project:{}:branch:{}", project_id, b),
        None => format!("project:{}", project_id),
    }
}

/// Wake a stopped Coder workspace via the API.
///
/// Note: the advisory lock transaction pre-updates the workspace status to
/// 'running' before calling this function, so concurrent requests see it as
/// running immediately.  If the Coder API call fails here we revert the status
/// back to 'stopped' so the next invocation can try again.
#[tracing::instrument(skip(db, client), fields(workspace_id = %workspace_id, coder_workspace_id = %coder_workspace_id))]
async fn wake_workspace<C: CoderApi>(
    db: &PgPool,
    workspace_id: Uuid,
    coder_workspace_id: Uuid,
    client: &C,
) -> Result<(), DispatchError> {
    tracing::info!("Waking stopped workspace via Coder API");
    if let Err(e) = client.start_workspace(coder_workspace_id).await {
        tracing::error!(error = %e, "Failed to wake workspace via Coder API; reverting status to stopped");
        // Revert the optimistic 'running' status set in the advisory lock txn
        if let Err(db_err) = sqlx::query(
            "UPDATE workspaces SET status = 'stopped', updated_at = NOW() WHERE id = $1",
        )
        .bind(workspace_id)
        .execute(db)
        .await
        {
            tracing::warn!(workspace_id = %workspace_id, error = %db_err, "failed to revert workspace status to stopped after wake failure");
        }
        return Err(DispatchError::CoderApi(e.to_string()));
    }

    // Finalize running timestamps (status is already 'running' from the advisory lock txn)
    sqlx::query(
        "UPDATE workspaces SET started_at = NOW(), stopped_at = NULL, updated_at = NOW()
         WHERE id = $1",
    )
    .bind(workspace_id)
    .execute(db)
    .await?;

    // Emit wake event
    let event = crate::events::DomainEvent::new(
        "workspace.running",
        "workspace",
        workspace_id,
        None,
        serde_json::json!({ "source": "wake_on_invoke" }),
    );
    if let Err(e) = crate::events::emit(db, &event).await {
        tracing::warn!("Failed to emit workspace.running event: {e}");
    }

    // Poll until the workspace build reaches "running" status (agent SSH-ready).
    // Exponential backoff: 1s, 2s, 4s, 8s … up to 60s total.
    tracing::info!("Polling workspace until SSH-ready after wake");
    if let Err(e) = client
        .wait_until_ready(coder_workspace_id, std::time::Duration::from_secs(60))
        .await
    {
        tracing::error!(error = %e, "Workspace did not become ready after wake; reverting to stopped");
        if let Err(db_err) = sqlx::query(
            "UPDATE workspaces SET status = 'stopped', updated_at = NOW() WHERE id = $1",
        )
        .bind(workspace_id)
        .execute(db)
        .await
        {
            tracing::warn!(workspace_id = %workspace_id, error = %db_err, "failed to revert workspace status to stopped after readiness timeout");
        }
        return Err(DispatchError::CoderApi(e.to_string()));
    }

    tracing::info!("Workspace woken and ready");
    Ok(())
}

/// Provision a new pool workspace via the Coder API.
///
/// The workspace record must already exist in the DB (inserted in 'creating'
/// status under the advisory lock).  This function only does the slow Coder API
/// work and updates the row when done.
#[tracing::instrument(skip(db, client), fields(project_id = %project_id, workspace_id = %workspace_id, pool_key = %pool_key, branch = ?branch))]
async fn provision_pool_workspace<C: CoderApi>(
    db: &PgPool,
    project_id: Uuid,
    workspace_id: Uuid,
    branch: Option<&str>,
    pool_key: &str,
    user_id: Uuid,
    client: &C,
) -> Result<Uuid, DispatchError> {
    let template_name = "seam-agent";

    // Resolve template
    let template = client
        .get_template_by_name(template_name)
        .await
        .map_err(|e| DispatchError::CoderApi(e.to_string()))?
        .ok_or_else(|| DispatchError::CoderApi(format!("Template '{template_name}' not found")))?;

    // Build rich parameters
    let mut params = vec![];

    // Fetch project repo_url for cloning
    let project: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT repo_url, default_branch FROM projects WHERE id = $1")
            .bind(project_id)
            .fetch_optional(db)
            .await?;

    if let Some((Some(url), _default_branch)) = &project {
        params.push(crate::coder::RichParameterValue {
            name: "repo_url".to_string(),
            value: url.clone(),
        });
    }

    if let Some(b) = branch {
        params.push(crate::coder::RichParameterValue {
            name: "branch".to_string(),
            value: b.to_string(),
        });
    }

    // Inject workspace_id for log forwarding
    params.push(crate::coder::RichParameterValue {
        name: "workspace_id".to_string(),
        value: workspace_id.to_string(),
    });

    // Inject Seam URL for workspace connectivity.
    // WORKSPACE_SEAM_URL overrides SEAM_URL for workspace-accessible address.
    // In Docker environments, workspaces can't reach localhost — they need
    // host.docker.internal or an internal Docker network address.
    let workspace_seam_url = std::env::var("WORKSPACE_SEAM_URL")
        .or_else(|_| std::env::var("SEAM_URL"))
        .ok()
        .map(|url| {
            // Auto-rewrite localhost for Docker workspaces when no explicit
            // WORKSPACE_SEAM_URL is set.
            url.replace("localhost", "host.docker.internal")
                .replace("127.0.0.1", "host.docker.internal")
        });

    if let Some(seam_url) = &workspace_seam_url {
        params.push(crate::coder::RichParameterValue {
            name: "seam_url".to_string(),
            value: seam_url.clone(),
        });
    }

    // Inject Seam token for MCP auth + log forwarder.
    // This token authenticates the workspace to the Seam server's /mcp endpoint
    // and log ingest API. When MCP_AUTH_DISABLED=true, it still must be non-empty
    // so the template's MCP configuration phase runs.
    if workspace_seam_url.is_some() {
        let token = if let Some(provider) = workspace_token_provider() {
            match provider.get_token().await {
                Ok(t) => t,
                Err(e) => {
                    tracing::warn!("Failed to mint workspace JWT, using placeholder: {e}");
                    "workspace-internal".to_string()
                }
            }
        } else if std::env::var("MCP_AUTH_DISABLED").unwrap_or_default() == "true" {
            // Auth disabled — use placeholder (template still needs non-empty value
            // for the Phase 6 guard to configure MCP)
            "workspace-internal".to_string()
        } else {
            tracing::warn!(
                "MCP auth is enabled but WORKSPACE_CLIENT_SECRET not set — \
                 workspace MCP will fail to authenticate"
            );
            "workspace-internal".to_string()
        };

        params.push(crate::coder::RichParameterValue {
            name: "seam_token".to_string(),
            value: token,
        });
    }

    // Inject credentials
    if let Some(org_id) = org_id_for_project(db, project_id).await {
        if let Ok(creds) = crate::credentials::credentials_for_workspace(db, org_id, user_id).await
        {
            if !creds.is_empty() {
                let creds_map: serde_json::Map<String, serde_json::Value> = creds
                    .into_iter()
                    .map(|(k, v)| (k, serde_json::Value::String(v)))
                    .collect();
                params.push(crate::coder::RichParameterValue {
                    name: "credentials_json".to_string(),
                    value: serde_json::Value::Object(creds_map).to_string(),
                });
            }
        }
    }

    let ws_name = format!("seam-{}", &workspace_id.to_string()[..8]);
    let req = crate::coder::CreateWorkspaceRequest {
        name: ws_name,
        template_id: template.id,
        rich_parameter_values: params,
    };

    tracing::info!(workspace_id = %workspace_id, template = template_name, "Creating Coder workspace");
    match client.create_workspace("me", req).await {
        Ok(coder_ws) => {
            sqlx::query(
                "UPDATE workspaces SET
                    coder_workspace_id = $2, coder_workspace_name = $3,
                    status = 'running', started_at = NOW(), updated_at = NOW()
                 WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(coder_ws.id)
            .bind(&coder_ws.name)
            .execute(db)
            .await?;

            let event = crate::events::DomainEvent::new(
                "workspace.running",
                "workspace",
                workspace_id,
                None,
                serde_json::json!({
                    "coder_workspace_id": coder_ws.id,
                    "coder_workspace_name": coder_ws.name,
                    "pool_key": pool_key,
                }),
            );
            if let Err(e) = crate::events::emit(db, &event).await {
                tracing::warn!("Failed to emit workspace.running event: {e}");
            }

            tracing::info!(workspace_id = %workspace_id, "Pool workspace created; polling until ready");

            // Poll until the workspace build is running (agent SSH-ready).
            // New workspaces can take longer to provision than waking stopped ones;
            // allow up to 120s total.
            if let Err(e) = client
                .wait_until_ready(coder_ws.id, std::time::Duration::from_secs(120))
                .await
            {
                tracing::error!(
                    workspace_id = %workspace_id,
                    coder_workspace_id = %coder_ws.id,
                    error = %e,
                    "New workspace did not become ready in time; marking failed"
                );
                let fail_msg = format!("Workspace readiness timeout: {e}");
                if let Err(db_err) = sqlx::query(
                    "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
                )
                .bind(workspace_id)
                .bind(&fail_msg)
                .execute(db)
                .await
                {
                    tracing::warn!(workspace_id = %workspace_id, error = %db_err, "failed to update workspace status to failed after readiness timeout");
                }
                return Err(DispatchError::CoderApi(fail_msg));
            }

            tracing::info!(workspace_id = %workspace_id, "Pool workspace ready for dispatch");
            Ok(workspace_id)
        }
        Err(e) => {
            let msg = format!("Failed to create Coder workspace: {e}");
            tracing::error!(workspace_id = %workspace_id, error = %e, "Coder workspace creation failed");
            if let Err(db_err) = sqlx::query(
                "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(&msg)
            .execute(db)
            .await
            {
                tracing::warn!(workspace_id = %workspace_id, error = %db_err, "failed to update workspace status to failed");
            }
            Err(DispatchError::CoderApi(msg))
        }
    }
}

/// Look up org_id for a project (public for use in route handlers).
pub async fn org_id_for_project_pub(db: &PgPool, project_id: Uuid) -> Option<Uuid> {
    org_id_for_project(db, project_id).await
}

/// Look up org_id for a project.
async fn org_id_for_project(db: &PgPool, project_id: Uuid) -> Option<Uuid> {
    let row: Option<(Uuid,)> = sqlx::query_as("SELECT org_id FROM projects WHERE id = $1")
        .bind(project_id)
        .fetch_optional(db)
        .await
        .ok()?;
    row.map(|(id,)| id)
}

/// Row fetched from DB for dispatch.
struct InvocationRow {
    id: Uuid,
    workspace_id: Option<Uuid>,
    project_id: Uuid,
    session_id: Option<Uuid>,
    participant_id: Option<Uuid>,
    agent_perspective: String,
    prompt: String,
    system_prompt_append: Option<String>,
    resume_session_id: Option<String>,
    model_hint: Option<String>,
    budget_tier: Option<String>,
    provider: Option<String>,
}

/// Resolve effective model configuration by merging:
/// request params > task-level config > user prefs > org prefs > system defaults.
///
/// Stored at invocation CREATE time so the stored values are already the
/// merged result and dispatch can simply read them from the row.
pub async fn resolve_model_config(
    db: &PgPool,
    project_id: Uuid,
    user_id: Option<Uuid>,
    task_id: Option<Uuid>,
    request_model_hint: Option<&str>,
    request_budget_tier: Option<&str>,
    request_provider: Option<&str>,
) -> (Option<String>, Option<String>, Option<String>) {
    let mut model_hint = request_model_hint.map(|s| s.to_string());
    let mut budget_tier = request_budget_tier.map(|s| s.to_string());
    let mut provider = request_provider.map(|s| s.to_string());

    // Task-level config (between request params and user prefs)
    if let Some(tid) = task_id {
        if let Ok(Some((task_hint, task_budget, task_provider))) =
            sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>)>(
                "SELECT model_hint, budget_tier, provider FROM tasks WHERE id = $1",
            )
            .bind(tid)
            .fetch_optional(db)
            .await
        {
            if model_hint.is_none() {
                model_hint = task_hint;
            }
            if budget_tier.is_none() {
                budget_tier = task_budget;
            }
            if provider.is_none() {
                provider = task_provider;
            }
        }
    }

    // Look up user preferences (if user_id available)
    if let Some(uid) = user_id {
        let user_prefs: Vec<(String, serde_json::Value)> = sqlx::query_as(
            "SELECT preference_key, preference_value FROM user_model_preferences WHERE user_id = $1",
        )
        .bind(uid)
        .fetch_all(db)
        .await
        .unwrap_or_default();

        for (key, value) in &user_prefs {
            let val_str = value.as_str().map(|s| s.to_string());
            match key.as_str() {
                "default_model" if model_hint.is_none() => model_hint = val_str,
                "default_budget" if budget_tier.is_none() => budget_tier = val_str,
                "default_provider" if provider.is_none() => provider = val_str,
                _ => {}
            }
        }
    }

    // Look up org preferences
    if let Some(org_id) = org_id_for_project(db, project_id).await {
        let org_prefs: Vec<(String, serde_json::Value)> = sqlx::query_as(
            "SELECT preference_key, preference_value FROM org_model_preferences WHERE org_id = $1",
        )
        .bind(org_id)
        .fetch_all(db)
        .await
        .unwrap_or_default();

        for (key, value) in &org_prefs {
            let val_str = value.as_str().map(|s| s.to_string());
            match key.as_str() {
                "default_model" if model_hint.is_none() => model_hint = val_str,
                "default_budget" if budget_tier.is_none() => budget_tier = val_str,
                "default_provider" if provider.is_none() => provider = val_str,
                _ => {}
            }
        }
    }

    (model_hint, budget_tier, provider)
}

/// Enforce org-level model allowlist/denylist policy.
///
/// - If `model_denylist` is set and `model_hint` matches any entry, returns Err.
/// - If `model_allowlist` is set and non-empty, and `model_hint` does NOT match any entry, returns Err.
/// - A missing or empty allowlist means "allow all".
/// - When `model_hint` is None, policy is not enforced (no model specified).
pub async fn enforce_org_model_policy(
    db: &PgPool,
    org_id: Uuid,
    model_hint: Option<&str>,
) -> Result<(), String> {
    let model = match model_hint {
        Some(m) => m,
        None => return Ok(()),
    };

    let prefs: Vec<(String, serde_json::Value)> = sqlx::query_as(
        "SELECT preference_key, preference_value
         FROM org_model_preferences
         WHERE org_id = $1 AND preference_key IN ('model_allowlist', 'model_denylist')",
    )
    .bind(org_id)
    .fetch_all(db)
    .await
    .map_err(|e| format!("Failed to fetch org model preferences: {e}"))?;

    let mut denylist: Option<Vec<String>> = None;
    let mut allowlist: Option<Vec<String>> = None;

    for (key, value) in &prefs {
        let entries: Vec<String> = value
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        match key.as_str() {
            "model_denylist" => denylist = Some(entries),
            "model_allowlist" => allowlist = Some(entries),
            _ => {}
        }
    }

    // Check denylist first
    if let Some(ref denied) = denylist {
        if denied.iter().any(|entry| entry == model) {
            return Err(format!(
                "Model '{}' is not allowed by organization policy (denylist)",
                model
            ));
        }
    }

    // Check allowlist (only if non-empty)
    if let Some(ref allowed) = allowlist {
        if !allowed.is_empty() && !allowed.iter().any(|entry| entry == model) {
            return Err(format!(
                "Model '{}' is not allowed by organization policy (not in allowlist)",
                model
            ));
        }
    }

    Ok(())
}

/// A line tagged with its file descriptor.
struct TaggedLine {
    line: String,
    fd: &'static str,
}

/// Look up the session code for a given session_id (for WebSocket broadcast).
async fn session_code_for_id(db: &PgPool, session_id: Uuid) -> Option<String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT code FROM sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(db)
        .await
        .ok()
        .flatten();
    row.map(|(code,)| code)
}

/// Escape a string for safe embedding inside a single-quoted bash argument.
/// Single quotes cannot appear inside single-quoted strings in bash; we close
/// the quote, emit an escaped single-quote, then re-open.
fn bash_single_quote_escape(s: &str) -> String {
    s.replace('\'', "'\\''")
}

/// Core dispatch function. Loads the invocation, shells out via `coder ssh`,
/// streams output to the log buffer and WebSocket, then finalises the record.
#[tracing::instrument(skip(db, log_buffer, connections), fields(invocation_id = %invocation_id))]
pub async fn dispatch_invocation(
    db: &PgPool,
    log_buffer: &LogBuffer,
    connections: &ConnectionManager,
    invocation_id: Uuid,
) -> Result<(), DispatchError> {
    // 1. Load invocation
    let inv: Option<InvocationRow> = sqlx::query_as(
        "SELECT id, workspace_id, project_id, session_id, participant_id,
                agent_perspective, prompt, system_prompt_append, resume_session_id,
                model_hint, budget_tier, provider
         FROM invocations WHERE id = $1",
    )
    .bind(invocation_id)
    .fetch_optional(db)
    .await?
    .map(
        |(
            id,
            workspace_id,
            project_id,
            session_id,
            participant_id,
            agent_perspective,
            prompt,
            system_prompt_append,
            resume_session_id,
            model_hint,
            budget_tier,
            provider,
        ): (
            Uuid,
            Option<Uuid>,
            Uuid,
            Option<Uuid>,
            Option<Uuid>,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        )| InvocationRow {
            id,
            workspace_id,
            project_id,
            session_id,
            participant_id,
            agent_perspective,
            prompt,
            system_prompt_append,
            resume_session_id,
            model_hint,
            budget_tier,
            provider,
        },
    );

    let inv = inv.ok_or(DispatchError::NotFound)?;

    // workspace_id must be set before dispatch is called (background task does
    // this before calling us).  Guard here to catch programming errors.
    let inv_workspace_id = inv.workspace_id.ok_or_else(|| {
        tracing::error!(
            invocation_id = %invocation_id,
            "Dispatch: invocation has no workspace_id (still pending?)"
        );
        DispatchError::WorkspaceNotReady
    })?;

    tracing::info!(
        workspace_id = %inv_workspace_id,
        perspective = %inv.agent_perspective,
        resume_session_id = ?inv.resume_session_id,
        model_hint = ?inv.model_hint,
        "Dispatch: invocation loaded"
    );

    // 2. Load workspace — must have a coder_workspace_name and be running
    let ws: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT coder_workspace_name, status FROM workspaces WHERE id = $1")
            .bind(inv_workspace_id)
            .fetch_optional(db)
            .await?;

    let (coder_workspace_name, status) = ws.ok_or(DispatchError::WorkspaceNotReady)?;
    if status != "running" {
        tracing::warn!(
            workspace_id = %inv_workspace_id,
            workspace_status = %status,
            "Dispatch: workspace is not running"
        );
        return Err(DispatchError::WorkspaceNotReady);
    }
    let workspace_name = coder_workspace_name.ok_or(DispatchError::WorkspaceNotReady)?;

    tracing::info!(
        workspace_id = %inv_workspace_id,
        workspace_name = %workspace_name,
        "Dispatch: workspace resolved and running"
    );

    // 3. Check Coder CLI is available and configured
    let coder_url = std::env::var("CODER_URL").map_err(|_| DispatchError::CoderNotConfigured)?;
    let coder_token =
        std::env::var("CODER_TOKEN").map_err(|_| DispatchError::CoderNotConfigured)?;

    let coder_bin = which_coder().ok_or(DispatchError::CoderCliMissing)?;

    // 4. Mark running + emit event
    sqlx::query(
        "UPDATE invocations SET status = 'running', started_at = NOW(), updated_at = NOW()
         WHERE id = $1",
    )
    .bind(inv.id)
    .execute(db)
    .await?;

    let event = crate::events::DomainEvent::new(
        "invocation.started",
        "invocation",
        inv.id,
        None,
        serde_json::json!({
            "workspace_id": inv_workspace_id,
            "agent_perspective": inv.agent_perspective,
        }),
    );
    if let Err(e) = crate::events::emit(db, &event).await {
        tracing::warn!("Failed to emit invocation.started event: {e}");
    }

    // 5. Build the bash command string
    let mut claude_cmd = if let Some(ref session_id) = inv.resume_session_id {
        format!(
            "cd /workspace && claude -p \
             --resume '{}' \
             --agent '{}' \
             --dangerously-skip-permissions \
             --verbose \
             --output-format stream-json \
             --max-turns 50 \
             '{}'",
            bash_single_quote_escape(session_id),
            bash_single_quote_escape(&inv.agent_perspective),
            bash_single_quote_escape(&inv.prompt),
        )
    } else {
        format!(
            "cd /workspace && claude -p \
             --agent '{}' \
             --dangerously-skip-permissions \
             --verbose \
             --output-format stream-json \
             --max-turns 50 \
             '{}'",
            bash_single_quote_escape(&inv.agent_perspective),
            bash_single_quote_escape(&inv.prompt),
        )
    };

    if let Some(ref spa) = inv.system_prompt_append {
        claude_cmd.push_str(&format!(
            " --append-system-prompt '{}'",
            bash_single_quote_escape(spa)
        ));
    }

    // Prepend model selection env vars so the agent process can read them
    let mut model_env = String::new();
    if let Some(ref hint) = inv.model_hint {
        model_env.push_str(&format!(
            "export SEAM_MODEL_HINT='{}' && ",
            bash_single_quote_escape(hint)
        ));
    }
    if let Some(ref budget) = inv.budget_tier {
        model_env.push_str(&format!(
            "export SEAM_BUDGET_TIER='{}' && ",
            bash_single_quote_escape(budget)
        ));
    }
    if let Some(ref prov) = inv.provider {
        model_env.push_str(&format!(
            "export SEAM_PROVIDER='{}' && ",
            bash_single_quote_escape(prov)
        ));
    }
    let claude_cmd = format!("{model_env}{claude_cmd}");

    // 6. Resolve session code for WebSocket broadcast (best-effort)
    let session_code: Option<String> = if let Some(sid) = inv.session_id {
        session_code_for_id(db, sid).await
    } else {
        None
    };
    let participant_id_str = inv.participant_id.map(|p| p.to_string());

    // 7. Wait for startup scripts to finish (sentinel file written at end of startup)
    {
        let max_wait = std::time::Duration::from_secs(300); // 5 min for npm install
        let poll_interval = std::time::Duration::from_secs(5);
        let deadline = std::time::Instant::now() + max_wait;

        tracing::info!(
            workspace_name = %workspace_name,
            "Dispatch: waiting for startup scripts to complete"
        );

        loop {
            let probe = Command::new(&coder_bin)
                .arg("ssh")
                .arg(&workspace_name)
                .arg("--")
                .arg("test")
                .arg("-f")
                .arg("/tmp/.seam-ready")
                .env("CODER_URL", &coder_url)
                .env("CODER_SESSION_TOKEN", &coder_token)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .await;

            match probe {
                Ok(status) if status.success() => {
                    tracing::info!("Dispatch: workspace startup complete (sentinel found)");
                    break;
                }
                _ => {
                    if std::time::Instant::now() >= deadline {
                        tracing::error!(
                            workspace_name = %workspace_name,
                            "Dispatch: timed out waiting for workspace startup"
                        );
                        return Err(DispatchError::CoderApi(
                            "Workspace startup scripts did not complete in time".to_string(),
                        ));
                    }
                    tracing::debug!("Dispatch: workspace not ready yet, retrying in 5s...");
                    tokio::time::sleep(poll_interval).await;
                }
            }
        }
    }

    // 8. Spawn `coder ssh <workspace_name> -- bash -c '<cmd>'`
    tracing::info!(
        workspace_name = %workspace_name,
        perspective = %inv.agent_perspective,
        resuming = inv.resume_session_id.is_some(),
        "Dispatch: spawning coder ssh process"
    );
    let mut child = Command::new(&coder_bin)
        .arg("ssh")
        .arg(&workspace_name)
        .arg("--")
        .arg("bash")
        .arg("-c")
        .arg(&claude_cmd)
        .env("CODER_URL", &coder_url)
        .env("CODER_SESSION_TOKEN", &coder_token)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    // 8. Stream stdout and stderr concurrently via a channel.
    //    Both readers forward tagged lines into an mpsc; the main loop below
    //    drains the channel, pushes to the log buffer, and broadcasts via WS.
    //    Using a channel avoids moving `log_buffer` / `connections` into spawned
    //    tasks (which would require 'static lifetimes we don't have here).
    let (tx, mut rx) = mpsc::unbounded_channel::<TaggedLine>();

    let tx_stdout = tx.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx_stdout.send(TaggedLine { line, fd: "stdout" });
        }
    });

    let tx_stderr = tx;
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx_stderr.send(TaggedLine { line, fd: "stderr" });
        }
    });

    // Drain the channel: push to log buffer and broadcast
    let mut all_stdout_lines: Vec<String> = Vec::new();
    let mut all_stderr_lines: Vec<String> = Vec::new();

    while let Some(tagged) = rx.recv().await {
        if tagged.fd == "stdout" {
            all_stdout_lines.push(tagged.line.clone());
        } else {
            all_stderr_lines.push(tagged.line.clone());
        }
        let ll = LogLine {
            line: tagged.line,
            fd: tagged.fd.to_string(),
            ts: Utc::now().to_rfc3339(),
        };
        // Key by both invocation_id and workspace_id so polling via either works
        log_buffer.push_multi(&[inv.id, inv_workspace_id], ll.clone());

        if let (Some(ref code), Some(ref pid)) = (&session_code, &participant_id_str) {
            connections
                .broadcast_agent_stream(
                    code,
                    pid,
                    &serde_json::json!({
                        "type": "agent_stream",
                        "stream": "output",
                        "participant_id": pid,
                        "data": ll,
                    }),
                )
                .await;
        }
    }

    // Wait for reader tasks to complete, then wait for the process itself.
    // Apply a 2-hour hard timeout to prevent invocations from hanging forever.
    const DISPATCH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2 * 60 * 60);

    if let Err(e) = stdout_task.await {
        tracing::warn!(invocation_id = %inv.id, error = ?e, "stdout reader task panicked");
    }
    if let Err(e) = stderr_task.await {
        tracing::warn!(invocation_id = %inv.id, error = ?e, "stderr reader task panicked");
    }

    let exit_status = match tokio::time::timeout(DISPATCH_TIMEOUT, child.wait()).await {
        Ok(Ok(status)) => status,
        Ok(Err(e)) => {
            // IO error waiting for child
            tracing::error!(invocation_id = %inv.id, error = %e, "IO error waiting for child process");
            // Attempt to kill the child to avoid zombies
            let _ = child.kill().await;
            if let Err(e) = sqlx::query(
                "UPDATE invocations SET status = 'failed', error_message = $2, error_category = 'system_error', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
            )
            .bind(inv.id)
            .bind(format!("IO error waiting for process: {e}"))
            .execute(db)
            .await
            {
                tracing::warn!(invocation_id = %inv.id, error = %e, "failed to mark invocation failed after IO error");
            }
            return Err(DispatchError::Exec(e));
        }
        Err(_elapsed) => {
            // Timeout — kill the child and mark invocation failed
            tracing::warn!(
                invocation_id = %inv.id,
                timeout_secs = DISPATCH_TIMEOUT.as_secs(),
                "Invocation dispatch timed out; killing child process"
            );
            let _ = child.kill().await;
            if let Err(e) = sqlx::query(
                "UPDATE invocations SET status = 'failed', error_message = $2, error_category = 'timeout', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
            )
            .bind(inv.id)
            .bind(format!("Invocation timed out after {} hours", DISPATCH_TIMEOUT.as_secs() / 3600))
            .execute(db)
            .await
            {
                tracing::warn!(invocation_id = %inv.id, error = %e, "failed to mark invocation failed after timeout");
            }
            return Ok(());
        }
    };
    let exit_code = exit_status.code().unwrap_or(-1);

    // 9. Parse result JSON from stdout (last valid JSON line wins)
    let result_json = parse_claude_json_output(&all_stdout_lines);

    // Extract claude_session_id from result JSON for session continuity
    let claude_session_id: Option<String> = result_json
        .as_ref()
        .and_then(|v| v.get("session_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Extract cost tracking fields from Claude JSON output.
    // claude --output-format json emits: { model, usage: { input_tokens, output_tokens }, cost_usd }
    let model_used: Option<String> = result_json
        .as_ref()
        .and_then(|v| v.get("model"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let input_tokens: Option<i32> = result_json
        .as_ref()
        .and_then(|v| v.get("usage"))
        .and_then(|u| u.get("input_tokens"))
        .and_then(|v| v.as_i64())
        .map(|n| n as i32);
    let output_tokens: Option<i32> = result_json
        .as_ref()
        .and_then(|v| v.get("usage"))
        .and_then(|u| u.get("output_tokens"))
        .and_then(|v| v.as_i64())
        .map(|n| n as i32);
    // cost_usd may appear at the top level as cost_usd or total_cost
    let cost_usd: Option<f64> = result_json
        .as_ref()
        .and_then(|v| v.get("cost_usd").or_else(|| v.get("total_cost")))
        .and_then(|v| v.as_f64());

    // 10. Update invocation to completed or failed
    let final_status = if exit_status.success() {
        "completed"
    } else {
        "failed"
    };
    let error_message: Option<String> = if exit_status.success() {
        None
    } else {
        // Include the last 20 lines of stderr (or stdout if no stderr) for diagnosis
        let tail_lines: Vec<&str> = if !all_stderr_lines.is_empty() {
            all_stderr_lines
                .iter()
                .rev()
                .take(20)
                .rev()
                .map(|s| s.as_str())
                .collect()
        } else {
            all_stdout_lines
                .iter()
                .rev()
                .take(20)
                .rev()
                .map(|s| s.as_str())
                .collect()
        };
        let tail = tail_lines.join("\n");
        if tail.is_empty() {
            Some(format!(
                "Process exited with code {exit_code} (no output captured)"
            ))
        } else {
            Some(format!("Process exited with code {exit_code}\n\n{tail}"))
        }
    };

    // Categorize errors based on exit code and output (best-effort, non-blocking)
    let combined_output = all_stdout_lines.join("\n");
    let error_category = categorize_error(exit_code, &combined_output);

    if exit_status.success() {
        tracing::info!(
            workspace_id = %inv_workspace_id,
            exit_code = exit_code,
            model_used = ?model_used,
            input_tokens = ?input_tokens,
            output_tokens = ?output_tokens,
            claude_session_id = ?claude_session_id,
            "Dispatch: process completed successfully"
        );
    } else {
        // Log last few lines of stderr for quick diagnosis in server logs
        let stderr_tail: String = all_stderr_lines
            .iter()
            .rev()
            .take(5)
            .rev()
            .cloned()
            .collect::<Vec<_>>()
            .join(" | ");
        tracing::error!(
            workspace_id = %inv_workspace_id,
            exit_code = exit_code,
            stderr_tail = %stderr_tail,
            "Dispatch: process exited with non-zero status"
        );
    }

    sqlx::query(
        "UPDATE invocations
         SET status = $2,
             exit_code = $3,
             result_json = $4,
             error_message = $5,
             claude_session_id = $6,
             model_used = $7,
             input_tokens = $8,
             output_tokens = $9,
             cost_usd = $10,
             error_category = $11,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1",
    )
    .bind(inv.id)
    .bind(final_status)
    .bind(exit_code)
    .bind(&result_json)
    .bind(&error_message)
    .bind(&claude_session_id)
    .bind(&model_used)
    .bind(input_tokens)
    .bind(output_tokens)
    .bind(cost_usd)
    .bind(&error_category)
    .execute(db)
    .await?;

    // 11. Update workspace.last_invocation_at (best-effort)
    let _ = sqlx::query(
        "UPDATE workspaces SET last_invocation_at = NOW(), updated_at = NOW() WHERE id = $1",
    )
    .bind(inv_workspace_id)
    .execute(db)
    .await;

    // 12. Emit completion event
    let event_type = if exit_status.success() {
        "invocation.completed"
    } else {
        "invocation.failed"
    };
    let event = crate::events::DomainEvent::new(
        event_type,
        "invocation",
        inv.id,
        None,
        serde_json::json!({
            "workspace_id": inv_workspace_id,
            "exit_code": exit_code,
            "status": final_status,
            "claude_session_id": claude_session_id,
        }),
    );
    if let Err(e) = crate::events::emit(db, &event).await {
        tracing::warn!("Failed to emit {event_type} event: {e}");
    }

    // 13. Broadcast metrics_update to project subscribers
    let duration_seconds: Option<f64> = sqlx::query_scalar(
        "SELECT EXTRACT(EPOCH FROM (completed_at - started_at))::float8
         FROM invocations WHERE id = $1",
    )
    .bind(inv.id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    connections
        .broadcast_to_project(
            &inv.project_id.to_string(),
            &serde_json::json!({
                "type": "metrics_update",
                "project_id": inv.project_id,
                "data": {
                    "event": event_type,
                    "invocation_id": inv.id,
                    "perspective": inv.agent_perspective,
                    "duration_seconds": duration_seconds,
                    "exit_code": exit_code,
                    "cost_usd": cost_usd,
                    "model_used": model_used,
                }
            }),
        )
        .await;

    tracing::info!(
        invocation_id = %inv.id,
        status = final_status,
        exit_code = exit_code,
        "Invocation dispatch complete"
    );

    Ok(())
}

/// Find the `coder` binary on PATH. Returns None if not found.
fn which_coder() -> Option<std::path::PathBuf> {
    std::env::var_os("PATH")
        .as_deref()
        .unwrap_or_default()
        .to_str()
        .unwrap_or("")
        .split(':')
        .map(std::path::Path::new)
        .map(|dir| dir.join("coder"))
        .find(|p| p.is_file())
}

/// Categorize the failure reason based on exit code and output text.
///
/// Returns None when the invocation succeeded (exit_code == 0) or when
/// the failure reason cannot be determined. Categorization is best-effort
/// and should never block completion of the invocation record update.
fn categorize_error(exit_code: i32, output: &str) -> Option<String> {
    if exit_code == 124 || output.contains("timed out") || output.contains("deadline exceeded") {
        Some("timeout".to_string())
    } else if output.contains("WorkspaceNotReady")
        || (output.contains("workspace") && output.contains("failed"))
        || output.contains("connection refused")
        || output.contains("Connection refused")
    {
        Some("workspace_error".to_string())
    } else if output.contains("rate_limit")
        || output.contains("overloaded")
        || output.contains("529")
    {
        Some("claude_error".to_string())
    } else if output.contains("auth")
        || (output.contains("token") && output.contains("expired"))
        || output.contains("401")
        || output.contains("403")
        || output.contains("Unauthorized")
        || output.contains("Forbidden")
    {
        Some("auth_error".to_string())
    } else if exit_code != 0 {
        Some("system_error".to_string())
    } else {
        None
    }
}

/// Parse the claude JSON output from collected stdout lines.
/// `claude --output-format json` emits a JSON object as the last line.
/// We scan in reverse to find the last well-formed JSON object or array.
fn parse_claude_json_output(lines: &[String]) -> Option<serde_json::Value> {
    for line in lines.iter().rev() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') || trimmed.starts_with('[') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
                return Some(v);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- categorize_error ---

    #[test]
    fn categorize_error_success_returns_none() {
        assert!(categorize_error(0, "").is_none());
    }

    #[test]
    fn categorize_error_exit_124_is_timeout() {
        assert_eq!(categorize_error(124, ""), Some("timeout".to_string()));
    }

    #[test]
    fn categorize_error_timed_out_in_output() {
        assert_eq!(
            categorize_error(1, "process timed out after 30s"),
            Some("timeout".to_string())
        );
    }

    #[test]
    fn categorize_error_workspace_not_ready() {
        assert_eq!(
            categorize_error(1, "WorkspaceNotReady"),
            Some("workspace_error".to_string())
        );
    }

    #[test]
    fn categorize_error_workspace_failed() {
        assert_eq!(
            categorize_error(1, "workspace provisioning failed"),
            Some("workspace_error".to_string())
        );
    }

    #[test]
    fn categorize_error_rate_limit() {
        assert_eq!(
            categorize_error(1, "Error: rate_limit exceeded"),
            Some("claude_error".to_string())
        );
    }

    #[test]
    fn categorize_error_overloaded() {
        assert_eq!(
            categorize_error(1, "claude is overloaded"),
            Some("claude_error".to_string())
        );
    }

    #[test]
    fn categorize_error_auth() {
        assert_eq!(
            categorize_error(1, "auth failed: invalid credentials"),
            Some("auth_error".to_string())
        );
    }

    #[test]
    fn categorize_error_token_expired() {
        assert_eq!(
            categorize_error(1, "token has expired"),
            Some("auth_error".to_string())
        );
    }

    #[test]
    fn categorize_error_generic_nonzero_is_system_error() {
        assert_eq!(
            categorize_error(1, "some unknown failure"),
            Some("system_error".to_string())
        );
    }

    #[test]
    fn categorize_error_exit_nonzero_empty_output() {
        assert_eq!(categorize_error(127, ""), Some("system_error".to_string()));
    }

    // --- pool_key_for ---

    #[test]
    fn pool_key_without_branch() {
        let project_id = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        let key = pool_key_for(project_id, None);
        assert_eq!(key, "project:00000000-0000-0000-0000-000000000001");
    }

    #[test]
    fn pool_key_with_branch() {
        let project_id = Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap();
        let key = pool_key_for(project_id, Some("main"));
        assert_eq!(
            key,
            "project:00000000-0000-0000-0000-000000000002:branch:main"
        );
    }

    #[test]
    fn pool_key_with_feature_branch() {
        let project_id = Uuid::parse_str("00000000-0000-0000-0000-000000000003").unwrap();
        let key = pool_key_for(project_id, Some("feat/my-feature"));
        assert_eq!(
            key,
            "project:00000000-0000-0000-0000-000000000003:branch:feat/my-feature"
        );
    }

    // --- parse_claude_json_output ---

    #[test]
    fn parse_json_output_returns_none_for_empty_lines() {
        let lines: Vec<String> = vec![];
        assert!(parse_claude_json_output(&lines).is_none());
    }

    #[test]
    fn parse_json_output_returns_none_for_non_json_lines() {
        let lines = vec![
            "Starting agent...".to_string(),
            "Processing task".to_string(),
            "Done".to_string(),
        ];
        assert!(parse_claude_json_output(&lines).is_none());
    }

    #[test]
    fn parse_json_output_picks_up_last_json_object() {
        let lines = vec![
            "Some text output".to_string(),
            r#"{"session_id": "abc123", "model": "claude-opus-4-5"}"#.to_string(),
        ];
        let result = parse_claude_json_output(&lines).expect("should parse JSON");
        assert_eq!(result["session_id"], "abc123");
        assert_eq!(result["model"], "claude-opus-4-5");
    }

    #[test]
    fn parse_json_output_prefers_last_json_when_multiple() {
        let lines = vec![
            r#"{"session_id": "first", "model": "a"}"#.to_string(),
            "some text in between".to_string(),
            r#"{"session_id": "last", "model": "b", "cost_usd": 0.01}"#.to_string(),
        ];
        let result = parse_claude_json_output(&lines).expect("should parse JSON");
        assert_eq!(result["session_id"], "last");
    }

    #[test]
    fn parse_json_output_skips_invalid_json_and_finds_valid() {
        let lines = vec![
            r#"{"session_id": "valid", "model": "claude"}"#.to_string(),
            "not json at all".to_string(),
            // Intentionally malformed JSON as the last candidate
            "{malformed}".to_string(),
        ];
        let result = parse_claude_json_output(&lines).expect("should parse JSON");
        assert_eq!(result["session_id"], "valid");
    }

    #[test]
    fn parse_json_output_extracts_session_id() {
        let lines = vec![
            r#"{"session_id": "ses_xyz789", "model": "claude-sonnet", "cost_usd": 0.05, "usage": {"input_tokens": 1000, "output_tokens": 500}}"#.to_string(),
        ];
        let result = parse_claude_json_output(&lines).expect("should parse JSON");
        assert_eq!(result["session_id"], "ses_xyz789");
        assert_eq!(result["usage"]["input_tokens"], 1000);
        assert_eq!(result["usage"]["output_tokens"], 500);
        assert_eq!(result["cost_usd"], 0.05);
    }

    #[test]
    fn parse_json_output_handles_json_array() {
        let lines = vec![r#"[{"type": "result"}]"#.to_string()];
        let result = parse_claude_json_output(&lines).expect("should parse JSON array");
        assert!(result.is_array());
    }

    #[test]
    fn parse_json_output_handles_whitespace_prefix() {
        // Lines with leading whitespace should still be detected
        let lines = vec![
            "  text  ".to_string(),
            r#"  {"session_id": "trimmed"}"#.to_string(),
        ];
        let result = parse_claude_json_output(&lines).expect("should parse JSON with whitespace");
        assert_eq!(result["session_id"], "trimmed");
    }

    // --- bash_single_quote_escape ---

    #[test]
    fn bash_escape_plain_string_unchanged() {
        assert_eq!(bash_single_quote_escape("hello world"), "hello world");
    }

    #[test]
    fn bash_escape_replaces_single_quotes() {
        // A single-quote in the input becomes: '\''
        let escaped = bash_single_quote_escape("it's a test");
        assert_eq!(escaped, "it'\\''s a test");
    }

    #[test]
    fn bash_escape_multiple_single_quotes() {
        let escaped = bash_single_quote_escape("can't stop won't stop");
        assert_eq!(escaped, "can'\\''t stop won'\\''t stop");
    }

    #[test]
    fn bash_escape_empty_string() {
        assert_eq!(bash_single_quote_escape(""), "");
    }

    // --- MockCoderClient integration (compile-time verification) ---
    //
    // The following test verifies that MockCoderClient satisfies the CoderApi
    // trait and can be used where a CoderApi impl is expected. This is a
    // compile-time check more than a runtime check — if it compiles, the mock
    // implements the full interface correctly.

    #[tokio::test]
    async fn mock_coder_client_start_workspace_ok() {
        use crate::coder::testing::MockCoderClient;
        let template_id = Uuid::new_v4();
        let coder_ws_id = Uuid::new_v4();
        let mock = MockCoderClient::new_ok(template_id, coder_ws_id);

        let result = mock.start_workspace(coder_ws_id).await;
        assert!(result.is_ok());
        assert_eq!(mock.start_workspace_calls.lock().unwrap().len(), 1);
        assert_eq!(mock.start_workspace_calls.lock().unwrap()[0], coder_ws_id);
    }

    #[tokio::test]
    async fn mock_coder_client_get_template_found() {
        use crate::coder::testing::MockCoderClient;
        let template_id = Uuid::new_v4();
        let mock = MockCoderClient::new_ok(template_id, Uuid::new_v4());

        let result = mock.get_template_by_name("seam-agent").await;
        assert!(result.is_ok());
        let template = result.unwrap().expect("template should be found");
        assert_eq!(template.name, "seam-agent");
        assert_eq!(template.id, template_id);
    }

    #[tokio::test]
    async fn mock_coder_client_get_template_not_found() {
        use crate::coder::testing::MockCoderClient;
        let mock = MockCoderClient::new_no_template();

        let result = mock.get_template_by_name("seam-agent").await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_none(), "template should not be found");
    }

    #[tokio::test]
    async fn mock_coder_client_create_workspace_ok() {
        use crate::coder::testing::MockCoderClient;
        use crate::coder::CreateWorkspaceRequest;
        let template_id = Uuid::new_v4();
        let coder_ws_id = Uuid::new_v4();
        let mock = MockCoderClient::new_ok(template_id, coder_ws_id);

        let req = CreateWorkspaceRequest {
            name: "seam-test".to_string(),
            template_id,
            rich_parameter_values: vec![],
        };
        let result = mock.create_workspace("me", req).await;
        assert!(result.is_ok());
        let ws = result.unwrap();
        assert_eq!(ws.id, coder_ws_id);

        let calls = mock.create_workspace_calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "me");
        assert_eq!(calls[0].1, "seam-test");
    }

    #[tokio::test]
    async fn mock_coder_client_create_workspace_fails() {
        use crate::coder::testing::MockCoderClient;
        use crate::coder::CreateWorkspaceRequest;
        let template_id = Uuid::new_v4();
        let mock = MockCoderClient::new_create_fails(template_id, "quota exceeded");

        let req = CreateWorkspaceRequest {
            name: "seam-fail".to_string(),
            template_id,
            rich_parameter_values: vec![],
        };
        let result = mock.create_workspace("me", req).await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("quota exceeded"), "error: {err}");
    }
}
