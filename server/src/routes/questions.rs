use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::models::*;
use crate::routes::tasks::resolve_session_pub;
use crate::AppState;

// --- DTOs ---

#[derive(Debug, Deserialize)]
pub struct ListQuestionsQuery {
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnswerQuestionRequest {
    pub answer_text: String,
}

#[derive(Debug, Serialize)]
pub struct QuestionView {
    pub id: Uuid,
    pub question_text: String,
    pub status: QuestionStatus,
    pub asked_by: Uuid,
    pub asked_by_name: String,
    pub directed_to: Option<Uuid>,
    pub context: Option<serde_json::Value>,
    pub answer_text: Option<String>,
    pub answered_by: Option<Uuid>,
    pub answered_by_name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub answered_at: Option<chrono::DateTime<chrono::Utc>>,
}

// --- Helpers ---

async fn resolve_participant_for_user(
    db: &sqlx::PgPool,
    session_id: Uuid,
    user_id: Uuid,
) -> Result<Participant, StatusCode> {
    sqlx::query_as::<_, Participant>(
        "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2 AND participant_type = 'human'"
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::FORBIDDEN)
}

// --- Handlers ---

pub async fn list_questions(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
    Query(query): Query<ListQuestionsQuery>,
) -> Result<Json<Vec<QuestionView>>, StatusCode> {
    let session = resolve_session_pub(&state.db, &session_code).await?;

    // Lazy expiry: mark overdue pending questions as expired
    let _ = sqlx::query(
        "UPDATE questions SET status = 'expired' WHERE session_id = $1 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()"
    )
    .bind(session.id)
    .execute(&state.db)
    .await;

    let status_filter = query.status.as_deref().unwrap_or("pending");

    let rows: Vec<(Uuid, String, QuestionStatus, Uuid, String, Option<Uuid>, Option<serde_json::Value>, Option<String>, Option<Uuid>, Option<String>, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> = if status_filter == "all" {
        sqlx::query_as(
            "SELECT q.id, q.question_text, q.status, q.asked_by, pa.display_name,
                    q.directed_to, q.context, q.answer_text, q.answered_by, pb.display_name,
                    q.created_at, q.answered_at
             FROM questions q
             JOIN participants pa ON pa.id = q.asked_by
             LEFT JOIN participants pb ON pb.id = q.answered_by
             WHERE q.session_id = $1
             ORDER BY q.created_at DESC"
        )
        .bind(session.id)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as(
            "SELECT q.id, q.question_text, q.status, q.asked_by, pa.display_name,
                    q.directed_to, q.context, q.answer_text, q.answered_by, pb.display_name,
                    q.created_at, q.answered_at
             FROM questions q
             JOIN participants pa ON pa.id = q.asked_by
             LEFT JOIN participants pb ON pb.id = q.answered_by
             WHERE q.session_id = $1 AND q.status = $2
             ORDER BY q.created_at DESC"
        )
        .bind(session.id)
        .bind(status_filter)
        .fetch_all(&state.db)
        .await
    }.map_err(|e| {
        tracing::error!("Failed to list questions: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let views: Vec<QuestionView> = rows
        .into_iter()
        .map(|(id, question_text, status, asked_by, asked_by_name, directed_to, context, answer_text, answered_by, answered_by_name, created_at, answered_at)| {
            QuestionView {
                id, question_text, status, asked_by, asked_by_name, directed_to, context,
                answer_text, answered_by, answered_by_name, created_at, answered_at,
            }
        })
        .collect();

    Ok(Json(views))
}

pub async fn get_question(
    State(state): State<Arc<AppState>>,
    Path((_session_code, question_id)): Path<(String, Uuid)>,
) -> Result<Json<QuestionView>, StatusCode> {
    let row: Option<(Uuid, String, QuestionStatus, Uuid, String, Option<Uuid>, Option<serde_json::Value>, Option<String>, Option<Uuid>, Option<String>, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)> = sqlx::query_as(
        "SELECT q.id, q.question_text, q.status, q.asked_by, pa.display_name,
                q.directed_to, q.context, q.answer_text, q.answered_by, pb.display_name,
                q.created_at, q.answered_at
         FROM questions q
         JOIN participants pa ON pa.id = q.asked_by
         LEFT JOIN participants pb ON pb.id = q.answered_by
         WHERE q.id = $1"
    )
    .bind(question_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (id, question_text, status, asked_by, asked_by_name, directed_to, context, answer_text, answered_by, answered_by_name, created_at, answered_at) = row.ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(QuestionView {
        id, question_text, status, asked_by, asked_by_name, directed_to, context,
        answer_text, answered_by, answered_by_name, created_at, answered_at,
    }))
}

pub async fn answer_question(
    State(state): State<Arc<AppState>>,
    Path((session_code, question_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<AnswerQuestionRequest>,
) -> Result<Json<QuestionView>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let session = resolve_session_pub(&state.db, &session_code).await?;
    let participant = resolve_participant_for_user(&state.db, session.id, user.id).await?;

    // Verify question exists and is pending
    let question: Question = sqlx::query_as(
        "SELECT * FROM questions WHERE id = $1 AND session_id = $2"
    )
    .bind(question_id)
    .bind(session.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    if question.status != QuestionStatus::Pending {
        return Err(StatusCode::CONFLICT);
    }

    // Update the question with the answer
    sqlx::query(
        "UPDATE questions SET answer_text = $1, answered_by = $2, answered_at = NOW(), status = 'answered'
         WHERE id = $3"
    )
    .bind(&req.answer_text)
    .bind(participant.id)
    .bind(question_id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Record activity
    crate::routes::activity::record_activity(
        &state.db, session.project_id, Some(session.id), participant.id,
        "question_answered", "question", question_id,
        &format!("Answered: {}", &question.question_text),
        serde_json::json!({}),
    ).await;

    // Return the updated question view
    get_question(
        State(state),
        Path((session_code, question_id)),
    ).await
}

pub async fn cancel_question(
    State(state): State<Arc<AppState>>,
    Path((session_code, question_id)): Path<(String, Uuid)>,
    AuthUser(claims): AuthUser,
) -> Result<StatusCode, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let session = resolve_session_pub(&state.db, &session_code).await?;
    let participant = resolve_participant_for_user(&state.db, session.id, user.id).await?;

    // Only the asker can cancel their own question
    let result = sqlx::query(
        "UPDATE questions SET status = 'cancelled' WHERE id = $1 AND session_id = $2 AND asked_by = $3 AND status = 'pending'"
    )
    .bind(question_id)
    .bind(session.id)
    .bind(participant.id)
    .execute(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}
