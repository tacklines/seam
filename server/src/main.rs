mod auth;
mod db;
mod models;
mod routes;
mod ws;

use axum::{Router, routing::{get, post}};
use tower_http::cors::{CorsLayer, Any};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::sync::Arc;

pub struct AppState {
    pub db: sqlx::PgPool,
    pub jwks: auth::JwksCache,
    pub connections: ws::ConnectionManager,
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

    let state = Arc::new(AppState {
        db,
        jwks: auth::JwksCache::new(&keycloak_url, &realm),
        connections: ws::ConnectionManager::new(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Health
        .route("/health", get(|| async { "ok" }))
        // Sessions
        .route("/api/sessions", post(routes::sessions::create_session))
        .route("/api/sessions/{code}", get(routes::sessions::get_session))
        .route("/api/sessions/{code}/join", post(routes::sessions::join_session))
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
