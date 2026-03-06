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

use crate::log_buffer::{LogBuffer, LogLine};
use crate::ws::ConnectionManager;

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
pub async fn resolve_workspace(
    db: &PgPool,
    project_id: Uuid,
    branch: Option<&str>,
    user_id: Uuid,
) -> Result<Uuid, DispatchError> {
    let pool_key = pool_key_for(project_id, branch);

    // 1. Try to find a running workspace with matching pool_key
    let running: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM workspaces
         WHERE project_id = $1 AND status = 'running' AND pool_key = $2
         ORDER BY last_invocation_at DESC NULLS LAST
         LIMIT 1",
    )
    .bind(project_id)
    .bind(&pool_key)
    .fetch_optional(db)
    .await?;

    if let Some((ws_id,)) = running {
        tracing::info!(workspace_id = %ws_id, "Resolved running workspace from pool");
        return Ok(ws_id);
    }

    // 2. Try to find any running workspace for this project (fallback)
    let any_running: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM workspaces
         WHERE project_id = $1 AND status = 'running'
         ORDER BY last_invocation_at DESC NULLS LAST
         LIMIT 1",
    )
    .bind(project_id)
    .fetch_optional(db)
    .await?;

    if let Some((ws_id,)) = any_running {
        tracing::info!(workspace_id = %ws_id, "Resolved running workspace (any) from pool");
        return Ok(ws_id);
    }

    // 3. Try to find a stopped workspace to wake
    let stopped: Option<(Uuid, Option<Uuid>)> = sqlx::query_as(
        "SELECT id, coder_workspace_id FROM workspaces
         WHERE project_id = $1 AND status = 'stopped' AND pool_key = $2
         ORDER BY stopped_at DESC NULLS LAST
         LIMIT 1",
    )
    .bind(project_id)
    .bind(&pool_key)
    .fetch_optional(db)
    .await?;

    if let Some((ws_id, coder_ws_id)) = stopped {
        if let Some(coder_id) = coder_ws_id {
            tracing::info!(workspace_id = %ws_id, "Waking stopped workspace");
            wake_workspace(db, ws_id, coder_id).await?;
            return Ok(ws_id);
        }
    }

    // 4. Create a new workspace
    tracing::info!(project_id = %project_id, pool_key = %pool_key, "Creating new workspace for pool");
    create_pool_workspace(db, project_id, branch, &pool_key, user_id).await
}

/// Build a pool key for project + optional branch.
fn pool_key_for(project_id: Uuid, branch: Option<&str>) -> String {
    match branch {
        Some(b) => format!("project:{}:branch:{}", project_id, b),
        None => format!("project:{}", project_id),
    }
}

