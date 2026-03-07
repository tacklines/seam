use reqwest::Client;
use sqlx::PgPool;
use tracing::{info, warn, error};
use uuid::Uuid;
use serde::Deserialize;
use std::time::Duration;

/// Config for invoke_agent action (ephemeral invocation)
#[derive(Debug, Deserialize)]
pub struct InvokeAgentConfig {
    /// Agent perspective: "coder", "reviewer", "planner"
    pub agent_perspective: Option<String>,
    /// Prompt template (supports {{key}} interpolation from event payload)
    pub prompt: String,
    /// Optional system prompt append
    pub system_prompt_append: Option<String>,
    /// Optional branch to work on
    pub branch: Option<String>,
    /// Optional task ID to associate with
    pub task_id: Option<String>,
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

/// Config for lightweight inference action (direct LLM call without a workspace)
#[derive(Debug, Deserialize)]
pub struct InferenceConfig {
    /// System prompt for the model
    pub system_prompt: String,
    /// User prompt template (supports {{key}} interpolation from event payload)
    pub prompt: String,
    /// Provider: "anthropic", "openrouter", "ollama" (defaults to INFERENCE_DEFAULT_PROVIDER env var or "anthropic")
    pub provider: Option<String>,
    /// Model ID (e.g., "claude-haiku-4-5-20251001", "qwen/qwen3.5-coder-32b-instruct")
    pub model: Option<String>,
    /// Max tokens for response (default 1024)
    pub max_tokens: Option<u32>,
    /// Where to write the result
    pub result_target: ResultTarget,
}

/// Where the inference result should be written
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ResultTarget {
    /// Update a field on the triggering aggregate
    UpdateField {
        /// SQL table name (e.g., "tasks", "sessions")
        table: String,
        /// Column name to update (e.g., "ai_triage", "summary")
        column: String,
        /// Whether to parse response as JSON before storing (default false)
        parse_json: Option<bool>,
    },
    /// Just log the result (for testing/monitoring)
    LogOnly,
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
        "invoke_agent" => dispatch_invoke_agent(action_config, ctx).await,
        "webhook" => dispatch_webhook(action_config, ctx).await,
        "mcp_tool" => dispatch_mcp_tool(action_config, ctx).await,
        "inference" => dispatch_inference(pool, action_config, ctx).await,
        other => {
            warn!(action_type = other, source = %ctx.source, "Unknown action type");
            Ok(())
        }
    }
}

