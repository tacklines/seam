use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rand::Rng;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::db;
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
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateSessionRequest>,
) -> Result<Json<CreateSessionResponse>, StatusCode> {
    // Upsert user from JWT claims
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Resolve project_id: use provided or auto-bootstrap default
    let project_id = match req.project_id {
        Some(pid) => pid,
        None => db::ensure_default_project(&state.db, user.id).await
            .map_err(|e| {
                tracing::error!("Failed to ensure default project: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?,
    };

    let session_id = Uuid::new_v4();
    let session_code = generate_code(6);

    // Create session
    sqlx::query(
        "INSERT INTO sessions (id, project_id, code, name, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())"
    )
    .bind(session_id)
    .bind(project_id)
    .bind(&session_code)
    .bind(&req.name)
    .bind(user.id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create session: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Create human join code
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
    .bind(user.id)
    .bind(&user.display_name)
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
    .bind(user.id)
    .bind(&agent_code)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Fetch project name for the response
    let project: crate::models::Project = sqlx::query_as(
        "SELECT * FROM projects WHERE id = $1"
    )
    .bind(project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(CreateSessionResponse {
        session: SessionView {
            id: session_id,
            code: session_code.clone(),
            name: req.name,
            project_id,
            project_name: project.name,
            created_at: chrono::Utc::now(),
            participants: vec![ParticipantView {
                id: participant_id,
                display_name: user.display_name,
                participant_type: ParticipantType::Human,
                sponsor_id: None,
                joined_at: chrono::Utc::now(),
                is_online: false, // not connected via WS yet
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

    let online_ids = state.connections.online_participant_ids(&code);

    let project: crate::models::Project = sqlx::query_as(
        "SELECT * FROM projects WHERE id = $1"
    )
    .bind(session.project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SessionView {
        id: session.id,
        code: session.code,
        name: session.name,
        project_id: session.project_id,
        project_name: project.name,
        created_at: session.created_at,
        participants: participants.into_iter().map(|p| {
            let is_online = online_ids.contains(&p.id.to_string());
            ParticipantView {
                id: p.id,
                display_name: p.display_name,
                participant_type: p.participant_type,
                sponsor_id: p.sponsor_id,
                joined_at: p.joined_at,
                is_online,
            }
        }).collect(),
    }))
}

pub async fn join_session(
    State(state): State<Arc<AppState>>,
    Path(code): Path<String>,
    AuthUser(claims): AuthUser,
    Json(req): Json<JoinSessionRequest>,
) -> Result<Json<JoinSessionResponse>, StatusCode> {
    // Upsert user from JWT claims
    let user = db::upsert_user(&state.db, &claims).await
        .map_err(|e| {
            tracing::error!("Failed to upsert user: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let session: Session = sqlx::query_as(
        "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL"
    )
    .bind(&code)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    // Check if user is already a participant
    let existing: Option<Participant> = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2"
    )
    .bind(session.id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (participant_id, agent_code) = if let Some(existing) = existing {
        // Already in the session — fetch their agent code
        let ac: (String,) = sqlx::query_as(
            "SELECT code FROM agent_join_codes WHERE session_id = $1 AND user_id = $2"
        )
        .bind(session.id)
        .bind(user.id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        (existing.id, ac.0)
    } else {
        let display_name = req.display_name
            .unwrap_or_else(|| user.display_name.clone());
        let participant_id = Uuid::new_v4();

        sqlx::query(
            "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, joined_at)
             VALUES ($1, $2, $3, $4, 'human', NOW())"
        )
        .bind(participant_id)
        .bind(session.id)
        .bind(user.id)
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
        .bind(user.id)
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

        (participant_id, agent_code)
    };

    // Fetch all participants for the response
    let participants: Vec<Participant> = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at"
    )
    .bind(session.id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let project: crate::models::Project = sqlx::query_as(
        "SELECT * FROM projects WHERE id = $1"
    )
    .bind(session.project_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(JoinSessionResponse {
        session: SessionView {
            id: session.id,
            code: session.code.clone(),
            name: session.name,
            project_id: session.project_id,
            project_name: project.name,
            created_at: session.created_at,
            participants: {
                let online_ids = state.connections.online_participant_ids(&session.code);
                participants.into_iter().map(|p| {
                    let is_online = online_ids.contains(&p.id.to_string());
                    ParticipantView {
                        id: p.id,
                        display_name: p.display_name,
                        participant_type: p.participant_type,
                        sponsor_id: p.sponsor_id,
                        joined_at: p.joined_at,
                        is_online,
                    }
                }).collect()
            },
        },
        participant_id,
        agent_code,
    }))
}
