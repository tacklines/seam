use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rand::Rng;
use std::sync::Arc;
use uuid::Uuid;

use crate::models::*;
use crate::AppState;

fn generate_code(len: usize) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::rng();
    (0..len)
        .map(|_| {
            let idx = rng.random_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

pub async fn create_session(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<CreateSessionResponse>, StatusCode> {
    let session_id = Uuid::new_v4();
    let session_code = generate_code(6);
    let creator_id = Uuid::new_v4(); // TODO: extract from auth token

    // Create session
    sqlx::query(
        "INSERT INTO sessions (id, project_id, code, name, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())"
    )
    .bind(session_id)
    .bind(req.project_id)
    .bind(&session_code)
    .bind(&req.name)
    .bind(creator_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Create human join code (same as session code for now)
    let join_code_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO session_join_codes (id, session_id, code, created_at)
         VALUES ($1, $2, $3, NOW())"
    )
    .bind(join_code_id)
    .bind(session_id)
    .bind(&session_code)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Add creator as participant
    let participant_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(participant_id)
    .bind(session_id)
    .bind(creator_id)
    .bind("Host") // TODO: use actual username from auth
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Create agent join code for the creator
    let agent_code = generate_code(8);
    let agent_code_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO agent_join_codes (id, session_id, user_id, code, created_at)
         VALUES ($1, $2, $3, $4, NOW())"
    )
    .bind(agent_code_id)
    .bind(session_id)
    .bind(creator_id)
    .bind(&agent_code)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(CreateSessionResponse {
        session: SessionView {
            id: session_id,
            code: session_code.clone(),
            name: req.name,
            created_at: chrono::Utc::now(),
            participants: vec![ParticipantView {
                id: participant_id,
                display_name: "Host".to_string(),
                participant_type: ParticipantType::Human,
                sponsor_id: None,
                joined_at: chrono::Utc::now(),
            }],
        },
        join_code: session_code,
        agent_code,
    }))
}

pub async fn get_session(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
) -> Result<Json<SessionView>, StatusCode> {
    let session: Session = sqlx::query_as(
        "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL"
    )
    .bind(&code)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let participants: Vec<Participant> = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at"
    )
    .bind(session.id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SessionView {
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
    }))
}

pub async fn join_session(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    Json(req): Json<JoinSessionRequest>,
) -> Result<Json<JoinSessionResponse>, StatusCode> {
    let session: Session = sqlx::query_as(
        "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL"
    )
    .bind(&code)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let user_id = Uuid::new_v4(); // TODO: extract from auth token
    let participant_id = Uuid::new_v4();
    let display_name = req.display_name.unwrap_or_else(|| "Participant".to_string());

    sqlx::query(
        "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
         VALUES ($1, $2, $3, $4, 'human', NOW())"
    )
    .bind(participant_id)
    .bind(session.id)
    .bind(user_id)
    .bind(&display_name)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Create agent join code for this user
    let agent_code = generate_code(8);
    let agent_code_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO agent_join_codes (id, session_id, user_id, code, created_at)
         VALUES ($1, $2, $3, $4, NOW())"
    )
    .bind(agent_code_id)
    .bind(session.id)
    .bind(user_id)
    .bind(&agent_code)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Broadcast participant joined
    state.connections.broadcast_to_session(
        &session.code,
        &serde_json::json!({
            "type": "participant_joined",
            "participant": {
                "id": participant_id,
                "display_name": display_name,
                "participant_type": "human",
                "joined_at": chrono::Utc::now(),
            }
        }),
    ).await;

    // Fetch all participants for the response
    let participants: Vec<Participant> = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at"
    )
    .bind(session.id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(JoinSessionResponse {
        session: SessionView {
            id: session.id,
            code: session.code.clone(),
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
        agent_code,
    }))
}
