use axum::{
    extract::{Path, State},
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

#[derive(Debug, Deserialize)]
pub struct UpsertNoteRequest {
    pub title: Option<String>,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct NoteView {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub content: String,
    pub updated_by_name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

async fn note_to_view(db: &sqlx::PgPool, note: Note) -> NoteView {
    let updated_by_name = if let Some(by) = note.updated_by {
        sqlx::query_scalar::<_, String>(
            "SELECT display_name FROM participants WHERE id = $1"
        ).bind(by).fetch_optional(db).await.ok().flatten()
    } else {
        None
    };

    NoteView {
        id: note.id,
        slug: note.slug,
        title: note.title,
        content: note.content,
        updated_by_name,
        created_at: note.created_at,
        updated_at: note.updated_at,
    }
}

pub async fn list_notes(
    State(state): State<Arc<AppState>>,
    Path(session_code): Path<String>,
) -> Result<Json<Vec<NoteView>>, StatusCode> {
    let session = resolve_session_pub(&state.db, &session_code).await?;

    let notes: Vec<Note> = sqlx::query_as(
        "SELECT * FROM notes WHERE session_id = $1 ORDER BY created_at"
    )
    .bind(session.id)
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut views = Vec::with_capacity(notes.len());
    for note in notes {
        views.push(note_to_view(&state.db, note).await);
    }

    Ok(Json(views))
}

pub async fn get_note(
    State(state): State<Arc<AppState>>,
    Path((session_code, slug)): Path<(String, String)>,
) -> Result<Json<NoteView>, StatusCode> {
    let session = resolve_session_pub(&state.db, &session_code).await?;

    let note: Note = sqlx::query_as(
        "SELECT * FROM notes WHERE session_id = $1 AND slug = $2"
    )
    .bind(session.id)
    .bind(&slug)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(note_to_view(&state.db, note).await))
}

pub async fn upsert_note(
    State(state): State<Arc<AppState>>,
    Path((session_code, slug)): Path<(String, String)>,
    AuthUser(claims): AuthUser,
    Json(req): Json<UpsertNoteRequest>,
) -> Result<Json<NoteView>, StatusCode> {
    let user = crate::db::upsert_user(&state.db, &claims).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let session = resolve_session_pub(&state.db, &session_code).await?;

    let participant: Participant = sqlx::query_as(
        "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2"
    )
    .bind(session.id)
    .bind(user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::FORBIDDEN)?;

    let title = req.title.unwrap_or_else(|| slug.clone());

    let note: Note = sqlx::query_as(
        "INSERT INTO notes (id, session_id, slug, title, content, updated_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (session_id, slug) DO UPDATE
         SET content = EXCLUDED.content, title = EXCLUDED.title, updated_by = EXCLUDED.updated_by, updated_at = NOW()
         RETURNING *"
    )
    .bind(session.id)
    .bind(&slug)
    .bind(&title)
    .bind(&req.content)
    .bind(participant.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to upsert note: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(note_to_view(&state.db, note).await))
}
