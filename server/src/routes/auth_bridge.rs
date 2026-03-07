//! Hydra/Kratos auth bridge endpoints.
//!
//! These are unauthenticated endpoints that sit between the frontend login/consent
//! UI and the Hydra Admin API (`HYDRA_ADMIN_URL`, default `http://hydra:4445`).
//! They proxy requests to Hydra so the frontend never needs direct access to the
//! admin port.

use axum::{extract::Query, http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;
use serde_json::Value;

fn hydra_admin_url() -> String {
    std::env::var("HYDRA_ADMIN_URL").unwrap_or_else(|_| "http://hydra:4445".to_string())
}

fn kratos_admin_url() -> String {
    std::env::var("KRATOS_ADMIN_URL").unwrap_or_else(|_| "http://kratos:4434".to_string())
}

/// Shared error helper: turn a reqwest error or unexpected status into a 502.
async fn hydra_error(status: reqwest::StatusCode, body: String) -> (StatusCode, Json<Value>) {
    tracing::warn!(hydra_status = %status, body = %body, "Hydra Admin API error");
    (
        StatusCode::BAD_GATEWAY,
        Json(serde_json::json!({
            "error": "hydra_error",
            "hydra_status": status.as_u16(),
            "detail": body,
        })),
    )
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct LoginChallengeQuery {
    pub login_challenge: String,
}

/// GET /api/auth/login
///
/// Fetches the Hydra login request for the given challenge.
/// If `skip` is true in Hydra's response the challenge is auto-accepted and
/// the `redirect_to` URL is returned instead.
pub async fn get_login_request(Query(params): Query<LoginChallengeQuery>) -> impl IntoResponse {
    let base = hydra_admin_url();
    let url = format!(
        "{}/admin/oauth2/auth/requests/login?login_challenge={}",
        base, params.login_challenge
    );

    let client = reqwest::Client::new();
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Failed to reach Hydra Admin API: {e}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_unreachable", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    let status = resp.status();
    let body: Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_bad_response", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    if !status.is_success() {
        return hydra_error(status, body.to_string()).await.into_response();
    }

    // If Hydra says skip=true we auto-accept with the existing subject.
    if body.get("skip").and_then(Value::as_bool).unwrap_or(false) {
        let subject = body
            .get("subject")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let challenge = params.login_challenge.clone();
        return accept_login_challenge_inner(&client, &base, &challenge, &subject, false, 0)
            .await
            .into_response();
    }

    (StatusCode::OK, Json(body)).into_response()
}

/// PUT /api/auth/login/accept
///
/// Accepts the Hydra login challenge after Kratos authentication succeeds.
/// Body: `{ "subject": "<kratos_identity_id>", "remember": bool, "remember_for": seconds }`
/// Returns: `{ "redirect_to": "..." }`
pub async fn accept_login(
    Query(params): Query<LoginChallengeQuery>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let base = hydra_admin_url();
    let client = reqwest::Client::new();

    let subject = body
        .get("subject")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let remember = body
        .get("remember")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let remember_for = body
        .get("remember_for")
        .and_then(Value::as_i64)
        .unwrap_or(3600);

    accept_login_challenge_inner(
        &client,
        &base,
        &params.login_challenge,
        &subject,
        remember,
        remember_for,
    )
    .await
    .into_response()
}

async fn accept_login_challenge_inner(
    client: &reqwest::Client,
    base: &str,
    challenge: &str,
    subject: &str,
    remember: bool,
    remember_for: i64,
) -> impl IntoResponse {
    let url = format!(
        "{}/admin/oauth2/auth/requests/login/accept?login_challenge={}",
        base, challenge
    );
    let payload = serde_json::json!({
        "subject": subject,
        "remember": remember,
        "remember_for": remember_for,
    });

    let resp = match client.put(&url).json(&payload).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Failed to reach Hydra Admin API (accept login): {e}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_unreachable", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    let status = resp.status();
    let body: Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_bad_response", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    if !status.is_success() {
        return hydra_error(status, body.to_string()).await.into_response();
    }

    (StatusCode::OK, Json(body)).into_response()
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ConsentChallengeQuery {
    pub consent_challenge: String,
}

/// GET /api/auth/consent
///
/// Fetches the Hydra consent request for the given challenge.
pub async fn get_consent_request(Query(params): Query<ConsentChallengeQuery>) -> impl IntoResponse {
    let url = format!(
        "{}/admin/oauth2/auth/requests/consent?consent_challenge={}",
        hydra_admin_url(),
        params.consent_challenge
    );

    let client = reqwest::Client::new();
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Failed to reach Hydra Admin API (get consent): {e}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_unreachable", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    let status = resp.status();
    let body: Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_bad_response", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    if !status.is_success() {
        return hydra_error(status, body.to_string()).await.into_response();
    }

    (StatusCode::OK, Json(body)).into_response()
}