/// Replace `{{key}}` placeholders in a template with values from event payload.
/// Supports nested keys via dot notation: `{{nested.key}}`.
/// Missing keys are left as-is.
fn interpolate_template(template: &str, payload: Option<&serde_json::Value>) -> String {
    let Some(payload) = payload else {
        return template.to_string();
    };
    let mut result = template.to_string();
    // Find all {{...}} patterns
    let re = regex::Regex::new(r"\{\{(\w+(?:\.\w+)*)\}\}").unwrap();
    for cap in re.captures_iter(template) {
        let full_match = &cap[0];
        let key_path = &cap[1];
        let mut current = payload;
        let mut found = true;
        for part in key_path.split('.') {
            match current.get(part) {
                Some(v) => current = v,
                None => { found = false; break; }
            }
        }
        if found {
            let replacement = match current {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            result = result.replace(full_match, &replacement);
        }
    }
    result
}

async fn dispatch_invoke_agent(
    action_config: &serde_json::Value,
    ctx: &ActionContext,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config: InvokeAgentConfig = serde_json::from_value(action_config.clone())?;

    let perspective = config.agent_perspective.unwrap_or_else(|| "coder".to_string());
    let prompt = interpolate_template(&config.prompt, ctx.event_payload.as_ref());
    let system_prompt_append = config
        .system_prompt_append
        .as_deref()
        .map(|s| interpolate_template(s, ctx.event_payload.as_ref()));

    let seam_url = std::env::var("SEAM_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string());
    let api_token = std::env::var("WORKER_API_TOKEN").ok();

    let mut body = serde_json::json!({
        "agent_perspective": perspective,
        "prompt": prompt,
        "triggered_by": "reaction",
    });
    if let Some(spa) = &system_prompt_append {
        body["system_prompt_append"] = serde_json::Value::String(spa.clone());
    }
    if let Some(branch) = &config.branch {
        body["branch"] = serde_json::Value::String(branch.clone());
    }
    if let Some(task_id) = &config.task_id {
        let rendered = interpolate_template(task_id, ctx.event_payload.as_ref());
        body["task_id"] = serde_json::Value::String(rendered);
    }

    let client = Client::new();
    let mut req = client
        .post(format!("{}/api/projects/{}/invocations", seam_url, ctx.project_id))
        .json(&body);

    if let Some(token) = &api_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req.send().await?;

    if resp.status().is_success() {
        let result: serde_json::Value = resp.json().await?;
        info!(
            project_id = %ctx.project_id,
            perspective = %perspective,
            invocation_id = %result["id"],
            source = %ctx.source,
            "Created invocation via reaction"
        );
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        error!(
            status = %status,
            body = %body,
            source = %ctx.source,
            "Failed to create invocation"
        );
        return Err(format!("Invocation creation failed: {} {}", status, body).into());
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
    let arguments = match (&config.arguments, &ctx.event_payload) {
        (Some(args), Some(event)) => {
            let mut merged = args.clone();
            if let (Some(m), Some(e)) = (merged.as_object_mut(), event.as_object()) {
                m.insert("_event".to_string(), serde_json::Value::Object(e.clone()));
            }
            merged
        }
        (Some(args), None) => args.clone(),
        (None, Some(event)) => serde_json::json!({"_event": event}),
        (None, None) => serde_json::json!({}),
    };

    let seam_url = std::env::var("SEAM_URL")
        .unwrap_or_else(|_| "http://localhost:3002".to_string());
    let mcp_url = format!("{}/mcp", seam_url);
    let api_token = std::env::var("WORKER_API_TOKEN").ok();

    let client = Client::new();

    // Step 1: Initialize MCP session (JSON-RPC 2.0)
    let init_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {
                "name": "seam-worker",
                "version": "0.1.0"
            }
        }
    });

    let mut req = client.post(&mcp_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(&init_request);
    if let Some(token) = &api_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let init_resp = req.send().await?;
    if !init_resp.status().is_success() {
        let status = init_resp.status();
        let body = init_resp.text().await.unwrap_or_default();
        return Err(format!("MCP initialize failed: {} {}", status, body).into());
    }

    let session_id = init_resp
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Step 2: Send initialized notification
    let initialized_notification = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    });

    let mut req = client.post(&mcp_url)
        .header("Content-Type", "application/json")
        .json(&initialized_notification);
    if let Some(token) = &api_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    if let Some(sid) = &session_id {
        req = req.header("Mcp-Session-Id", sid);
    }
    // Notification — fire and forget
    let _ = req.send().await;

    // Step 3: Call the tool
    let tool_request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": config.tool_name,
            "arguments": arguments
        }
    });

    let mut req = client.post(&mcp_url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(&tool_request);
    if let Some(token) = &api_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    if let Some(sid) = &session_id {
        req = req.header("Mcp-Session-Id", sid);
    }

    let tool_resp = req.send().await?;
    let status = tool_resp.status();
    let body = tool_resp.text().await.unwrap_or_default();

    if status.is_success() {
        // Parse JSON-RPC response to check for tool-level errors
        if let Ok(rpc_resp) = serde_json::from_str::<serde_json::Value>(&body) {
            if let Some(err) = rpc_resp.get("error") {
                warn!(
                    tool_name = %config.tool_name,
                    error = %err,
                    source = %ctx.source,
                    "MCP tool returned JSON-RPC error"
                );
                return Err(format!("MCP tool error: {}", err).into());
            }
            // Check isError flag in the tool result
            if rpc_resp.pointer("/result/isError") == Some(&serde_json::Value::Bool(true)) {
                let content = rpc_resp.pointer("/result/content")
                    .map(|c| c.to_string())
                    .unwrap_or_default();
                warn!(
                    tool_name = %config.tool_name,
                    content = %content,
                    source = %ctx.source,
                    "MCP tool returned isError=true"
                );
                return Err(format!("MCP tool failed: {}", content).into());
            }
        }

        info!(
            tool_name = %config.tool_name,
            source = %ctx.source,
            project_id = %ctx.project_id,
            "MCP tool invocation succeeded"
        );
    } else {
        error!(
            tool_name = %config.tool_name,
            status = %status,
            body = %body,
            source = %ctx.source,
            "MCP tool HTTP request failed"
        );
        return Err(format!("MCP tool call failed: {} {}", status, body).into());
    }

    Ok(())
}

