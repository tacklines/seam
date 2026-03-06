-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge chunks for hybrid search (vector + full-text)
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    project_id UUID REFERENCES projects(id),

    -- Source tracking
    content_type TEXT NOT NULL CHECK (content_type IN ('plan', 'task', 'comment', 'document', 'code')),
    source_id UUID NOT NULL,        -- ID of the source entity (task, plan, etc.)
    source_field TEXT,              -- Which field this chunk came from (e.g., 'description', 'title')

    -- Content
    chunk_text TEXT NOT NULL,
    chunk_hash TEXT NOT NULL,       -- For skip-if-unchanged optimization

    -- Search indexes
    embedding vector(1024),         -- pgvector column (1024 dims for BGE-M3 / Qwen3)
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_knowledge_chunks_org ON knowledge_chunks(org_id);
CREATE INDEX idx_knowledge_chunks_project ON knowledge_chunks(project_id);
CREATE INDEX idx_knowledge_chunks_source ON knowledge_chunks(source_id);
CREATE INDEX idx_knowledge_chunks_content_type ON knowledge_chunks(content_type);
CREATE INDEX idx_knowledge_chunks_hash ON knowledge_chunks(chunk_hash);

-- Full-text search index (GIN)
CREATE INDEX idx_knowledge_chunks_fts ON knowledge_chunks USING GIN(search_vector);

-- Vector similarity index (HNSW) -- create after initial data load for better index quality
-- Using cosine distance (vector_cosine_ops) which is standard for embedding models
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw(embedding vector_cosine_ops);

-- Unique constraint: one chunk per source+field combination (upsert semantics)
CREATE UNIQUE INDEX idx_knowledge_chunks_source_field ON knowledge_chunks(source_id, source_field, chunk_hash);

-- Cursor tracking for event consumers (indexing, etc.)
CREATE TABLE consumer_cursors (
    consumer_name TEXT PRIMARY KEY,
    last_processed_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
