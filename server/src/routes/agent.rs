use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::*;
use crate::AppState;

/// Agent joins a session using an agent join code.
/// The code itself is the auth — no JWT required.
pub async fn agent_join(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AgentJoinRequest>,
) -> Result<Json<AgentJoinResponse>, StatusCode> {
    // Look up the agent code
    let agent_code: AgentJoinCode = sqlx::query_as(
        "SELECT * FROM agent_join_codes WHERE code = $1"
    )
    .bind(&req.code)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to look up agent code: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Verify session is still open
    let session: Session = sqlx::query_as(
        "SELECT * FROM sessions WHERE id = $1 AND closed_at IS NULL"
    )
    .bind(agent_code.session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::GONE)?;

    // Find the sponsor's participant record (the human who owns this agent code)
    let sponsor: Participant = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2 AND participant_type = 'human'"
    )
    .bind(session.id)
    .bind(agent_code.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    // Get sponsor's user record for display name
    let sponsor_user: User = sqlx::query_as(
        "SELECT * FROM users WHERE id = $1"
    )
    .bind(agent_code.user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Check if this agent code already has a participant (idempotent)
    let existing_agent: Option<Participant> = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 AND sponsor_id = $2 AND participant_type = 'agent'"
    )
    .bind(session.id)
    .bind(sponsor.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let participant_id = if let Some(existing) = existing_agent {
        existing.id
    } else {
        let display_name = req.display_name
            .unwrap_or_else(|| format!("{}'s Agent", sponsor_user.display_name));
        let participant_id = Uuid::new_v4();

        sqlx::query(
            "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at)
             VALUES ($1, $2, $3, $4, 'agent', $5, NOW())"
        )
        .bind(participant_id)
        .bind(session.id)
        .bind(agent_code.user_id)
        .bind(&display_name)
        .bind(sponsor.id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to create agent participant: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

        // Broadcast participant joined
        state.connections.broadcast_to_session(
            &session.code,
            &serde_json::json!({
                "type": "participant_joined",
                "participant": {
                    "id": participant_id,
                    "display_name": display_name,
                    "participant_type": "agent",
                    "sponsor_id": sponsor.id,
                    "joined_at": chrono::Utc::now(),
                }
            }),
        ).await;

        participant_id
    };

    // Fetch all participants for the response
    let participants: Vec<Participant> = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at"
    )
    .bind(session.id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(AgentJoinResponse {
        session: SessionView {
            id: session.id,
            code: session.code,
            name: session.name,
            created_at: session.created_at,
            participants: participants.into_iter().map(|p| ParticipantView {
                id: p.id,
                display_name: p.display_name,
                participant_type: p.participant_type,
                sponsor_id: p.sponsor_id,
                joined_at: p.joined_at,
            }).collect(),
        },
        participant_id,
        sponsor_name: sponsor_user.display_name,
    }))
}
