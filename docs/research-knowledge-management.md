# Knowledge Management Architecture Research

> Research compiled March 2026. Covers embedding models, vector stores, knowledge graphs, hybrid retrieval, code indexing, and event-driven architecture patterns for Seam.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Embedding Models](#embedding-models)
3. [Vector Stores](#vector-stores)
4. [Hybrid Search & Retrieval](#hybrid-search--retrieval)
5. [Knowledge Graphs](#knowledge-graphs)
6. [Code Indexing & Search](#code-indexing--search)
7. [Agentic RAG Frameworks](#agentic-rag-frameworks)
8. [Event-Driven Indexing Architecture](#event-driven-indexing-architecture)
9. [Serving Context to Agents](#serving-context-to-agents)
10. [Production Patterns](#production-patterns)
11. [Recommended Architecture](#recommended-architecture)

---

## Executive Summary

### The Problem

Seam needs to index and surface knowledge across three domains: **artifacts** (plans, docs), **codebases** (repos), and **tasks** (tickets, comments). This knowledge must be queryable by our Python/LangGraph agents, Claude Code, and other MCP-compatible tools. Updates must be event-driven, not batch.

### The Recommendation

**Stay in PostgreSQL.** Use pgvector for embeddings, ParadeDB pg_search (or Postgres FTS) for BM25, and RRF to fuse results. For code search, embed Tantivy in the Rust server or deploy Sourcebot (Zoekt wrapper with MCP) as a sidecar. Serve retrieval via MCP tools on our existing `/mcp` endpoint.

For a more capable but operationally heavier alternative, deploy **Meilisearch** as a single Docker container — it handles hybrid search (keyword + vector), multi-tenancy via tenant tokens, and has a clean REST API callable from both Rust and Python.

### Key Decision: Build vs. Buy the Search Layer

| Approach | Pros | Cons |
|----------|------|------|
| **pgvector + pg_search** | Zero new infra, ACID, SQL joins | DIY hybrid fusion, AGPL license on pg_search |
| **Meilisearch** | Native hybrid search, tenant tokens, single binary | New service to operate, data sync needed |
| **pgvector + Postgres FTS** | Zero new infra, no AGPL concern | Weaker BM25 than Tantivy/pg_search |

---

## Embedding Models

### Text Embedding

| Model | Params | Dims | Context | MTEB | License | Notes |
|-------|--------|------|---------|------|---------|-------|
| **Qwen3-Embedding** | 0.6B/4B/8B | 32–4096 (configurable) | 32k | #1 open-source | Apache 2.0 | Best quality; Matryoshka dims; 100+ langs; 0.6B for dev, 8B for prod |
| **BGE-M3** | 568M | 1024 | 8k | Top tier | MIT | Triple retrieval (dense+sparse+ColBERT); built-in BM25-like sparse vectors |
| **Nomic Embed Text v2** | MoE | 768 | 8k | Good | Apache 2.0 | Fully open (weights+data+code); runs on Ollama; good baseline |
| **Jina Embeddings v3** | 570M | 1024 | 8k | Strong | CC BY-NC 4.0 | Task-specific LoRA adapters; **non-commercial license is a blocker** |
| **all-MiniLM-L6-v2** | 22M | 384 | 512 | Legacy | Apache 2.0 | Too small context window; prototyping only |

**Recommendation:** Qwen3-Embedding (0.6B for dev, 4B+ for prod). Alternative: BGE-M3 if you want built-in sparse vectors to skip a separate BM25 index.

### Code Embedding

| Model | Params | Dims | License | Notes |
|-------|--------|------|---------|-------|
| **Nomic Embed Code** | 7B | 768 | Apache 2.0 | SOTA on CodeSearchNet; fully open; needs GPU |
| **CodeXEmbed (SFR-Embedding-Code)** | 400M/2B/7B | varies | Apache 2.0 | #1 on CoIR; 12 languages; 400M is self-hostable without large GPU |
| **CodeSage v2** | 130M–1.3B | 1024–2048 | Apache 2.0 | Matryoshka support; decent but outclassed by CodeXEmbed at similar size |

**Recommendation:** CodeXEmbed-400M for best quality-to-resource ratio. Nomic Embed Code (7B) if GPU budget allows.

---

## Vector Stores

### Tier 1: PostgreSQL Extensions (preferred — zero new infrastructure)

#### pgvector
- **License:** PostgreSQL License
- **What:** HNSW and IVFFlat vector indexes in PostgreSQL
- **Strengths:** Already in our stack; ACID; joins with relational data; halfvec for up to 4000 dims; scalar/binary quantization; massive ecosystem
- **Weaknesses:** Max 2000 dims (4000 with halfvec); no built-in BM25; single-node scaling
- **Verdict:** **Default choice.** Sufficient for our scale. Pair with pg_search or Postgres FTS for hybrid.

#### VectorChord (pgvecto.rs successor)
- **License:** Apache 2.0
- **What:** High-performance PG extension with RaBitQ compression
- **Strengths:** 5x faster queries than pgvector; 16x insert throughput; up to 60k dims; 4-bit/8-bit quantization
- **Weaknesses:** Smaller ecosystem; requires pgrx; less cloud support
- **Verdict:** Watch list. Upgrade path if pgvector becomes a bottleneck.

#### ParadeDB pg_search
- **License:** AGPL-3.0 (commercial license available)
- **What:** BM25 full-text search via Tantivy inside PostgreSQL
- **Strengths:** Production-ready BM25 in Postgres; composable with pgvector via RRF; real-time index updates; fuzzy search, highlighting, faceting
- **Weaknesses:** AGPL license needs evaluation
- **Verdict:** **The missing hybrid search piece** for pgvector. BM25 + pgvector + RRF in a single SQL query.

### Tier 2: Dedicated Vector Databases (if we outgrow pgvector)

| Database | License | Hybrid Search | Multi-tenancy | Verdict |
|----------|---------|--------------|---------------|---------|
| **Qdrant** | Apache 2.0 | Native sparse+dense | Tiered (Nov 2025) | Best dedicated option; Rust-based; overkill for our scale |
| **Weaviate** | BSD-3 | Native BM25F+vector | Native per-tenant shards | Best built-in hybrid; heavier resource footprint |
| **Chroma** | Apache 2.0 | BM25+SPLADE (Nov 2025) | Limited | Prototyping tool; pgvector is better for us |
| **LanceDB** | Apache 2.0 | FTS+vector | Limited | Embedded model conflicts with multi-service architecture |
| **Milvus** | Apache 2.0 | Limited | Yes | Billion-scale; massive operational footprint; overkill |

**Verdict:** Stay with pgvector. If we need a dedicated vector DB later, Qdrant is the best fit (Rust, Apache 2.0, good filtering).

---

## Hybrid Search & Retrieval

### Retrieval Fusion

**Reciprocal Rank Fusion (RRF)** is the standard approach for combining BM25 + vector results. Score: `sum(1 / (k + rank_i))` across retrievers. ~10 lines of SQL. No tuning needed. 15-30% better recall than either method alone.

### Reranking (Phase 2 — add when needed)

| Model | License | Notes |
|-------|---------|-------|
| **mxbai-rerank-large-v2** | Apache 2.0 | BEIR 57.49; Qwen-2.5 backbone |
| **BGE-reranker-v2-m3** | Apache 2.0 | 100+ langs; 50-100ms GPU latency |
| **FlashRank** | Apache 2.0 | CPU-only; lightweight; good for Rust backend (call via HTTP) |

**Verdict:** Not needed initially. Add FlashRank when retrieval precision matters.

### ColBERT / Late Interaction

Per-token matching gives better quality than single-vector search, but the storage and complexity overhead isn't justified for our scale. Skip.

### What Actually Works in Production

The 2026 consensus:

1. **For small corpora (<1M tokens):** Just stuff it in the context window. Cache-Augmented Generation (CAG) is 40x faster than RAG.
2. **For medium corpora:** BM25 + vector hybrid with RRF is the production default. Add reranking as Phase 2.
3. **For large, complex corpora:** Graph-enhanced retrieval (GraphRAG) helps with multi-hop questions but is expensive.
4. **Chunking is the #1 failure point.** Switching from fixed to semantic/structural chunking improves precision by 20-40%.
5. **Over-reliance on semantic search** misses exact keyword matches. Always include BM25.

---

## Knowledge Graphs

| Project | License | Backend | Fit for Seam |
|---------|---------|---------|-------------|
| **Apache AGE** | Apache 2.0 | PostgreSQL extension | **High** — graph queries in our existing DB; openCypher; combine with pgvector |
| **LightRAG** | MIT | Configurable | Medium — simpler than GraphRAG; incremental updates; Python-only |
| **Microsoft GraphRAG** | MIT | Custom | Medium — overkill for session-scale data; expensive indexing |
| **Neo4j + vector search** | GPLv3/commercial | Separate DB | Low — unnecessary infrastructure alongside PostgreSQL |
| **Graphiti (Zep)** | Apache 2.0 | Neo4j | Low practically — temporal KG model is excellent but Neo4j dependency is heavy |
| **Cognee** | Apache 2.0 | Multi-store | Medium — three-store architecture (graph+vector+relational) is a good design pattern |

### Recommended Approach

**Apache AGE** is the natural fit — graph queries inside PostgreSQL without new infrastructure. Model session knowledge as a graph (entities, relationships, temporal edges). Combine with pgvector for hybrid graph+vector queries. The retrieval logic is DIY but the operational simplicity is worth it.

**Pattern to steal from Graphiti:** Bi-temporal edges that track both when events occurred and when they were ingested. Build this on Apache AGE rather than adopting Graphiti's Neo4j dependency.

**Pattern to steal from Cognee:** Three-store architecture (graph + vector + relational) maps naturally to Apache AGE + pgvector + regular PostgreSQL tables — all in one database.

---

## Code Indexing & Search

### Code Search Engines

| Tool | License | Language | Incremental | Notes |
|------|---------|----------|-------------|-------|
| **Zoekt** | Apache 2.0 | Go | Yes | Best trigram search; powers Sourcegraph/GitLab; proven at scale |
| **Sourcebot** | MIT | Go (Zoekt wrapper) | Yes | **Ships an MCP server out of the box**; single Docker container; YC-backed |
| **Tantivy** | MIT | **Rust** | Near-real-time | Library, not service; embeds in our Axum server; powers Meilisearch/Quickwit |
| **ast-grep** | MIT | **Rust** | No (scans per query) | Structural AST search via tree-sitter; complementary to text search |
| **Serena** | Apache 2.0 | Python | N/A (LSP-based) | Go-to-def, find-refs via LSP as MCP tools; 30+ languages |
| **Bloop** | Apache 2.0 | **Rust** | N/A (archived Jan 2025) | **Reference architecture** for Tantivy + tree-sitter + vector search in Rust |

**Sourcegraph** went closed-source in Aug 2024. Livegrep, Hound, and OpenGrok are effectively superseded by Zoekt.

### Code-Aware Chunking

**Tree-sitter is the universal answer.** Every modern tool (Zoekt, Aider, ast-grep, CocoIndex, Cursor, Bloop, cAST research) uses tree-sitter for code parsing. The `tree-sitter` Rust crate is mature and directly embeddable.

**Chunking strategy:**
- Parse code into AST via tree-sitter
- Chunk at function/class/method boundaries
- Recursively split large nodes (cAST algorithm)
- Include scope context (enclosing class, imports) as metadata
- Chunk-hash caching: if a chunk's hash hasn't changed, skip re-embedding

### Repo Map Pattern (from Aider)

Tree-sitter extracts symbol definitions and references → build dependency graph → PageRank to rank most-referenced symbols → format into token-budgeted context string (~1-2k tokens). Gives agents a "table of contents" of the repo without reading every file.

**This is replicable in Rust** with tree-sitter + petgraph.

### Integration Patterns

| Pattern | How it works | Used by |
|---------|-------------|---------|
| **Agentic search** | Model issues its own Glob/Grep/Read queries | Claude Code |
| **Pre-built index + retrieval** | Embed codebase, retrieve top-k by similarity | Cursor, Copilot |
| **MCP code search tools** | Expose search as MCP tools agents can call | Sourcebot, Serena, ast-grep |
| **Repo map orientation** | Send symbol index with every prompt | Aider, Continue.dev |

**Recommendation:** Two-phase approach:
1. Lightweight orientation (repo map, ~1-2k tokens) sent with every agent prompt
2. On-demand deep retrieval via MCP tools that agents invoke as needed

### Quick-Start vs. Custom Build

| Path | Time to value | Capability | Operational cost |
|------|--------------|------------|-----------------|
| **Sourcebot** (Docker) | Hours | Zoekt trigram + MCP server | Low (one container) |
| **Tantivy embedded** | Weeks | Custom text + semantic search in Rust | Zero (in-process) |
| **Full stack** (Tantivy + pgvector + tree-sitter + repo map) | Months | Complete code intelligence | Medium |

**Recommendation:** Start with Sourcebot for immediate MCP-based code search. Build the Tantivy + pgvector layer when we need tighter integration or semantic search.

---

## Agentic RAG Frameworks

| Framework | License | Verdict |
|-----------|---------|---------|
| **LlamaIndex** | MIT | Medium fit — good index abstractions but Python-only; value is limited when retrieval lives in PostgreSQL |
| **LangChain** | MIT | Low fit — we already use LangGraph; retrieval abstractions add overhead without benefit over direct DB queries |
| **Haystack** | Apache 2.0 | Low fit — clean pipeline model but we don't need another orchestration framework |
| **Dify** | Apache 2.0 | Low fit — standalone platform, not embeddable |
| **RAGFlow** | Apache 2.0 | Low fit — focused on complex document parsing we don't need |
| **Cognee** | Apache 2.0 | Medium fit — agent memory model is relevant; three-store architecture worth studying |
| **Mem0** | Apache 2.0 | Medium fit — simple memory API; may be too simple for multi-agent collaborative sessions |

**Verdict:** Don't adopt an RAG framework. Build retrieval in PostgreSQL (pgvector + BM25), serve via MCP tools. The frameworks add Python dependency layers we don't need when the backend is Rust.

---

## Event-Driven Indexing Architecture

### What We Have

Seam already has an append-only `domain_events` table with sequential IDs and PG NOTIFY triggers. Domain events exist for: task CRUD, session lifecycle, comments, workspace changes. This is a textbook transactional outbox.

### Indexing Pipeline Design

```
Domain Events (existing table)
       │
       ├── PG NOTIFY (wake-up signal, fire-and-forget)
       │
       ▼
Indexing Consumer
  ├── Polls: SELECT * FROM domain_events WHERE id > $cursor ORDER BY id LIMIT 100
  ├── Transforms event → search document (type-specific chunking)
  ├── Pushes to search index (pgvector + BM25, or Meilisearch)
  └── Updates cursor: UPDATE consumer_cursors SET last_id = $new_cursor
       │
       ▼
Search Index
  ├── Hybrid search (keyword + vector)
  ├── Tenant-scoped (org_id filtering)
  └── Queryable via MCP tools
```

### Event Processing Patterns

| Pattern | What | Fit |
|---------|------|-----|
| **PG NOTIFY + cursor polling** | Wake-up signal + sequential scan for reliability | **High** — already built; just add consumer |
| **Transactional outbox** | Events in same transaction as data | **High** — `domain_events` IS the outbox |
| **PGMQ** | PG extension for SQS-like queue semantics | Medium — useful if we need retry/dead-letter |
| **CDC (Debezium)** | WAL streaming to external consumers | Low — overkill; requires Kafka + Zookeeper |
| **Event replay for reindex** | Replay all events from id=0 to rebuild any index | **High** — append-only log enables this trivially |

### Consumer Implementation Options

| Option | Pros | Cons |
|--------|------|------|
| **Tokio task in Rust server** | Zero new processes; shared DB pool; lowest latency | Couples indexing to server lifecycle |
| **Separate Rust binary** | Independent scaling; crash isolation | Another binary to deploy |
| **Python worker** | Access to embedding models directly | Cross-language boundary; separate deployment |

**Recommendation:** Tokio task in the Rust server for Phase 1. If embedding computation becomes a bottleneck, split to a separate worker.

### Content-Type-Specific Chunking

| Content Type | Chunking Strategy | Embedding Model |
|-------------|-------------------|-----------------|
| **Plans/docs** | Markdown header-based (H2 split, H1 as context metadata) | Qwen3/BGE-M3 (text) |
| **Code** | Tree-sitter AST-aware (function/class boundaries) | CodeXEmbed-400M / Nomic Embed Code |
| **Tasks** | Field-based (title+description primary, comments secondary) | Qwen3/BGE-M3 (text) |
| **Conversations** | Message-level with session context metadata | Qwen3/BGE-M3 (text) |

### Search-as-a-Service Comparison

If we want a dedicated search service rather than pgvector + pg_search:

| Service | License | Hybrid Search | Multi-tenancy | Fit |
|---------|---------|--------------|---------------|-----|
| **Meilisearch** | MIT | Native (keyword+vector) | Tenant tokens (JWT-like) | **High** — single binary; REST API; tenant tokens map to our org model |
| **Typesense** | GPL-3.0 | Built-in | Scoped API keys | Medium-High — in-memory (higher cost); Raft HA |
| **OpenSearch** | Apache 2.0 | Yes | Index-per-tenant or aliases | Low — massive operational overhead; JVM |
| **Manticore** | GPL-2.0 | Yes (2025) | Limited | Medium — auto-embeddings; smaller ecosystem |

**Meilisearch** is the strongest external option: single Rust binary, native hybrid search, tenant tokens for org isolation, zero-downtime reindex via alias swap, and 4x faster incremental updates in v1.12.

---

## Serving Context to Agents

### MCP Knowledge Tools (on existing /mcp endpoint)

Add retrieval tools to the existing MCP endpoint:

```
search_knowledge(query, scope, content_type, limit)
  → Returns ranked snippets with source attribution

get_knowledge_detail(doc_id)
  → Returns full document content

get_repo_map(repo_id, token_budget?)
  → Returns PageRank-scored symbol index
```

The `McpIdentity` middleware already provides tenant context for scoping results by org_id.

### Tiered Retrieval (Summary → Detail)

`search_knowledge` returns summaries (title + snippet + score). `get_knowledge_detail` returns full content for items the agent selects. This reduces token waste by 60-80% vs. returning full documents.

### Prompt Injection Safety

1. Scope all retrieval by org_id (from McpIdentity)
2. Wrap retrieved content in XML delimiters (`<retrieved_context>...</retrieved_context>`)
3. Never include retrieved content in system prompts — always in user/tool-result positions
4. Retrieved content crosses trust boundaries in a multi-tenant system — treat it as untrusted

### Injecting Context into External Tools

| Method | Mechanism | Dynamic? | Tokens |
|--------|-----------|----------|--------|
| **CLAUDE.md / rules/** | Loaded at session start | Static | Every session |
| **AGENTS.md** | Cross-tool standard (Claude Code, Cursor, Copilot, Codex) | Static | Every session |
| **MCP server** | Tools agents call on demand | **Dynamic** | On demand |
| **Local MCP server** | `http://localhost:3002/mcp` as MCP config for Claude Code et al. | **Dynamic** | On demand |

**The unified answer:** External tools (Claude Code, Cursor, etc.) connect to our Seam MCP endpoint and use the same `search_knowledge` / `get_knowledge_detail` tools as internal agents. One source of truth, one serving layer.

```json
{
  "mcpServers": {
    "seam": {
      "url": "http://localhost:3002/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

---

## Production Patterns

### Index Consistency

- **Latency target:** 100-500ms from event to searchable (not real-time chat, this is fine)
- **Cursor-based polling:** `consumer_cursors` table tracks `(consumer_name, last_processed_id)`
- **PG NOTIFY as wake-up:** Avoids busy-polling; cursor scan is the source of truth

### Handling Deletes and Updates

- **Updates:** Upsert semantics (PUT with same primary key replaces document)
- **Deletes:** Domain event `*.deleted` → delete from search index
- **Existing pattern:** We already emit delete events BEFORE the actual delete to capture entity data

### Zero-Downtime Reindex

1. Create new index (e.g., `tasks_v2`)
2. Replay all domain events from `id = 0` to populate
3. Atomically swap alias (`tasks` → `tasks_v2`)
4. Delete old index

Meilisearch supports this natively via `POST /swap-indexes`. For pgvector, use a view or table rename.

### Multi-Tenant Indexing

**Shared index + tenant scoping.** All documents include `org_id`. Every query filters by org_id from McpIdentity. For Meilisearch: tenant tokens add mandatory `org_id = X` filter server-side.

---

## Recommended Architecture

### Phase 1: Foundation (Minimal Viable Knowledge)

```
┌─────────────────────────────────────────────────┐
│ Existing Seam Server (Rust/Axum)                │
│                                                  │
│  domain_events ──PG NOTIFY──► Indexing Consumer  │
│       table                    (Tokio task)      │
│                                     │            │
│                                     ▼            │
│                              ┌─────────────┐    │
│                              │  pgvector    │    │
│                              │  + PG FTS    │    │
│                              │  (or pg_search)   │
│                              └──────┬──────┘    │
│                                     │            │
│  /mcp ◄─── search_knowledge ◄──────┘            │
│        ◄─── get_knowledge_detail                 │
└─────────────────────────────────────────────────┘
```

**Components:**
- Indexing consumer as Tokio task in the server
- pgvector for embeddings, Postgres FTS (or pg_search) for keyword search
- RRF fusion in SQL
- Two new MCP tools: `search_knowledge`, `get_knowledge_detail`
- Content-type-specific chunking (markdown headers, task fields)
- Qwen3-Embedding-0.6B or BGE-M3 for text embeddings (served via Ollama)

**What this gets you:** Agents can search tasks, plans, and docs. External tools connect to the same MCP endpoint.

### Phase 2: Code Intelligence

```
┌──────────────┐     ┌─────────────────────┐
│  Sourcebot   │     │  Seam Server        │
│  (Docker)    │     │                      │
│  Zoekt +     │◄────│  MCP proxy or        │
│  MCP server  │     │  direct agent access │
└──────────────┘     └─────────────────────┘
```

**Or, for tighter integration:**

- Embed Tantivy in the Rust server for code text search
- Tree-sitter for AST-aware chunking + symbol extraction
- CodeXEmbed-400M for code embeddings in pgvector
- Repo map generator (tree-sitter → dependency graph → PageRank)
- New MCP tool: `get_repo_map`

### Phase 3: Graph Knowledge (when needed)

- Apache AGE extension for entity-relationship graphs
- Bi-temporal edges (Graphiti pattern) for evolving session knowledge
- Graph traversal + vector search in combined queries
- Three-store queries: graph (AGE) + vector (pgvector) + relational (regular tables)

### Phase 4: Dedicated Search Service (if scale demands)

- Meilisearch as a Docker sidecar
- Native hybrid search replaces pgvector + pg_search
- Tenant tokens for org isolation
- Zero-downtime reindex via alias swap
- REST API from both Rust server and Python agents

---

## Appendix: Key Projects & Links

| Project | URL | License | Category |
|---------|-----|---------|----------|
| pgvector | github.com/pgvector/pgvector | PostgreSQL | Vector store |
| VectorChord | github.com/tensorchord/VectorChord | Apache 2.0 | Vector store |
| ParadeDB pg_search | paradedb.com | AGPL-3.0 | BM25 in Postgres |
| Qdrant | qdrant.tech | Apache 2.0 | Vector database |
| Meilisearch | meilisearch.com | MIT | Search engine |
| Tantivy | github.com/quickwit-oss/tantivy | MIT | Search library (Rust) |
| Apache AGE | age.apache.org | Apache 2.0 | Graph in Postgres |
| Zoekt | github.com/sourcegraph/zoekt | Apache 2.0 | Code search |
| Sourcebot | sourcebot.dev | MIT | Code search + MCP |
| ast-grep | ast-grep.github.io | MIT | Structural code search (Rust) |
| Serena | github.com/oraios/serena | Apache 2.0 | LSP-based code intelligence via MCP |
| tree-sitter | tree-sitter.github.io | MIT | Parser (Rust core) |
| CocoIndex | cocoindex.io | Apache 2.0 | Incremental indexing framework |
| Qwen3-Embedding | huggingface.co/Qwen/Qwen3-Embedding-8B | Apache 2.0 | Text embedding |
| BGE-M3 | huggingface.co/BAAI/bge-m3 | MIT | Text embedding (hybrid) |
| Nomic Embed Code | huggingface.co/nomic-ai/nomic-embed-code | Apache 2.0 | Code embedding |
| CodeXEmbed | arxiv.org/abs/2411.12644 | Apache 2.0 | Code embedding |
| Cognee | cognee.ai | Apache 2.0 | Agent memory engine |
| LightRAG | github.com/HKUDS/LightRAG | MIT | Lightweight GraphRAG |
| Graphiti | github.com/getzep/graphiti | Apache 2.0 | Temporal knowledge graph |
| PGMQ | github.com/pgmq/pgmq | PostgreSQL | Message queue in Postgres |
| Bloop (archived) | github.com/BloopAI/bloop | Apache 2.0 | Reference: Rust code search architecture |
| AGENTS.md | agents.md | N/A | Cross-tool agent instructions standard |
