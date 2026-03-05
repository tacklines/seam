use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ListActivityQuery {
    pub limit: Option<i64>,
    pub before: Option<String>,
    pub target_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct ActivityEventView {
    pub id: Uuid,
    pub actor_id: Uuid,
    pub actor_name: String,
    pub event_type: String,
    pub target_type: String,
    pub target_id: Uuid,
    pub summary: String,
    pub metadata: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_activity(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
    Query(query): Query<ListActivityQuery>,
) -> Result<Json<Vec<ActivityEventView>>, StatusCode> {
    let session = super::tasks::resolve_session_pub(&state.db, &session_code).await?;

    let limit = query.limit.unwrap_or(50).min(200);

    let mut sql = String::from(
        "SELECT ae.id, ae.actor_id, p.display_name, ae.event_type, ae.target_type, ae.target_id, ae.summary, ae.metadata, ae.created_at
         FROM activity_events ae
         JOIN participants p ON p.id = ae.actor_id
         WHERE ae.project_id = $1"
    );
    let mut param_idx = 2;

    if query.before.is_some() {
        sql.push_str(&format!(" AND ae.created_at < ${param_idx}"));
        param_idx += 1;
    }
    if query.target_id.is_some() {
        sql.push_str(&format!(" AND ae.target_id = ${param_idx}"));
        param_idx += 1;
    }
    sql.push_str(&format!(" ORDER BY ae.created_at DESC LIMIT ${param_idx}"));

    let mut q = sqlx::query_as::<_, (Uuid, Uuid, String, String, String, Uuid, String, serde_json::Value, chrono::DateTime<chrono::Utc>)>(&sql)
        .bind(session.project_id);

    if let Some(ref before) = query.before {
        let before_time: chrono::DateTime<chrono::Utc> = before
            .parse()
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        q = q.bind(before_time);
    }
    if let Some(target_id) = query.target_id {
        q = q.bind(target_id);
    }
    q = q.bind(limit);

    let events = q.fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch activity: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let views: Vec<ActivityEventView> = events
        .into_iter()
        .map(|(id, actor_id, actor_name, event_type, target_type, target_id, summary, metadata, created_at)| {
            ActivityEventView {
                id,
                actor_id,
                actor_name,
                event_type,
                target_type,
                target_id,
                summary,
                metadata,
                created_at,
            }
        })
        .collect();

    Ok(Json(views))
}

/// Record an activity event. Fire-and-forget — errors are logged, not propagated.
pub async fn record_activity(
    db: &sqlx::PgPool,
    project_id: Uuid,
    session_id: Option<Uuid>,
    actor_id: Uuid,
    event_type: &str,
    target_type: &str,
    target_id: Uuid,
    summary: &str,
    metadata: serde_json::Value,
) {
    if let Err(e) = sqlx::query(
        "INSERT INTO activity_events (project_id, session_id, actor_id, event_type, target_type, target_id, summary, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
    )
    .bind(project_id)
    .bind(session_id)
    .bind(actor_id)
    .bind(event_type)
    .bind(target_type)
    .bind(target_id)
    .bind(summary)
    .bind(metadata)
    .execute(db)
    .await
    {
        tracing::warn!("Failed to record activity event: {e}");
    }
}
