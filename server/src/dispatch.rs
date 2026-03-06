/// Invocation dispatcher: executes `claude -p` commands inside Coder workspaces
/// via `coder ssh` and streams output back to the log buffer + WebSocket.
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
