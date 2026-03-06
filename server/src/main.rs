mod agent_token;
mod auth;
pub mod code_search;
mod coder;
mod credentials;
mod db;
mod embeddings;
mod events;
mod indexer;
pub mod knowledge;
mod mcp_auth;
mod mcp_handler;
#[allow(dead_code)]
mod models;
mod routes;
mod ws;

use axum::{Router, routing::{delete, get, patch, post}, extract::State, response::IntoResponse, Json};
use tower_http::cors::{CorsLayer, Any};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::sync::Arc;
use tower::Layer;
use rmcp::transport::streamable_http_server::{
    StreamableHttpService, StreamableHttpServerConfig,
    session::local::LocalSessionManager,
};

mod log_buffer;

pub struct AppState {
    pub db: sqlx::PgPool,
    pub jwks: auth::JwksCache,
    pub connections: ws::ConnectionManager,
    pub coder: Option<coder::CoderClient>,
    pub keycloak_issuer: String,
    pub log_buffer: log_buffer::LogBuffer,
    pub code_index: Option<std::sync::Arc<code_search::CodeIndex>>,
    /// Public base URL (from SEAM_URL env or derived from listen address).
    /// Used for RFC 9728 OAuth Protected Resource Metadata.
    pub resource_url: String,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "seam_server=debug,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://seam:seam@localhost:5433/seam".to_string());

    let db = sqlx::PgPool::connect(&database_url)
        .await
        .expect("Failed to connect to database");

    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("Failed to run migrations");

    // Start the background embedding worker (no-op if OLLAMA_URL is not set)
    embeddings::start_embedding_worker(db.clone());

    let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let resource_url = std::env::var("SEAM_URL")
        .unwrap_or_else(|_| format!("http://localhost:{port}"));

    let keycloak_url = std::env::var("KEYCLOAK_URL")
        .unwrap_or_else(|_| "http://localhost:8081".to_string());
    let realm = std::env::var("KEYCLOAK_REALM")
        .unwrap_or_else(|_| "seam".to_string());

    let coder = coder::CoderClient::from_env();
    if coder.is_some() {
        tracing::info!("Coder integration enabled");
    } else {
        tracing::info!("Coder integration disabled (CODER_URL not set)");
    }

    let keycloak_issuer = format!("{}/realms/{}", keycloak_url, realm);

    // Initialize code search index
    let code_index: Option<std::sync::Arc<code_search::CodeIndex>> = {
        let index_path = std::env::var("DATA_DIR")
            .unwrap_or_else(|_| "/tmp/seam-code-index".to_string());
        match code_search::CodeIndex::new(std::path::Path::new(&index_path)) {
            Ok(idx) => {
                tracing::info!(path = %index_path, "Code search index initialized");
                Some(std::sync::Arc::new(idx))
            }
            Err(e) => {
                tracing::warn!("Code search index initialization failed, code search disabled: {e}");
                None
            }
        }
    };

    let state = Arc::new(AppState {
        db,
        jwks: auth::JwksCache::new(&keycloak_url, &realm),
        connections: ws::ConnectionManager::new(),
        log_buffer: log_buffer::LogBuffer::new(500),
        coder,
        keycloak_issuer: keycloak_issuer.clone(),
        code_index: code_index.clone(),
        resource_url: resource_url.clone(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Start the knowledge indexing consumer (background task)
    let _indexer_handle = indexer::start_indexer(state.db.clone()).await;

    // Spawn PG LISTEN task for real-time notifications from DB triggers
    {
        let state = Arc::clone(&state);
        let database_url = database_url.clone();
        tokio::spawn(async move {
            if let Err(e) = run_pg_listener(&database_url, &state).await {
                tracing::error!("PG listener failed: {e}");
            }
        });
    }

    let app = Router::new()
        // Health
        .route("/health", get(|| async { "ok" }))
        // Organizations
        .route("/api/orgs", get(routes::orgs::list_orgs).post(routes::orgs::create_org))
        .route("/api/orgs/{slug}", get(routes::orgs::get_org).patch(routes::orgs::update_org))
        .route("/api/orgs/{slug}/members", get(routes::orgs::list_members).post(routes::orgs::invite_member))
        .route("/api/orgs/{slug}/members/{user_id}", patch(routes::orgs::update_member).delete(routes::orgs::remove_member))
        .route("/api/orgs/{slug}/projects", get(routes::orgs::list_org_projects).post(routes::orgs::create_org_project))
        // Org Credentials
        .route("/api/orgs/{slug}/credentials", get(routes::credentials::list_credentials).post(routes::credentials::create_credential))
        .route("/api/orgs/{slug}/credentials/{credential_id}", patch(routes::credentials::rotate_credential).delete(routes::credentials::delete_credential))
        // User Credentials
        .route("/api/me/credentials", get(routes::user_credentials::list_user_credentials).post(routes::user_credentials::create_user_credential))
        .route("/api/me/credentials/{credential_id}", patch(routes::user_credentials::rotate_user_credential).delete(routes::user_credentials::delete_user_credential))
        // Projects
        .route("/api/projects", get(routes::projects::list_projects))
        .route("/api/projects", post(routes::projects::create_project))
        .route("/api/projects/{project_id}", get(routes::projects::get_project))
        .route("/api/projects/{project_id}", patch(routes::projects::update_project))
        .route("/api/projects/{project_id}/sessions", get(routes::projects::list_project_sessions))
        .route("/api/projects/{project_id}/tasks", get(routes::tasks::list_project_tasks))
        .route("/api/projects/{project_id}/tasks/{task_id}", get(routes::tasks::get_project_task))
        .route("/api/projects/{project_id}/graph", get(routes::tasks::get_project_dependency_graph))
        // Plans
        .route("/api/projects/{project_id}/plans", get(routes::plans::list_plans).post(routes::plans::create_plan))
        .route("/api/projects/{project_id}/plans/{plan_id}", get(routes::plans::get_plan).patch(routes::plans::update_plan))
        // Requests
        .route("/api/projects/{project_id}/requests", get(routes::requests::list_requests).post(routes::requests::create_request))
        .route("/api/projects/{project_id}/requests/{request_id}", get(routes::requests::get_request).patch(routes::requests::update_request).delete(routes::requests::delete_request))
        .route("/api/projects/{project_id}/requests/{request_id}/requirements", post(routes::requests::link_requirement))
        .route("/api/projects/{project_id}/requests/{request_id}/requirements/{requirement_id}", delete(routes::requests::unlink_requirement))
        // Requirements
        .route("/api/projects/{project_id}/requirements", get(routes::requirements::list_requirements).post(routes::requirements::create_requirement))
        .route("/api/projects/{project_id}/requirements/{req_id}", get(routes::requirements::get_requirement).patch(routes::requirements::update_requirement).delete(routes::requirements::delete_requirement))
        .route("/api/projects/{project_id}/requirements/{req_id}/tasks", post(routes::requirements::link_task))
        .route("/api/projects/{project_id}/requirements/{req_id}/tasks/{task_id}", delete(routes::requirements::unlink_task))
        // Sessions
        .route("/api/sessions", post(routes::sessions::create_session))
        .route("/api/sessions/{code}", get(routes::sessions::get_session))
        .route("/api/sessions/{code}/join", post(routes::sessions::join_session))
        // Tasks
        .route("/api/sessions/{code}/tasks", post(routes::tasks::create_task))
        .route("/api/sessions/{code}/tasks", get(routes::tasks::list_tasks))
        .route("/api/sessions/{code}/tasks/{task_id}", get(routes::tasks::get_task))
        .route("/api/sessions/{code}/tasks/{task_id}", patch(routes::tasks::update_task))
        .route("/api/sessions/{code}/tasks/{task_id}", delete(routes::tasks::delete_task))
        .route("/api/sessions/{code}/tasks/{task_id}/comments", post(routes::tasks::add_comment))
        .route("/api/sessions/{code}/tasks/{task_id}/dependencies", post(routes::tasks::add_dependency))
        .route("/api/sessions/{code}/tasks/{task_id}/dependencies/{blocked_id}", delete(routes::tasks::remove_dependency))
        .route("/api/sessions/{code}/tasks/add", post(routes::tasks::add_tasks_to_session))
        .route("/api/sessions/{code}/tasks/{task_id}/membership", delete(routes::tasks::remove_task_from_session))
        .route("/api/sessions/{code}/mentions/unread", get(routes::tasks::list_unread_mentions))
        .route("/api/sessions/{code}/mentions/unread", delete(routes::tasks::clear_unread_mentions))
        // Notes
        .route("/api/sessions/{code}/notes", get(routes::notes::list_notes))
        .route("/api/sessions/{code}/notes/{slug}", get(routes::notes::get_note))
        .route("/api/sessions/{code}/notes/{slug}", axum::routing::put(routes::notes::upsert_note))
        // Questions
        .route("/api/sessions/{code}/questions", get(routes::questions::list_questions))
        .route("/api/sessions/{code}/questions/{question_id}", get(routes::questions::get_question))
        .route("/api/sessions/{code}/questions/{question_id}/answer", post(routes::questions::answer_question))
        .route("/api/sessions/{code}/questions/{question_id}/cancel", post(routes::questions::cancel_question))
        // Activity
        .route("/api/sessions/{code}/activity", get(routes::activity::list_activity))
        // Tool Invocations
        .route("/api/sessions/{code}/tool-invocations", get(routes::tool_invocations::list_tool_invocations))
        // Messages
        .route("/api/sessions/{code}/participants/{participant_id}/messages", get(routes::messages::list_messages).post(routes::messages::send_message))
        // Workspaces (Coder integration)
        .route("/api/projects/{project_id}/workspaces", get(routes::workspaces::list_workspaces).post(routes::workspaces::create_workspace))
        .route("/api/projects/{project_id}/workspaces/{workspace_id}", get(routes::workspaces::get_workspace).delete(routes::workspaces::destroy_workspace))
        .route("/api/projects/{project_id}/workspaces/{workspace_id}/stop", post(routes::workspaces::stop_workspace))
        .route("/api/projects/{project_id}/workspaces/{workspace_id}/events", get(routes::workspaces::workspace_events))
        // Workspace Logs (agent process output)
        .route("/api/workspaces/{workspace_id}/logs", post(routes::workspace_logs::ingest_logs).get(routes::workspace_logs::get_logs))
        // Invocations (ephemeral claude -p calls)
        .route("/api/projects/{project_id}/invocations", get(routes::invocations::list_invocations).post(routes::invocations::create_invocation))
        .route("/api/invocations/{invocation_id}", get(routes::invocations::get_invocation))
        // Integrations
        .route("/api/integrations/coder/status", get(routes::integrations::coder_status))
        // Domain Events
        .route("/api/projects/{project_id}/events", get(routes::events::list_events))
        // Agent API
        .route("/api/agent/join", post(routes::agent::agent_join))
        .route("/api/sessions/{code}/agents", post(routes::agents::launch_agent))
        // Project agents
        .route("/api/projects/{project_id}/agents", get(routes::agents::list_project_agents))
        .route("/api/projects/{project_id}/agents/{agent_id}", get(routes::agents::get_project_agent))
        // Code Search
        .route("/api/projects/{project_id}/code-index", post(routes::code_index::index_file).delete(routes::code_index::clear_project_index))
        // Automations
        .route("/api/projects/{project_id}/reactions", get(routes::automations::list_reactions).post(routes::automations::create_reaction))
        .route("/api/projects/{project_id}/reactions/{reaction_id}", patch(routes::automations::update_reaction).delete(routes::automations::delete_reaction))
        .route("/api/projects/{project_id}/scheduled-jobs", get(routes::automations::list_scheduled_jobs).post(routes::automations::create_scheduled_job))
        .route("/api/projects/{project_id}/scheduled-jobs/{job_id}", patch(routes::automations::update_scheduled_job).delete(routes::automations::delete_scheduled_job))
        // WebSocket
        .route("/ws", get(ws::handler::ws_upgrade))
        // OAuth discovery for MCP clients
        .route("/.well-known/oauth-protected-resource", get(well_known_protected_resource))
        .route("/.well-known/oauth-authorization-server", get(well_known_authorization_server))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state.clone());

    // Mount MCP Streamable HTTP endpoint with JWT auth middleware
    let mcp_auth_enabled = std::env::var("MCP_AUTH_DISABLED")
        .map(|v| v != "true" && v != "1")
        .unwrap_or(true);
    if !mcp_auth_enabled {
        tracing::warn!("MCP authentication is DISABLED (MCP_AUTH_DISABLED=true)");
    }

    let mcp_db = state.db.clone();
    let mcp_code_index = code_index.clone();
    let mcp_service = StreamableHttpService::new(
        move || Ok(mcp_handler::SeamMcp::with_code_index(mcp_db.clone(), mcp_code_index.clone())),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default(),
    );
    let auth_layer = mcp_auth::McpAuthLayer::new(state.jwks.clone(), state.db.clone(), mcp_auth_enabled, resource_url.clone());
    let authed_mcp = auth_layer.layer(mcp_service);
    let app = app.nest_service("/mcp", authed_mcp);
    tracing::info!(auth_enabled = mcp_auth_enabled, "MCP Streamable HTTP endpoint available at /mcp");

    let addr = format!("0.0.0.0:{port}");
    tracing::info!("Seam server listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// RFC 9728: OAuth Protected Resource Metadata
/// Tells MCP clients where to authenticate and what scopes are needed.
async fn well_known_protected_resource(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let resource = format!("{}/mcp", state.resource_url.trim_end_matches('/'));
    Json(serde_json::json!({
        "resource": resource,
        "authorization_servers": [&state.keycloak_issuer],
        "scopes_supported": ["openid", "profile"],
        "bearer_methods_supported": ["header"],
    }))
}

/// Proxy to Keycloak's OpenID Connect discovery document.
/// MCP clients use this to find token, authorization, and device auth endpoints.
async fn well_known_authorization_server(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let url = format!(
        "{}/.well-known/openid-configuration",
        state.keycloak_issuer
    );
    match reqwest::get(&url).await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(body) => (axum::http::StatusCode::OK, Json(body)).into_response(),
            Err(_) => (
                axum::http::StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "Failed to parse Keycloak response"})),
            ).into_response(),
        },
        Err(_) => (
            axum::http::StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": "Keycloak unavailable"})),
        ).into_response(),
    }
}

