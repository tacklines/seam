use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub preferred_username: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub exp: u64,
    pub iat: u64,
    pub iss: String,
    /// Hydra puts custom session claims under `ext`
    pub ext: Option<ExtClaims>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtClaims {
    pub email: Option<String>,
    pub name: Option<String>,
    pub preferred_username: Option<String>,
}

impl Claims {
    /// Get email from top-level or ext claims
    pub fn resolved_email(&self) -> Option<&str> {
        self.email
            .as_deref()
            .or_else(|| self.ext.as_ref().and_then(|e| e.email.as_deref()))
    }

    /// Get name from top-level or ext claims
    pub fn resolved_name(&self) -> Option<&str> {
        self.name
            .as_deref()
            .or_else(|| self.ext.as_ref().and_then(|e| e.name.as_deref()))
    }

    /// Get preferred_username from top-level or ext claims
    pub fn resolved_username(&self) -> Option<&str> {
        self.preferred_username.as_deref().or_else(|| {
            self.ext
                .as_ref()
                .and_then(|e| e.preferred_username.as_deref())
        })
    }
}

#[derive(Clone)]
pub struct JwksCache {
    certs_url: String,
    keys: Arc<RwLock<Vec<JwkKey>>>,
}

#[derive(Debug, Clone, Deserialize)]
struct JwkKey {
    kid: String,
    n: String,
    e: String,
}

#[derive(Debug, Deserialize)]
struct JwksResponse {
    keys: Vec<JwkKey>,
}

impl JwksCache {
    pub fn new(jwks_url: &str) -> Self {
        Self {
            certs_url: jwks_url.to_string(),
            keys: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn validate_token(&self, token: &str) -> Result<Claims, AuthError> {
        let header = jsonwebtoken::decode_header(token).map_err(|e| {
            tracing::warn!("Failed to decode JWT header: {e}");
            AuthError::InvalidToken
        })?;
        let kid = header.kid.ok_or_else(|| {
            tracing::warn!("JWT has no 'kid' in header");
            AuthError::InvalidToken
        })?;

        // Try cached keys first
        if let Some(claims) = self.try_validate_with_cached(&kid, token).await {
            return Ok(claims);
        }

        // Refresh keys and try again
        self.refresh_keys().await?;
        self.try_validate_with_cached(&kid, token)
            .await
            .ok_or(AuthError::InvalidToken)
    }

    async fn try_validate_with_cached(&self, kid: &str, token: &str) -> Option<Claims> {
        let keys = self.keys.read().await;
        let key = keys.iter().find(|k| k.kid == kid)?;

        let decoding_key = DecodingKey::from_rsa_components(&key.n, &key.e).ok()?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.validate_aud = false;

        match decode::<Claims>(token, &decoding_key, &validation) {
            Ok(data) => Some(data.claims),
            Err(e) => {
                tracing::warn!("JWT decode failed for kid={kid}: {e}");
                None
            }
        }
    }

    async fn refresh_keys(&self) -> Result<(), AuthError> {
        let resp = reqwest::get(&self.certs_url)
            .await
            .map_err(|_| AuthError::OidcProviderUnavailable)?;

        let jwks: JwksResponse = resp
            .json()
            .await
            .map_err(|_| AuthError::OidcProviderUnavailable)?;

        let mut keys = self.keys.write().await;
        *keys = jwks.keys;
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Invalid or expired token")]
    InvalidToken,
    #[error("Missing authorization header")]
    MissingToken,
    #[error("OIDC provider unavailable")]
    OidcProviderUnavailable,
}

impl From<AuthError> for StatusCode {
    fn from(err: AuthError) -> Self {
        match err {
            AuthError::InvalidToken => StatusCode::UNAUTHORIZED,
            AuthError::MissingToken => StatusCode::UNAUTHORIZED,
            AuthError::OidcProviderUnavailable => StatusCode::SERVICE_UNAVAILABLE,
        }
    }
}

/// JSON error response for auth failures
fn auth_error_response(status: StatusCode, error: &str, message: &str) -> Response {
    (
        status,
        Json(serde_json::json!({ "error": error, "message": message })),
    )
        .into_response()
}

/// Extractor that validates the Bearer token and provides Claims
pub struct AuthUser(pub Claims);

impl FromRequestParts<Arc<crate::AppState>> for AuthUser {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<crate::AppState>,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                auth_error_response(
                    StatusCode::UNAUTHORIZED,
                    "missing_token",
                    "Authorization header required",
                )
            })?;

        let token = auth_header.strip_prefix("Bearer ").ok_or_else(|| {
            auth_error_response(
                StatusCode::UNAUTHORIZED,
                "invalid_header",
                "Expected Bearer token",
            )
        })?;

        let claims = state
            .jwks
            .validate_token(token)
            .await
            .map_err(|e| match e {
                AuthError::InvalidToken => auth_error_response(
                    StatusCode::UNAUTHORIZED,
                    "invalid_token",
                    "Token is invalid or expired",
                ),
                AuthError::MissingToken => auth_error_response(
                    StatusCode::UNAUTHORIZED,
                    "missing_token",
                    "Authorization header required",
                ),
                AuthError::OidcProviderUnavailable => auth_error_response(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "auth_unavailable",
                    "Authentication service unavailable",
                ),
            })?;

        Ok(AuthUser(claims))
    }
}