async fn dispatch_inference(
    pool: &PgPool,
    action_config: &serde_json::Value,
    ctx: &ActionContext,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let config: InferenceConfig = serde_json::from_value(action_config.clone())?;

    let prompt = interpolate_template(&config.prompt, ctx.event_payload.as_ref());
    let system_prompt = interpolate_template(&config.system_prompt, ctx.event_payload.as_ref());

    // Resolve provider (config > env var > default)
    let provider = config.provider.unwrap_or_else(|| {
        std::env::var("INFERENCE_DEFAULT_PROVIDER").unwrap_or_else(|_| "anthropic".to_string())
    });

    // Resolve model (config > env var > provider-specific default)
    let model = config.model.unwrap_or_else(|| {
        std::env::var("INFERENCE_DEFAULT_MODEL").unwrap_or_else(|_| {
            match provider.as_str() {
                "openrouter" => "qwen/qwen3.5-coder-32b-instruct".to_string(),
                "ollama" => "qwen3:8b".to_string(),
                _ => "claude-haiku-4-5-20251001".to_string(),
            }
        })
    });

    let max_tokens = config.max_tokens.unwrap_or(1024);

    info!(
        provider = %provider,
        model = %model,
        source = %ctx.source,
        "Dispatching inference action"
    );

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let response_text = match provider.as_str() {
        "anthropic" => {
            let api_key = match std::env::var("ANTHROPIC_API_KEY") {
                Ok(k) => k,
                Err(_) => {
                    warn!(source = %ctx.source, "ANTHROPIC_API_KEY not set; skipping inference action");
                    return Ok(());
                }
            };

            let body = serde_json::json!({
                "model": model,
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": prompt}]
            });

            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("Anthropic API error: {} {}", status, body).into());
            }

            let resp_json: serde_json::Value = resp.json().await?;
            resp_json
                .pointer("/content/0/text")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "Unexpected Anthropic response shape".to_string())?
        }

        "openrouter" => {
            let api_key = match std::env::var("OPENROUTER_API_KEY") {
                Ok(k) => k,
                Err(_) => {
                    warn!(source = %ctx.source, "OPENROUTER_API_KEY not set; skipping inference action");
                    return Ok(());
                }
            };

            let body = serde_json::json!({
                "model": model,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            });

            let resp = client
                .post("https://openrouter.ai/api/v1/chat/completions")
                .header("Authorization", format!("Bearer {}", api_key))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("OpenRouter API error: {} {}", status, body).into());
            }

            let resp_json: serde_json::Value = resp.json().await?;
            resp_json
                .pointer("/choices/0/message/content")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "Unexpected OpenRouter response shape".to_string())?
        }

        "ollama" => {
            let ollama_url = std::env::var("OLLAMA_URL")
                .unwrap_or_else(|_| "http://localhost:11434".to_string());

            let body = serde_json::json!({
                "model": model,
                "stream": false,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            });

            let resp = client
                .post(format!("{}/api/chat", ollama_url))
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("Ollama API error: {} {}", status, body).into());
            }

            let resp_json: serde_json::Value = resp.json().await?;
            resp_json
                .pointer("/message/content")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "Unexpected Ollama response shape".to_string())?
        }

        other => {
            warn!(provider = %other, source = %ctx.source, "Unknown inference provider; skipping");
            return Ok(());
        }
    };

    info!(
        provider = %provider,
        model = %model,
        source = %ctx.source,
        response_len = response_text.len(),
        "Inference action completed"
    );

    // Apply result target
    match &config.result_target {
        ResultTarget::UpdateField { table, column, parse_json } => {
            // Validate table and column names to prevent SQL injection
            // (these come from trusted operator config, but guard defensively)
            let table = sanitize_identifier(table)?;
            let column = sanitize_identifier(column)?;

            let aggregate_id = ctx.event_payload
                .as_ref()
                .and_then(|p| p.get("id"))
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<Uuid>().ok())
                .ok_or_else(|| "Could not determine aggregate id from event payload".to_string())?;

            if parse_json.unwrap_or(false) {
                let parsed: serde_json::Value = serde_json::from_str(&response_text)
                    .map_err(|e| format!("Failed to parse inference response as JSON: {}", e))?;
                let sql = format!(
                    "UPDATE {} SET {} = $1, updated_at = NOW() WHERE id = $2",
                    table, column
                );
                sqlx::query(&sql)
                    .bind(parsed)
                    .bind(aggregate_id)
                    .execute(pool)
                    .await?;
            } else {
                let sql = format!(
                    "UPDATE {} SET {} = $1, updated_at = NOW() WHERE id = $2",
                    table, column
                );
                sqlx::query(&sql)
                    .bind(&response_text)
                    .bind(aggregate_id)
                    .execute(pool)
                    .await?;
            }

            info!(
                table = %table,
                column = %column,
                aggregate_id = %aggregate_id,
                source = %ctx.source,
                "Inference result written to database"
            );
        }

        ResultTarget::LogOnly => {
            info!(
                source = %ctx.source,
                response = %response_text,
                "Inference result (log-only)"
            );
        }
    }

    Ok(())
}

