use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db;
use crate::events::{self, DomainEvent};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ListEventsQuery {
    pub aggregate_type: Option<String>,
    pub aggregate_id: Option<Uuid>,
    pub after: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct DomainEventView {
    pub id: i64,
    pub event_id: Uuid,
    pub event_type: String,
    pub aggregate_type: String,
    pub aggregate_id: Uuid,
    pub actor_id: Option<Uuid>,
    pub payload: serde_json::Value,
    pub metadata: serde_json::Value,
    pub occurred_at: chrono::DateTime<chrono::Utc>,
}

impl From<DomainEvent> for DomainEventView {
    fn from(e: DomainEvent) -> Self {
        Self {
            id: e.id.unwrap_or(0),
            event_id: e.event_id,
            event_type: e.event_type,
            aggregate_type: e.aggregate_type,
            aggregate_id: e.aggregate_id,
            actor_id: e.actor_id,
            payload: e.payload,
            metadata: e.metadata,
            occurred_at: e.occurred_at,
        }
    }
}

pub async fn list_events(
    State(state): State<Arc<AppState>>,
    Path(project_id): Path<Uuid>,
    Query(query): Query<ListEventsQuery>,
    AuthUser(claims): AuthUser,
) -> Result<Json<Vec<DomainEventView>>, StatusCode> {
    // Verify the user has access to this project
    let user = db::upsert_user(&state.db, &claims).await.map_err(|e| {
        tracing::error!("Failed to upsert user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let _membership = sqlx::query_scalar::<_, Uuid>(
        "SELECT project_id FROM project_members WHERE project_id = $1 AND user_id = $2",
    )
    .bind(project_id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check project membership: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    // If aggregate_type and aggregate_id are provided, use the focused query
    if let (Some(ref agg_type), Some(agg_id)) = (&query.aggregate_type, query.aggregate_id) {
        let events = events::events_for_aggregate(&state.db, agg_type, agg_id, query.after)
            .await
            .map_err(|e| {
                tracing::error!("Failed to fetch domain events: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        return Ok(Json(events.into_iter().map(Into::into).collect()));
    }

    // Otherwise, return recent events for the project aggregate
    let after = query.after.unwrap_or(0);
    let events = events::events_for_aggregate(&state.db, "project", project_id, Some(after))
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch domain events: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(events.into_iter().map(Into::into).collect()))
}
