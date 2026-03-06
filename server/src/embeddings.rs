use sqlx::PgPool;
use std::time::Duration;
use tracing::{debug, info, warn};

const POLL_INTERVAL: Duration = Duration::from_secs(10);
const BATCH_SIZE: i64 = 10;

/// Ollama /api/embed request body.
#[derive(serde::Serialize)]
struct EmbedRequest<'a> {
    model: &'a str,
    input: &'a str,
}

/// Ollama /api/embed response.
#[derive(serde::Deserialize)]
struct EmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

/// A knowledge chunk row that still needs an embedding.
#[derive(sqlx::FromRow)]
struct PendingChunk {
    id: uuid::Uuid,
    content: String,
}

/// Embed a single piece of text via Ollama.
/// Returns `None` if Ollama is unreachable or returns an error.
async fn embed_text(
    client: &reqwest::Client,
    ollama_url: &str,
    model: &str,
    text: &str,
) -> Option<Vec<f32>> {
    let url = format!("{}/api/embed", ollama_url);
    let body = EmbedRequest { model, input: text };

    let resp = match client.post(&url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            warn!(error = %e, "Ollama request failed");
            return None;
        }
    };

    if !resp.status().is_success() {
        warn!(status = %resp.status(), "Ollama returned non-success status");
        return None;
    }

    match resp.json::<EmbedResponse>().await {
        Ok(r) => r.embeddings.into_iter().next(),
        Err(e) => {
            warn!(error = %e, "Failed to parse Ollama response");
            None
        }
    }
}

/// One poll cycle: fetch a batch of chunks with NULL embeddings, embed them, write back.
async fn embed_pending_chunks(
    pool: &PgPool,
    client: &reqwest::Client,
    ollama_url: &str,
    model: &str,
) -> Result<usize, sqlx::Error> {
    let chunks: Vec<PendingChunk> = sqlx::query_as(
        "SELECT id, chunk_text AS content
         FROM knowledge_chunks
         WHERE embedding IS NULL
         ORDER BY created_at
         LIMIT $1",
    )
    .bind(BATCH_SIZE)
    .fetch_all(pool)
    .await?;

    if chunks.is_empty() {
        return Ok(0);
    }

    let mut embedded = 0usize;

    for chunk in &chunks {
        let vector = match embed_text(client, ollama_url, model, &chunk.content).await {
            Some(v) => v,
            None => {
                // Ollama unavailable — stop this batch, retry next poll cycle
                break;
            }
        };

        // pgvector stores embeddings as the `vector` type; sqlx doesn't have a native
        // binding for it, so we cast from a float array literal via SQL.
        let vector_literal = format!(
            "[{}]",
            vector
                .iter()
                .map(|f| f.to_string())
                .collect::<Vec<_>>()
                .join(",")
        );

        sqlx::query(
            "UPDATE knowledge_chunks
             SET embedding = $1::vector
             WHERE id = $2",
        )
        .bind(&vector_literal)
        .bind(chunk.id)
        .execute(pool)
        .await?;

        embedded += 1;
        debug!(chunk_id = %chunk.id, "Embedded knowledge chunk");
    }

    Ok(embedded)
}

/// Background loop: polls for un-embedded chunks every `POLL_INTERVAL`.
async fn run_worker(pool: PgPool, ollama_url: String, model: String) {
    info!(ollama_url, model, "Embedding worker started");
    let client = reqwest::Client::new();

    loop {
        match embed_pending_chunks(&pool, &client, &ollama_url, &model).await {
            Ok(0) => {} // nothing to do
            Ok(n) => info!(count = n, "Embedded knowledge chunks"),
            Err(e) => {
                // Graceful degradation: log and retry next cycle.
                // This covers the case where knowledge_chunks doesn't exist yet
                // (e.g. migrations not yet applied) or a transient DB error.
                warn!(error = %e, "Embedding worker poll failed, will retry");
            }
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

/// Start the background embedding worker if `OLLAMA_URL` is configured.
/// Silently skips startup if the env var is absent (dev without Ollama).
pub fn start_embedding_worker(pool: PgPool) {
    let ollama_url = match std::env::var("OLLAMA_URL") {
        Ok(url) => url,
        Err(_) => {
            tracing::info!("Embedding worker disabled (OLLAMA_URL not set)");
            return;
        }
    };

    let model = std::env::var("EMBEDDING_MODEL")
        .unwrap_or_else(|_| "qwen3-embedding:0.6b".to_string());

    tokio::spawn(run_worker(pool, ollama_url, model));
}