/// Wake a stopped Coder workspace via the API.
async fn wake_workspace(db: &PgPool, workspace_id: Uuid, coder_workspace_id: Uuid) -> Result<(), DispatchError> {
    let coder_url = std::env::var("CODER_URL").map_err(|_| DispatchError::CoderNotConfigured)?;
    let coder_token = std::env::var("CODER_TOKEN").map_err(|_| DispatchError::CoderNotConfigured)?;

    let client = crate::coder::CoderClient::new(coder_url, coder_token);
    client.start_workspace(coder_workspace_id).await
        .map_err(|e| DispatchError::CoderApi(e.to_string()))?;

    // Update status to running
    sqlx::query(
        "UPDATE workspaces SET status = 'running', started_at = NOW(), stopped_at = NULL, updated_at = NOW()
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

    // Wait briefly for workspace to be SSH-ready
    tokio::time::sleep(std::time::Duration::from_secs(5)).await;

    Ok(())
}

/// Create a new workspace in the pool via Coder API.
async fn create_pool_workspace(
    db: &PgPool,
    project_id: Uuid,
    branch: Option<&str>,
    pool_key: &str,
    user_id: Uuid,
) -> Result<Uuid, DispatchError> {
    let coder_url = std::env::var("CODER_URL").map_err(|_| DispatchError::CoderNotConfigured)?;
    let coder_token = std::env::var("CODER_TOKEN").map_err(|_| DispatchError::CoderNotConfigured)?;
    let client = crate::coder::CoderClient::new(coder_url, coder_token);

    let template_name = "seam-agent";

    // Resolve template
    let template = client
        .get_template_by_name(template_name)
        .await
        .map_err(|e| DispatchError::CoderApi(e.to_string()))?
        .ok_or_else(|| DispatchError::CoderApi(format!("Template '{template_name}' not found")))?;

    // Insert workspace record
    let workspace_id: Uuid = sqlx::query_scalar(
        "INSERT INTO workspaces (project_id, template_name, branch, pool_key, status)
         VALUES ($1, $2, $3, $4, 'creating')
         RETURNING id",
    )
    .bind(project_id)
    .bind(template_name)
    .bind(branch)
    .bind(pool_key)
    .fetch_one(db)
    .await?;

    // Build rich parameters
    let mut params = vec![];

    // Fetch project repo_url for cloning
    let project: Option<(Option<String>, String)> = sqlx::query_as(
        "SELECT repo_url, default_branch FROM projects WHERE id = $1",
    )
    .bind(project_id)
    .fetch_optional(db)
    .await?;

    if let Some((repo_url, _default_branch)) = &project {
        if let Some(url) = repo_url {
            params.push(crate::coder::RichParameterValue {
                name: "repo_url".to_string(),
                value: url.clone(),
            });
        }
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

    // Inject Seam URL
    if let Ok(seam_url) = std::env::var("SEAM_URL") {
        params.push(crate::coder::RichParameterValue {
            name: "seam_url".to_string(),
            value: seam_url,
        });
    }

    // Inject credentials
    if let Some(org_id) = org_id_for_project(db, project_id).await {
        if let Ok(creds) = crate::credentials::credentials_for_workspace(db, org_id, user_id).await {
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

            tracing::info!(workspace_id = %workspace_id, "Pool workspace created and running");

            // Wait for workspace startup to complete
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;

            Ok(workspace_id)
        }
        Err(e) => {
            let msg = format!("Failed to create Coder workspace: {e}");
            let _ = sqlx::query(
                "UPDATE workspaces SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1",
            )
            .bind(workspace_id)
            .bind(&msg)
            .execute(db)
            .await;
            Err(DispatchError::CoderApi(msg))
        }
    }
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
    workspace_id: Uuid,
    session_id: Option<Uuid>,
    participant_id: Option<Uuid>,
    agent_perspective: String,
    prompt: String,
    system_prompt_append: Option<String>,
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
pub async fn dispatch_invocation(
    db: &PgPool,
    log_buffer: &LogBuffer,
    connections: &ConnectionManager,
    invocation_id: Uuid,
) -> Result<(), DispatchError> {
    // 1. Load invocation
    let inv: Option<InvocationRow> = sqlx::query_as(
        "SELECT id, workspace_id, session_id, participant_id,
                agent_perspective, prompt, system_prompt_append
         FROM invocations WHERE id = $1",
    )
    .bind(invocation_id)
    .fetch_optional(db)
    .await?
    .map(
        |(id, workspace_id, session_id, participant_id, agent_perspective, prompt, system_prompt_append): (
            Uuid,
            Uuid,
            Option<Uuid>,
            Option<Uuid>,
            String,
            String,
            Option<String>,
        )| InvocationRow {
            id,
            workspace_id,
            session_id,
            participant_id,
            agent_perspective,
            prompt,
            system_prompt_append,
        },
    );

    let inv = inv.ok_or(DispatchError::NotFound)?;

    // 2. Load workspace — must have a coder_workspace_name and be running
    let ws: Option<(Option<String>, String)> =
        sqlx::query_as("SELECT coder_workspace_name, status FROM workspaces WHERE id = $1")
            .bind(inv.workspace_id)
            .fetch_optional(db)
            .await?;

    let (coder_workspace_name, status) = ws.ok_or(DispatchError::WorkspaceNotReady)?;
    if status != "running" {
        return Err(DispatchError::WorkspaceNotReady);
    }
    let workspace_name = coder_workspace_name.ok_or(DispatchError::WorkspaceNotReady)?;

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
            "workspace_id": inv.workspace_id,
            "agent_perspective": inv.agent_perspective,
        }),
    );
    if let Err(e) = crate::events::emit(db, &event).await {
        tracing::warn!("Failed to emit invocation.started event: {e}");
    }

    // 5. Build the bash command string
    let mut claude_cmd = format!(
        "cd /workspace && claude -p \
         --agent '{}' \
         --dangerously-skip-permissions \
         --output-format json \
         --max-turns 50 \
         '{}'",
        bash_single_quote_escape(&inv.agent_perspective),
        bash_single_quote_escape(&inv.prompt),
    );

    if let Some(ref spa) = inv.system_prompt_append {
        claude_cmd.push_str(&format!(
            " --append-system-prompt '{}'",
            bash_single_quote_escape(spa)
        ));
    }

    // 6. Resolve session code for WebSocket broadcast (best-effort)
    let session_code: Option<String> = if let Some(sid) = inv.session_id {
        session_code_for_id(db, sid).await
    } else {
        None
    };
    let participant_id_str = inv.participant_id.map(|p| p.to_string());

    // 7. Spawn `coder ssh <workspace_name> -- bash -c '<cmd>'`
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

    while let Some(tagged) = rx.recv().await {
        if tagged.fd == "stdout" {
            all_stdout_lines.push(tagged.line.clone());
        }
        let ll = LogLine {
            line: tagged.line,
            fd: tagged.fd.to_string(),
            ts: Utc::now().to_rfc3339(),
        };
        // Key by both invocation_id and workspace_id so polling via either works
        log_buffer.push_multi(&[inv.id, inv.workspace_id], ll.clone());

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

    // Wait for reader tasks to complete, then wait for the process itself
    let _ = stdout_task.await;
    let _ = stderr_task.await;
    let exit_status = child.wait().await?;
    let exit_code = exit_status.code().unwrap_or(-1);

    // 9. Parse result JSON from stdout (last valid JSON line wins)
    let result_json = parse_claude_json_output(&all_stdout_lines);

    // 10. Update invocation to completed or failed
    let final_status = if exit_status.success() {
        "completed"
    } else {
        "failed"
    };
    let error_message: Option<String> = if exit_status.success() {
        None
    } else {
        Some(format!("Process exited with code {exit_code}"))
    };

    sqlx::query(
        "UPDATE invocations
         SET status = $2,
             exit_code = $3,
             result_json = $4,
             error_message = $5,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1",
    )
    .bind(inv.id)
    .bind(final_status)
    .bind(exit_code)
    .bind(&result_json)
    .bind(&error_message)
    .execute(db)
    .await?;

    // 11. Update workspace.last_invocation_at (best-effort)
    let _ = sqlx::query(
        "UPDATE workspaces SET last_invocation_at = NOW(), updated_at = NOW() WHERE id = $1",
    )
    .bind(inv.workspace_id)
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
            "workspace_id": inv.workspace_id,
            "exit_code": exit_code,
            "status": final_status,
        }),
    );
    if let Err(e) = crate::events::emit(db, &event).await {
        tracing::warn!("Failed to emit {event_type} event: {e}");
    }

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
