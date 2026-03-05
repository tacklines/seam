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
pub struct ListToolInvocationsQuery {
    pub participant_id: Option<Uuid>,
    pub tool_name: Option<String>,
    pub limit: Option<i64>,
    pub before: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ToolInvocationView {
    pub id: Uuid,
    pub participant_id: Uuid,
    pub participant_name: String,
    pub tool_name: String,
    pub request_params: Option<serde_json::Value>,
    pub response: Option<serde_json::Value>,
    pub is_error: bool,
    pub duration_ms: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_tool_invocations(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
    Query(query): Query<ListToolInvocationsQuery>,
) -> Result<Json<Vec<ToolInvocationView>>, StatusCode> {
    let session = super::tasks::resolve_session_pub(&state.db, &session_code).await?;

    let limit = query.limit.unwrap_or(50).min(200);

    let mut sql = String::from(
        "SELECT ti.id, ti.participant_id, p.display_name, ti.tool_name, ti.request_params, ti.response, ti.is_error, ti.duration_ms, ti.created_at
         FROM tool_invocations ti
         JOIN participants p ON p.id = ti.participant_id
         WHERE ti.session_id = $1"
    );
    let mut param_idx = 2;

    if query.participant_id.is_some() {
        sql.push_str(&format!(" AND ti.participant_id = ${param_idx}"));
        param_idx += 1;
    }
    if query.tool_name.is_some() {
        sql.push_str(&format!(" AND ti.tool_name = ${param_idx}"));
        param_idx += 1;
    }
    if query.before.is_some() {
        sql.push_str(&format!(" AND ti.created_at < ${param_idx}"));
        param_idx += 1;
    }
    sql.push_str(&format!(" ORDER BY ti.created_at DESC LIMIT ${param_idx}"));

    let mut q = sqlx::query_as::<_, (Uuid, Uuid, String, String, Option<serde_json::Value>, Option<serde_json::Value>, bool, i32, chrono::DateTime<chrono::Utc>)>(&sql)
        .bind(session.id);

    if let Some(participant_id) = query.participant_id {
        q = q.bind(participant_id);
    }
    if let Some(ref tool_name) = query.tool_name {
        q = q.bind(tool_name);
    }
    if let Some(ref before) = query.before {
        let before_time: chrono::DateTime<chrono::Utc> = before
            .parse()
            .map_err(|_| StatusCode::BAD_REQUEST)?;
        q = q.bind(before_time);
    }
    q = q.bind(limit);

    let rows = q.fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch tool invocations: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let views: Vec<ToolInvocationView> = rows
        .into_iter()
        .map(|(id, participant_id, participant_name, tool_name, request_params, response, is_error, duration_ms, created_at)| {
            ToolInvocationView {
                id,
                participant_id,
                participant_name,
                tool_name,
                request_params,
                response,
                is_error,
                duration_ms,
                created_at,
            }
        })
        .collect();

    Ok(Json(views))
}
