use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use std::sync::Arc;

use crate::AppState;

#[derive(Debug, Serialize)]
pub struct CoderStatus {
    pub enabled: bool,
    pub connected: bool,
    pub url: Option<String>,
    pub user: Option<String>,
    pub error: Option<String>,
    pub templates: Vec<String>,
}

/// GET /api/integrations/coder/status
/// Check Coder connectivity and list available templates.
pub async fn coder_status(
    State(state): State<Arc<AppState>>,
) -> Result<Json<CoderStatus>, StatusCode> {
    let coder = match &state.coder {
        Some(c) => c,
        None => {
            return Ok(Json(CoderStatus {
                enabled: false,
                connected: false,
                url: None,
                user: None,
                error: None,
                templates: vec![],
            }));
        }
    };

    // Try to reach Coder and get user info
    match coder.me().await {
        Ok(user) => {
            // Also fetch templates
            let templates = coder
                .list_templates()
                .await
                .map(|ts| ts.into_iter().map(|t| t.name).collect())
                .unwrap_or_default();

            Ok(Json(CoderStatus {
                enabled: true,
                connected: true,
                url: Some(std::env::var("CODER_URL").unwrap_or_default()),
                user: Some(user.username),
                error: None,
                templates,
            }))
        }
        Err(e) => Ok(Json(CoderStatus {
            enabled: true,
            connected: false,
            url: Some(std::env::var("CODER_URL").unwrap_or_default()),
            user: None,
            error: Some(e.to_string()),
            templates: vec![],
        })),
    }
}
