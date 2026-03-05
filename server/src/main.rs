mod agent_token;
mod auth;
mod coder;
mod db;
mod events;
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

pub struct AppState {
    pub db: sqlx::PgPool,
    pub jwks: auth::JwksCache,
    pub connections: ws::ConnectionManager,
    pub coder: Option<coder::CoderClient>,
    pub keycloak_issuer: String,
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

    let state = Arc::new(AppState {
        db,
        jwks: auth::JwksCache::new(&keycloak_url, &realm),
        connections: ws::ConnectionManager::new(),
        coder,
        keycloak_issuer: keycloak_issuer.clone(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

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
    let mcp_service = StreamableHttpService::new(
        move || Ok(mcp_handler::SeamMcp::new(mcp_db.clone())),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default(),
    );
    let auth_layer = mcp_auth::McpAuthLayer::new(state.jwks.clone(), state.db.clone(), mcp_auth_enabled);
    let authed_mcp = auth_layer.layer(mcp_service);
    let app = app.nest_service("/mcp", authed_mcp);
    tracing::info!(auth_enabled = mcp_auth_enabled, "MCP Streamable HTTP endpoint available at /mcp");

    let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Seam server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// RFC 9728: OAuth Protected Resource Metadata
/// Tells MCP clients where to authenticate and what scopes are needed.
async fn well_known_protected_resource(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    Json(serde_json::json!({
        "resource": "/mcp",
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
    tracing::info!("PG LISTEN on 'task_changes', 'domain_events', and 'tool_invocations' channels active");

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