/// PUT /api/auth/consent/accept
///
/// Accepts the Hydra consent challenge.
/// Body: `{ "grant_scope": [...], "grant_access_token_audience": [...], "remember": bool, "remember_for": seconds }`
/// Returns: `{ "redirect_to": "..." }`
///
/// Enriches the consent with user profile claims (name, email) from Kratos
/// so they appear in the JWT access token and ID token.
pub async fn accept_consent(
    Query(params): Query<ConsentChallengeQuery>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let base = hydra_admin_url();
    let client = reqwest::Client::new();

    // 1. Fetch the consent request to get the subject (Kratos identity ID)
    let consent_url = format!(
        "{}/admin/oauth2/auth/requests/consent?consent_challenge={}",
        base, params.consent_challenge
    );
    let subject = match client.get(&consent_url).send().await {
        Ok(r) if r.status().is_success() => {
            let consent_data: Value = r.json().await.unwrap_or_default();
            consent_data
                .get("subject")
                .and_then(Value::as_str)
                .map(String::from)
        }
        _ => None,
    };

    // 2. Fetch Kratos identity traits for the subject
    let mut session_claims = serde_json::json!({});
    if let Some(ref sub) = subject {
        let kratos_admin = kratos_admin_url();
        let identity_url = format!("{}/admin/identities/{}", kratos_admin, sub);
        match client.get(&identity_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(identity) = resp.json::<Value>().await {
                    let traits = identity.get("traits").cloned().unwrap_or_default();
                    let email = traits.get("email").and_then(Value::as_str);
                    let name = traits.get("name").and_then(Value::as_str);

                    let mut claims = serde_json::Map::new();
                    if let Some(email) = email {
                        claims.insert("email".into(), Value::String(email.to_string()));
                        claims.insert(
                            "preferred_username".into(),
                            Value::String(email.to_string()),
                        );
                    }
                    if let Some(name) = name {
                        claims.insert("name".into(), Value::String(name.to_string()));
                    }
                    session_claims = Value::Object(claims);
                }
            }
            Ok(resp) => {
                tracing::warn!(
                    status = %resp.status(),
                    "Failed to fetch Kratos identity for {sub}"
                );
            }
            Err(e) => {
                tracing::warn!("Kratos admin unreachable: {e}");
            }
        }
    }

    // 3. Merge session claims into the consent accept body
    let mut enriched = body.clone();
    if let Value::Object(ref mut map) = enriched {
        let mut session = serde_json::Map::new();
        session.insert("access_token".into(), session_claims.clone());
        session.insert("id_token".into(), session_claims);
        map.insert("session".into(), Value::Object(session));
    }

    // 4. Accept consent with enriched body
    let url = format!(
        "{}/admin/oauth2/auth/requests/consent/accept?consent_challenge={}",
        base, params.consent_challenge
    );

    let resp = match client.put(&url).json(&enriched).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Failed to reach Hydra Admin API (accept consent): {e}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_unreachable", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    let status = resp.status();
    let resp_body: Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_bad_response", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    if !status.is_success() {
        return hydra_error(status, resp_body.to_string())
            .await
            .into_response();
    }

    (StatusCode::OK, Json(resp_body)).into_response()
}

/// PUT /api/auth/consent/reject
///
/// Rejects the Hydra consent challenge.
/// Returns: `{ "redirect_to": "..." }`
pub async fn reject_consent(
    Query(params): Query<ConsentChallengeQuery>,
    body: Option<Json<Value>>,
) -> impl IntoResponse {
    let url = format!(
        "{}/admin/oauth2/auth/requests/consent/reject?consent_challenge={}",
        hydra_admin_url(),
        params.consent_challenge
    );

    let payload = body.map(|Json(v)| v).unwrap_or(serde_json::json!({}));

    let client = reqwest::Client::new();
    let resp = match client.put(&url).json(&payload).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Failed to reach Hydra Admin API (reject consent): {e}");
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_unreachable", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    let status = resp.status();
    let resp_body: Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "hydra_bad_response", "detail": e.to_string()})),
            )
                .into_response();
        }
    };

    if !status.is_success() {
        return hydra_error(status, resp_body.to_string())
            .await
            .into_response();
    }

    (StatusCode::OK, Json(resp_body)).into_response()
}