async fn run_pg_listener(database_url: &str, state: &Arc<AppState>) -> Result<(), sqlx::Error> {
    let mut listener = sqlx::postgres::PgListener::connect(database_url).await?;
    listener.listen("task_changes").await?;
    listener.listen("domain_events").await?;
    listener.listen("tool_invocations").await?;
    listener.listen("agent_state").await?;
    tracing::info!("PG LISTEN on 'task_changes', 'domain_events', 'tool_invocations', and 'agent_state' channels active");

    loop {
        let notification = listener.recv().await?;
        let channel = notification.channel();
        let payload = notification.payload();

        match channel {
            "tool_invocations" => {
                match serde_json::from_str::<serde_json::Value>(payload) {
                    Ok(msg) => {
                        let session_code = msg["session_code"].as_str().unwrap_or("");
                        let participant_id = msg["participant_id"].as_str().unwrap_or("");

                        if !session_code.is_empty() && !participant_id.is_empty() {
                            state.connections.broadcast_agent_stream(
                                session_code,
                                participant_id,
                                &serde_json::json!({
                                    "type": "agent_stream",
                                    "stream": "tool",
                                    "participant_id": participant_id,
                                    "data": {
                                        "id": msg["id"],
                                        "tool_name": msg["tool_name"],
                                        "is_error": msg["is_error"],
                                        "duration_ms": msg["duration_ms"],
                                        "created_at": msg["created_at"],
                                    }
                                }),
                            ).await;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Bad tool_invocations NOTIFY payload: {e}");
                    }
                }
            }
            "agent_state" => {
                match serde_json::from_str::<serde_json::Value>(payload) {
                    Ok(msg) => {
                        let session_code = msg["session_code"].as_str().unwrap_or("");
                        let participant_id = msg["participant_id"].as_str().unwrap_or("");

                        if !session_code.is_empty() && !participant_id.is_empty() {
                            let agent_state = msg["state"].as_str().unwrap_or("");

                            // Track MCP agent presence
                            if agent_state == "joined" {
                                state.connections.set_mcp_agent_online(session_code, participant_id);
                                state.connections.broadcast_to_session(session_code, &serde_json::json!({
                                    "type": "participant_connected",
                                    "participantId": participant_id,
                                })).await;
                            } else if agent_state == "disconnected" {
                                state.connections.set_mcp_agent_offline(session_code, participant_id);
                                state.connections.broadcast_to_session(session_code, &serde_json::json!({
                                    "type": "participant_disconnected",
                                    "participantId": participant_id,
                                })).await;
                            }

                            state.connections.broadcast_agent_stream(
                                session_code,
                                participant_id,
                                &serde_json::json!({
                                    "type": "agent_stream",
                                    "stream": "state",
                                    "participant_id": participant_id,
                                    "data": {
                                        "from": "",
                                        "to": msg["state"],
                                        "detail": msg["detail"],
                                        "ts": chrono::Utc::now().to_rfc3339(),
                                    }
                                }),
                            ).await;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Bad agent_state NOTIFY payload: {e}");
                    }
                }
            }
            "domain_events" => {
                match serde_json::from_str::<serde_json::Value>(payload) {
                    Ok(msg) => {
                        tracing::debug!(
                            event_type = msg["event_type"].as_str().unwrap_or("unknown"),
                            aggregate_type = msg["aggregate_type"].as_str().unwrap_or("unknown"),
                            aggregate_id = msg["aggregate_id"].as_str().unwrap_or("unknown"),
                            "Domain event received"
                        );
                    }
                    Err(e) => {
                        tracing::warn!("Bad domain_events NOTIFY payload: {e}");
                    }
                }
            }
            _ => {
                // task_changes and any other channels
                match serde_json::from_str::<serde_json::Value>(payload) {
                    Ok(msg) => {
                        let event_type = msg["type"].as_str().unwrap_or("unknown");
                        let session_code = msg["session_code"].as_str().unwrap_or("");

                        if !session_code.is_empty() {
                            state.connections.broadcast_to_session(session_code, &serde_json::json!({
                                "type": event_type,
                            })).await;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Bad NOTIFY payload: {e}");
                    }
                }
            }
        }
    }
}
