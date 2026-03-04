use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
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
    pub exp: u64,
    pub iat: u64,
    pub iss: String,
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
    pub fn new(keycloak_url: &str, realm: &str) -> Self {
        Self {
            certs_url: format!("{}/realms/{}/protocol/openid-connect/certs", keycloak_url, realm),
            keys: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn validate_token(&self, token: &str) -> Result<Claims, AuthError> {
        // Get the kid from the token header
        let header = jsonwebtoken::decode_header(token)
            .map_err(|_| AuthError::InvalidToken)?;
        let kid = header.kid.ok_or(AuthError::InvalidToken)?;

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

        decode::<Claims>(token, &decoding_key, &validation)
            .ok()
            .map(|data| data.claims)
    }

    async fn refresh_keys(&self) -> Result<(), AuthError> {
        let resp = reqwest::get(&self.certs_url)
            .await
            .map_err(|_| AuthError::KeycloakUnavailable)?;

        let jwks: JwksResponse = resp.json()
            .await
            .map_err(|_| AuthError::KeycloakUnavailable)?;

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
    #[error("Keycloak unavailable")]
    KeycloakUnavailable,
}

impl From<AuthError> for StatusCode {
    fn from(err: AuthError) -> Self {
        match err {
            AuthError::InvalidToken => StatusCode::UNAUTHORIZED,
            AuthError::MissingToken => StatusCode::UNAUTHORIZED,
            AuthError::KeycloakUnavailable => StatusCode::SERVICE_UNAVAILABLE,
        }
    }
}

/// Extractor that validates the Bearer token and provides Claims
pub struct AuthUser(pub Claims);

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    Arc<crate::AppState>: FromRef<S>,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = Arc::<crate::AppState>::from_ref(state);

        let auth_header = parts.headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let claims = app_state.jwks.validate_token(token)
            .await
            .map_err(StatusCode::from)?;

        Ok(AuthUser(claims))
    }
}

// Helper trait for FromRef pattern
use std::convert::From;

trait FromRef<T> {
    fn from_ref(input: &T) -> Self;
}

impl FromRef<Arc<crate::AppState>> for Arc<crate::AppState> {
    fn from_ref(input: &Arc<crate::AppState>) -> Self {
        input.clone()
    }
}
