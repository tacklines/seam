# ─── Stage 1: Frontend Build ──────────────────────────────────────────────────
FROM node:22-bookworm-slim AS frontend

ARG VITE_AUTH_AUTHORITY=http://localhost:8081
ARG VITE_APP_URL=http://localhost:5173
ARG VITE_CLIENT_ID=web-app

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_AUTH_AUTHORITY=$VITE_AUTH_AUTHORITY
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_CLIENT_ID=$VITE_CLIENT_ID
RUN npm run build

# ─── Stage 2: Rust Builder ────────────────────────────────────────────────────
FROM rust:1-bookworm AS builder

WORKDIR /app

# Install build-time system dependencies
# - pkg-config: required for crates that probe native libs
# - libpq-dev: client headers for sqlx postgres feature
RUN apt-get update && apt-get install -y \
    pkg-config \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only manifests first to let cargo fetch deps before source changes
COPY server/Cargo.toml server/Cargo.lock ./

# Stub out both binary entry points so `cargo fetch` / dependency compilation
# succeeds without the real source tree
RUN mkdir -p src/bin && \
    echo 'fn main() {}' > src/main.rs && \
    echo 'fn main() {}' > src/bin/worker.rs

# Pre-compile dependencies (cached layer — invalidated only when Cargo.toml/lock change)
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release; \
    # Remove stub artifacts so they are rebuilt against real source
    rm -f target/release/seam-server target/release/seam-worker \
          target/release/deps/seam_server* target/release/deps/seam_worker*

# Now copy the real source
COPY server/src/ ./src/
COPY server/migrations/ ./migrations/

# Build both release binaries
# DATABASE_URL is intentionally NOT set — sqlx uses runtime queries only
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release && \
    cp target/release/seam-server /usr/local/bin/seam-server && \
    cp target/release/seam-worker /usr/local/bin/seam-worker

# ─── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

WORKDIR /app

# Runtime dependencies only:
# - libpq5: postgres client library (sqlx runtime connection)
# - ca-certificates: TLS root certs for outbound HTTPS (Hydra, Coder, Ollama)
# - curl: HEALTHCHECK
RUN apt-get update && apt-get install -y \
    libpq5 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Binaries from builder
COPY --from=builder /usr/local/bin/seam-server /usr/local/bin/seam-server
COPY --from=builder /usr/local/bin/seam-worker /usr/local/bin/seam-worker

# Frontend static assets served by seam-server
COPY --from=frontend /app/frontend/dist/ /app/static/

# Non-root user for runtime security
RUN useradd --uid 1000 --no-create-home --shell /bin/false appuser
USER appuser

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3002/api/health || exit 1

# Default: run the API server.
# Override CMD to ["seam-worker"] when running the worker container.
CMD ["seam-server"]
