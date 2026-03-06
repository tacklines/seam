use reqwest::Client;
use sqlx::PgPool;
use tracing::{info, warn, error};
use uuid::Uuid;
use serde::Deserialize;

/// Shared config for launch_agent action
#[derive(Debug, Deserialize)]
pub struct LaunchAgentConfig {
    /// Session code to launch the agent into (required for reactions, optional for scheduled)
    pub session_code: Option<String>,
    /// Agent type: "coder", "planner", "reviewer"
    pub agent_type: Option<String>,
    /// Skill to run
    pub skill: Option<String>,
    /// Model override
    pub model: Option<String>,
    /// Custom instructions
    pub instructions: Option<String>,
}

/// Shared config for webhook action
#[derive(Debug, Deserialize)]
pub struct WebhookConfig {
    /// URL to POST to
    pub url: String,
    /// Optional headers
    pub headers: Option<std::collections::HashMap<String, String>>,
    /// Whether to include the event payload in the request body (default true)
    pub include_payload: Option<bool>,
}

/// Shared config for mcp_tool action
#[derive(Debug, Deserialize)]
pub struct McpToolConfig {
    /// MCP tool name to invoke
    pub tool_name: String,
    /// Static arguments to pass (merged with event data for reactions)
    pub arguments: Option<serde_json::Value>,
}

/// Context passed to action dispatch
pub struct ActionContext {
    /// The event that triggered this action (None for scheduled jobs)
    pub event_payload: Option<serde_json::Value>,
    /// Project this action belongs to
    pub project_id: Uuid,
    /// Source identifier for logging (reaction name or job name)
    pub source: String,
}

/// Dispatch an action by type. Returns Ok(()) on success.
pub async fn dispatch(
    pool: &PgPool,
    action_type: &str,
    action_config: &serde_json::Value,
    ctx: &ActionContext,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    match action_type {
        "launch_agent" => dispatch_launch_agent(pool, action_config, ctx).await,
        "webhook" => dispatch_webhook(action_config, ctx).await,
        "mcp_tool" => dispatch_mcp_tool(action_config, ctx).await,
        other => {
            warn!(action_type = other, source = %ctx.source, "Unknown action type");
            Ok(())
        }
    }
}

async fn dispatch_launch_agent(
    pool: &PgPool,
    action_config: &serde_json::Value,
    ctx: &ActionContext,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config: LaunchAgentConfig = serde_json::from_value(action_config.clone())?;

    // Find a session to launch into
    let session_code = if let Some(code) = &config.session_code {
        code.clone()
    } else {
        // Find the most recent open session for this project
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT code FROM sessions
             WHERE project_id = $1 AND closed_at IS NULL
             ORDER BY created_at DESC LIMIT 1"
        )
        .bind(ctx.project_id)
        .fetch_optional(pool)
        .await?;

        match row {
            Some((code,)) => code,
            None => {
                warn!(
                    project_id = %ctx.project_id,
                    source = %ctx.source,
                    "No open session found for launch_agent action"
                );
                return Ok(());
            }
        }
    };

    let agent_type = config.agent_type.unwrap_or_else(|| "coder".to_string());

    // Build internal launch request via HTTP to the server's own API
    // This reuses all the existing launch_agent logic (participant creation,
    // workspace provisioning, credential injection, etc.)
    let seam_url = std::env::var("SEAM_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string());

    let mut body = serde_json::json!({
        "agent_type": agent_type,
    });
    if let Some(instructions) = &config.instructions {
        body["instructions"] = serde_json::Value::String(instructions.clone());
    }

    // The worker needs a valid auth token to call the API.
    // Use WORKER_API_TOKEN env var (a Keycloak service account token or admin token).
    let api_token = std::env::var("WORKER_API_TOKEN").ok();

    let client = Client::new();
    let mut req = client
        .post(format!("{}/api/sessions/{}/agents", seam_url, session_code))
        .json(&body);

    if let Some(token) = &api_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req.send().await?;

    if resp.status().is_success() {
        let result: serde_json::Value = resp.json().await?;
        info!(
            project_id = %ctx.project_id,
            session_code = %session_code,
            agent_type = %agent_type,
            workspace_id = %result["workspace_id"],
            source = %ctx.source,
            "Launched agent via reaction/schedule"
        );
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        error!(
            status = %status,
            body = %body,
            source = %ctx.source,
            "Failed to launch agent"
        );
        return Err(format!("Agent launch failed: {} {}", status, body).into());
    }

    Ok(())
}

async fn dispatch_webhook(
    action_config: &serde_json::Value,
    ctx: &ActionContext,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config: WebhookConfig = serde_json::from_value(action_config.clone())?;

    let client = Client::new();
    let mut req = client.post(&config.url);

    // Add custom headers
    if let Some(headers) = &config.headers {
        for (key, value) in headers {
            req = req.header(key, value);
        }
    }

    // Build request body
    let include_payload = config.include_payload.unwrap_or(true);
    let body = if include_payload {
        serde_json::json!({
            "source": ctx.source,
            "project_id": ctx.project_id,
            "event": ctx.event_payload,
        })
    } else {
        serde_json::json!({
            "source": ctx.source,
            "project_id": ctx.project_id,
        })
    };

    let resp = req
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    if resp.status().is_success() {
        info!(
            url = %config.url,
            status = %resp.status(),
            source = %ctx.source,
            "Webhook delivered"
        );
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        warn!(
            url = %config.url,
            status = %status,
            response = %body,
            source = %ctx.source,
            "Webhook returned non-success status"
        );
    }

    Ok(())
}

async fn dispatch_mcp_tool(
    action_config: &serde_json::Value,
    ctx: &ActionContext,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config: McpToolConfig = serde_json::from_value(action_config.clone())?;

    // Merge static arguments with event payload if present
    let _arguments = match (&config.arguments, &ctx.event_payload) {
        (Some(args), Some(event)) => {
            let mut merged = args.clone();
            if let (Some(m), Some(e)) = (merged.as_object_mut(), event.as_object()) {
                // Event data available as _event.* keys
                m.insert("_event".to_string(), serde_json::Value::Object(e.clone()));
            }
            merged
        }
        (Some(args), None) => args.clone(),
        (None, Some(event)) => serde_json::json!({"_event": event}),
        (None, None) => serde_json::json!({}),
    };

    info!(
        tool_name = %config.tool_name,
        source = %ctx.source,
        project_id = %ctx.project_id,
        "MCP tool invocation requested (direct MCP client not yet wired — logging intent)"
    );

    // TODO: Wire up actual MCP client call.
    // For now this is a structured log that confirms the config parses correctly.
    // Full implementation requires an MCP client in the worker, which is a larger piece.
    // The webhook action can serve as a workaround by pointing at the MCP HTTP endpoint.

    Ok(())
}
