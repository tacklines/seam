use std::{convert::Infallible, fmt::Display, sync::Arc, task::Poll};

use bytes::Bytes;
use futures::future::BoxFuture;
use http::{Request, Response, StatusCode};
use http_body::Body;
use http_body_util::{combinators::BoxBody, BodyExt, Full};
use uuid::Uuid;

use crate::auth::JwksCache;

/// Authenticated MCP caller identity, injected into request extensions.
/// Tool handlers access this via `Extension(parts)` → `parts.extensions.get::<Arc<McpIdentity>>()`.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct McpIdentity {
    /// Hydra subject (JWT `sub` claim)
    pub subject: String,
    /// Human-readable name
    pub display_name: String,
    /// The user ID in our DB
    pub user_id: Option<Uuid>,
    /// Which auth method was used
    pub auth_method: AuthMethod,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AuthMethod {
    Jwt,
}

/// Tower layer that validates Bearer JWT tokens for the MCP endpoint.
///
/// Injects `Arc<McpIdentity>` into request extensions so MCP tool handlers
/// can access them via `Extension(parts): Extension<http::request::Parts>`.
#[derive(Clone)]
pub struct McpAuthLayer {
    jwks: JwksCache,
    enabled: bool,
    /// Public base URL of this server, used for RFC 9728 resource_metadata in WWW-Authenticate.
    resource_url: String,
}

impl McpAuthLayer {
    pub fn new(jwks: JwksCache, enabled: bool, resource_url: String) -> Self {
        Self {
            jwks,
            enabled,
            resource_url,
        }
    }
}

impl<S> tower::Layer<S> for McpAuthLayer {
    type Service = McpAuthService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        McpAuthService {
            inner,
            jwks: self.jwks.clone(),
            enabled: self.enabled,
            resource_url: self.resource_url.clone(),
        }
    }
}

#[derive(Clone)]
pub struct McpAuthService<S> {
    inner: S,
    jwks: JwksCache,
    enabled: bool,
    resource_url: String,
}

/// rmcp's StreamableHttpService returns Response<BoxBody<Bytes, Infallible>>
type McpResponse = Response<BoxBody<Bytes, Infallible>>;

/// Build a 401 response with RFC 9728 `WWW-Authenticate` header.
/// The `resource_metadata` parameter tells MCP clients (like Claude Code)
/// where to discover OAuth configuration for this protected resource.
fn unauthorized_response(message: &str, resource_url: &str) -> McpResponse {
    let body = serde_json::json!({
        "error": "unauthorized",
        "message": message,
    });
    let www_authenticate = format!(
        "Bearer resource_metadata=\"{}/.well-known/oauth-protected-resource\"",
        resource_url.trim_end_matches('/')
    );
    Response::builder()
        .status(StatusCode::UNAUTHORIZED)
        .header("content-type", "application/json")
        .header("www-authenticate", &www_authenticate)
        .body(Full::new(Bytes::from(body.to_string())).boxed())
        .expect("valid response")
}

impl<S, ReqBody> tower_service::Service<Request<ReqBody>> for McpAuthService<S>
where
    S: tower_service::Service<Request<ReqBody>, Response = McpResponse, Error = Infallible>
        + Clone
        + Send
        + 'static,
    S::Future: Send,
    ReqBody: Body + Send + 'static,
    ReqBody::Error: Display,
    ReqBody::Data: Send,
{
    type Response = McpResponse;
    type Error = Infallible;
    type Future = BoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut std::task::Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: Request<ReqBody>) -> Self::Future {
        // Auth disabled — pass through
        if !self.enabled {
            let mut inner = self.inner.clone();
            return Box::pin(async move { inner.call(req).await });
        }

        let jwks = self.jwks.clone();
        let resource_url = self.resource_url.clone();
        let mut inner = self.inner.clone();

        Box::pin(async move {
            // Extract Bearer token
            let token = req
                .headers()
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.strip_prefix("Bearer "));

            let Some(token) = token else {
                return Ok(unauthorized_response(
                    "Authorization header with Bearer token required",
                    &resource_url,
                ));
            };

            // Validate JWT
            let identity = match jwks.validate_token(token).await {
                Ok(claims) => McpIdentity {
                    subject: claims.sub.clone(),
                    display_name: claims
                        .resolved_username()
                        .or_else(|| claims.resolved_name())
                        .unwrap_or(&claims.sub)
                        .to_string(),
                    user_id: None,
                    auth_method: AuthMethod::Jwt,
                },
                Err(_) => {
                    return Ok(unauthorized_response(
                        "Invalid or expired token",
                        &resource_url,
                    ))
                }
            };

            // Inject identity into request extensions for tool handlers.
            // rmcp's StreamableHttpService calls req.into_parts() and injects
            // the Parts (including extensions) into the MCP context, so tool
            // handlers can access Arc<McpIdentity> via Extension(parts).
            req.extensions_mut().insert(Arc::new(identity));
            inner.call(req).await
        })
    }
}
