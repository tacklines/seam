/// Workspace token generation via Hydra client_credentials flow.
///
/// Mints short-lived JWTs for Coder workspaces to authenticate to the Seam
/// MCP endpoint. Uses a shared OAuth2 client (`seam-workspace`) registered
/// in Hydra with the `client_credentials` grant type.
///
/// Tokens are cached in memory and refreshed when they expire.
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, thiserror::Error)]
pub enum TokenError {
    #[error(
        "Workspace OAuth not configured (missing WORKSPACE_CLIENT_ID or WORKSPACE_CLIENT_SECRET)"
    )]
    NotConfigured,
    #[error("Failed to reach token endpoint: {0}")]
    Network(String),
    #[error("Token endpoint returned error: {0}")]
    TokenEndpoint(String),
}

#[derive(Debug, serde::Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: Option<u64>,
    #[allow(dead_code)]
    token_type: Option<String>,
}

/// Cached workspace token with expiry tracking.
struct CachedToken {
    access_token: String,
    /// When this token expires (with safety margin).
    expires_at: std::time::Instant,
}

/// Token provider for workspace-to-server authentication.
///
/// Call `get_token()` to get a valid JWT. Tokens are cached and automatically
/// refreshed when they expire. Thread-safe via interior RwLock.
#[derive(Clone)]
pub struct WorkspaceTokenProvider {
    /// Hydra public token endpoint (e.g. http://localhost:4444/oauth2/token)
    token_endpoint: String,
    client_id: String,
    client_secret: String,
    cache: Arc<RwLock<Option<CachedToken>>>,
    http: reqwest::Client,
}

impl WorkspaceTokenProvider {
    /// Create from environment variables. Returns None if not configured.
    ///
    /// Required env vars:
    /// - `WORKSPACE_CLIENT_ID` (default: "seam-workspace")
    /// - `WORKSPACE_CLIENT_SECRET`
    /// - `ISSUER_URL` (default: "http://localhost:4444") — Hydra public URL
    pub fn from_env() -> Option<Self> {
        let client_secret = std::env::var("WORKSPACE_CLIENT_SECRET").ok()?;
        let client_id =
            std::env::var("WORKSPACE_CLIENT_ID").unwrap_or_else(|_| "seam-workspace".to_string());
        let issuer_url =
            std::env::var("ISSUER_URL").unwrap_or_else(|_| "http://localhost:4444".to_string());

        let token_endpoint = format!("{}/oauth2/token", issuer_url.trim_end_matches('/'));

        Some(Self {
            token_endpoint,
            client_id,
            client_secret,
            cache: Arc::new(RwLock::new(None)),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("valid reqwest client"),
        })
    }

    /// Get a valid workspace JWT, using cached token if still valid.
    pub async fn get_token(&self) -> Result<String, TokenError> {
        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.as_ref() {
                if cached.expires_at > std::time::Instant::now() {
                    return Ok(cached.access_token.clone());
                }
            }
        }

        // Cache miss or expired — mint a new token
        let token = self.mint_token().await?;
        Ok(token)
    }

    async fn mint_token(&self) -> Result<String, TokenError> {
        let resp = self
            .http
            .post(&self.token_endpoint)
            .basic_auth(&self.client_id, Some(&self.client_secret))
            .form(&[("grant_type", "client_credentials"), ("scope", "openid")])
            .send()
            .await
            .map_err(|e| TokenError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(TokenError::TokenEndpoint(format!("HTTP {status}: {body}")));
        }

        let token_resp: TokenResponse = resp
            .json()
            .await
            .map_err(|e| TokenError::TokenEndpoint(format!("Invalid response: {e}")))?;

        // Cache with 60s safety margin (tokens default to 24h TTL)
        let ttl_secs = token_resp.expires_in.unwrap_or(86400);
        let margin = std::cmp::min(60, ttl_secs / 2);
        let expires_at =
            std::time::Instant::now() + std::time::Duration::from_secs(ttl_secs - margin);

        let access_token = token_resp.access_token.clone();

        let mut cache = self.cache.write().await;
        *cache = Some(CachedToken {
            access_token: token_resp.access_token,
            expires_at,
        });

        tracing::debug!(
            ttl_secs = ttl_secs,
            "Minted workspace JWT via client_credentials"
        );
        Ok(access_token)
    }
}