/// Validate a SQL identifier (table or column name) to prevent injection.
/// Allows only alphanumeric characters and underscores.
fn sanitize_identifier(name: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    if name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') && !name.is_empty() {
        Ok(name.to_string())
    } else {
        Err(format!("Invalid SQL identifier: {:?}", name).into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpolate_simple() {
        let payload = serde_json::json!({"title": "Bug fix", "status": "open"});
        let result = interpolate_template("Task: {{title}} ({{status}})", Some(&payload));
        assert_eq!(result, "Task: Bug fix (open)");
    }

    #[test]
    fn test_interpolate_nested() {
        let payload = serde_json::json!({"task": {"title": "Nested"}});
        let result = interpolate_template("{{task.title}}", Some(&payload));
        assert_eq!(result, "Nested");
    }

    #[test]
    fn test_interpolate_missing_key_unchanged() {
        let payload = serde_json::json!({"title": "Hello"});
        let result = interpolate_template("{{title}} {{missing}}", Some(&payload));
        assert_eq!(result, "Hello {{missing}}");
    }

    #[test]
    fn test_interpolate_no_payload() {
        let result = interpolate_template("{{title}}", None);
        assert_eq!(result, "{{title}}");
    }

    #[test]
    fn test_interpolate_non_string_value() {
        let payload = serde_json::json!({"count": 42, "active": true});
        let result = interpolate_template("{{count}} {{active}}", Some(&payload));
        assert_eq!(result, "42 true");
    }

    #[test]
    fn test_interpolate_no_placeholders() {
        let payload = serde_json::json!({"title": "Hello"});
        let result = interpolate_template("No placeholders here", Some(&payload));
        assert_eq!(result, "No placeholders here");
    }
}
