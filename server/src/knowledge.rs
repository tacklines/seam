use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

/// A knowledge chunk stored in the database.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct KnowledgeChunk {
    pub id: Uuid,
    pub org_id: Uuid,
    pub project_id: Option<Uuid>,
    pub content_type: String,
    pub source_id: Uuid,
    pub source_field: Option<String>,
    pub chunk_text: String,
    pub chunk_hash: String,
    pub metadata: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Input for upserting a knowledge chunk.
pub struct ChunkInput {
    pub org_id: Uuid,
    pub project_id: Option<Uuid>,
    pub content_type: String,
    pub source_id: Uuid,
    pub source_field: Option<String>,
    pub chunk_text: String,
    pub chunk_hash: String,
    pub embedding: Option<Vec<f32>>,
    pub metadata: serde_json::Value,
}

/// A result from hybrid search combining vector + FTS rankings.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SearchResult {
    pub id: Uuid,
    pub chunk_text: String,
    pub source_id: Uuid,
    pub content_type: String,
    pub metadata: serde_json::Value,
    pub score: f64,
}

/// Reciprocal Rank Fusion combining vector similarity and BM25 full-text search.
///
/// Returns top-k results ranked by combined RRF score. Requires embeddings to be
/// present in the table; chunks without embeddings are excluded from the vector
/// half but can still surface via FTS.
pub async fn search_hybrid(
    pool: &PgPool,
    org_id: Uuid,
    query: &str,
    query_embedding: &[f32],
    limit: i64,
) -> Result<Vec<SearchResult>, sqlx::Error> {
    let embedding = pgvector::Vector::from(query_embedding.to_vec());

    let results = sqlx::query_as::<_, SearchResult>(
        "WITH vector_results AS (
            SELECT id, chunk_text, source_id, content_type, metadata,
                   ROW_NUMBER() OVER (ORDER BY embedding <=> $3::vector) AS rank
            FROM knowledge_chunks
            WHERE org_id = $1 AND embedding IS NOT NULL
            ORDER BY embedding <=> $3::vector
            LIMIT 20
        ),
        fts_results AS (
            SELECT id, chunk_text, source_id, content_type, metadata,
                   ROW_NUMBER() OVER (
                       ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $2)) DESC
                   ) AS rank
            FROM knowledge_chunks
            WHERE org_id = $1
              AND search_vector @@ websearch_to_tsquery('english', $2)
            ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $2)) DESC
            LIMIT 20
        ),
        combined AS (
            SELECT
                COALESCE(v.id, f.id)                   AS id,
                COALESCE(v.chunk_text, f.chunk_text)   AS chunk_text,
                COALESCE(v.source_id, f.source_id)     AS source_id,
                COALESCE(v.content_type, f.content_type) AS content_type,
                COALESCE(v.metadata, f.metadata)       AS metadata,
                COALESCE(1.0 / (60.0 + v.rank), 0.0)
                    + COALESCE(1.0 / (60.0 + f.rank), 0.0) AS rrf_score
            FROM vector_results v
            FULL OUTER JOIN fts_results f ON v.id = f.id
        )
        SELECT id, chunk_text, source_id, content_type, metadata,
               rrf_score AS score
        FROM combined
        ORDER BY rrf_score DESC
        LIMIT $4",
    )
    .bind(org_id)
    .bind(query)
    .bind(embedding)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(results)
}

/// Keyword-only full-text search. Works without any embeddings in the table.
pub async fn search_fts_only(
    pool: &PgPool,
    org_id: Uuid,
    query: &str,
    limit: i64,
) -> Result<Vec<SearchResult>, sqlx::Error> {
    let results = sqlx::query_as::<_, SearchResult>(
        "SELECT id, chunk_text, source_id, content_type, metadata,
                ts_rank(search_vector, websearch_to_tsquery('english', $2))::float8 AS score
         FROM knowledge_chunks
         WHERE org_id = $1
           AND search_vector @@ websearch_to_tsquery('english', $2)
         ORDER BY score DESC
         LIMIT $3",
    )
    .bind(org_id)
    .bind(query)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(results)
}

/// Insert or update a knowledge chunk. Uses (source_id, source_field, chunk_hash)
/// as the natural key — if a row with the same triple already exists it is left
/// unchanged (no-op), otherwise the new row is inserted.
///
/// When chunk_text changes for the same source+field, the caller should delete the
/// old chunk (different hash → different row) and upsert the new one.
pub async fn upsert_chunk(
    pool: &PgPool,
    chunk: &ChunkInput,
) -> Result<Uuid, sqlx::Error> {
    let embedding = chunk
        .embedding
        .as_ref()
        .map(|v| pgvector::Vector::from(v.clone()));

    #[derive(sqlx::FromRow)]
    struct IdRow {
        id: Uuid,
    }

    let row = sqlx::query_as::<_, IdRow>(
        "INSERT INTO knowledge_chunks
             (org_id, project_id, content_type, source_id, source_field,
              chunk_text, chunk_hash, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (source_id, source_field, chunk_hash) DO UPDATE
             SET updated_at = now()
         RETURNING id",
    )
    .bind(chunk.org_id)
    .bind(chunk.project_id)
    .bind(&chunk.content_type)
    .bind(chunk.source_id)
    .bind(&chunk.source_field)
    .bind(&chunk.chunk_text)
    .bind(&chunk.chunk_hash)
    .bind(embedding)
    .bind(&chunk.metadata)
    .fetch_one(pool)
    .await?;

    Ok(row.id)
}

/// Remove all knowledge chunks associated with a source entity.
/// Call this when the source entity (task, plan, etc.) is deleted.
pub async fn delete_chunks_for_source(
    pool: &PgPool,
    source_id: Uuid,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query("DELETE FROM knowledge_chunks WHERE source_id = $1")
        .bind(source_id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected())
}
