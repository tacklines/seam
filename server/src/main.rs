mod auth;
mod coder;
mod db;
mod events;
#[allow(dead_code)]
mod models;
mod routes;
mod ws;

use axum::{Router, routing::{delete, get, patch, post}};
use tower_http::cors::{CorsLayer, Any};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::sync::Arc;

pub struct AppState {
    pub db: sqlx::PgPool,
    pub jwks: auth::JwksCache,
    pub connections: ws::ConnectionManager,
    pub coder: Option<coder::CoderClient>,
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

    let state = Arc::new(AppState {
        db,
        jwks: auth::JwksCache::new(&keycloak_url, &realm),
        connections: ws::ConnectionManager::new(),
        coder,
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
        // Plans
        .route("/api/projects/{project_id}/plans", get(routes::plans::list_plans).post(routes::plans::create_plan))
        .route("/api/projects/{project_id}/plans/{plan_id}", get(routes::plans::get_plan).patch(routes::plans::update_plan))
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
        // WebSocket
        .route("/ws", get(ws::handler::ws_upgrade))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Seam server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn run_pg_listener(database_url: &str, state: &Arc<AppState>) -> Result<(), sqlx::Error> {
    let mut listener = sqlx::postgres::PgListener::connect(database_url).await?;
    listener.listen("task_changes").await?;
    listener.listen("domain_events").await?;
    tracing::info!("PG LISTEN on 'task_changes' and 'domain_events' channels active");

    loop {
        let notification = listener.recv().await?;
        let channel = notification.channel();
        let payload = notification.payload();

        match channel {
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
