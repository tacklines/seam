use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Thin HTTP client for Coder's REST API.
///
/// Coder API docs: https://coder.com/docs/api
pub struct CoderClient {
    client: Client,
    base_url: String,
    token: String,
}

#[derive(Debug, thiserror::Error)]
pub enum CoderError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("Coder API error {status}: {message}")]
    Api { status: u16, message: String },
    #[error("Coder not configured")]
    NotConfigured,
}

// --- Coder API response types ---

#[derive(Debug, Deserialize)]
pub struct CoderWorkspace {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid,
    pub owner_name: String,
    pub template_id: Uuid,
    pub template_name: String,
    pub latest_build: CoderWorkspaceBuild,
}

#[derive(Debug, Deserialize)]
pub struct CoderWorkspaceBuild {
    pub id: Uuid,
    pub status: String,
    pub job: CoderProvisionerJob,
}

#[derive(Debug, Deserialize)]
pub struct CoderProvisionerJob {
    pub id: Uuid,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CoderTemplate {
    pub id: Uuid,
    pub name: String,
    pub organization_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct CoderUser {
    pub id: Uuid,
    pub username: String,
    pub email: String,
}

// --- Request types ---

#[derive(Debug, Serialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
    pub template_id: Uuid,
    pub rich_parameter_values: Vec<RichParameterValue>,
}

#[derive(Debug, Serialize)]
pub struct RichParameterValue {
    pub name: String,
    pub value: String,
}

impl CoderClient {
    /// Create a new Coder client. Returns None if CODER_URL is not set.
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var("CODER_URL").ok()?;
        let token = std::env::var("CODER_TOKEN").unwrap_or_default();
        Some(Self::new(base_url, token))
    }

    pub fn new(base_url: String, token: String) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}/api/v2{}", self.base_url, path)
    }

    async fn check_response(
        &self,
        resp: reqwest::Response,
    ) -> Result<reqwest::Response, CoderError> {
        if resp.status().is_success() {
            Ok(resp)
        } else {
            let status = resp.status().as_u16();
            let message = resp.text().await.unwrap_or_else(|_| "unknown error".into());
            Err(CoderError::Api { status, message })
        }
    }

    // --- User ---

    /// Get the authenticated user's info
    pub async fn me(&self) -> Result<CoderUser, CoderError> {
        let resp = self
            .client
            .get(self.url("/users/me"))
            .header("Coder-Session-Token", &self.token)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    // --- Templates ---

    /// List templates in the default organization
    pub async fn list_templates(&self) -> Result<Vec<CoderTemplate>, CoderError> {
        let resp = self
            .client
            .get(self.url("/templates"))
            .header("Coder-Session-Token", &self.token)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Get a template by name (searches default org)
    pub async fn get_template_by_name(
        &self,
        name: &str,
    ) -> Result<Option<CoderTemplate>, CoderError> {
        let templates = self.list_templates().await?;
        Ok(templates.into_iter().find(|t| t.name == name))
    }

    // --- Workspaces ---

    /// Create a workspace
    pub async fn create_workspace(
        &self,
        owner: &str,
        req: CreateWorkspaceRequest,
    ) -> Result<CoderWorkspace, CoderError> {
        let resp = self
            .client
            .post(self.url(&format!("/users/{}/workspaces", owner)))
            .header("Coder-Session-Token", &self.token)
            .json(&req)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Get workspace by ID
    pub async fn get_workspace(&self, id: Uuid) -> Result<CoderWorkspace, CoderError> {
        let resp = self
            .client
            .get(self.url(&format!("/workspaces/{}", id)))
            .header("Coder-Session-Token", &self.token)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Start a workspace (create a new build with "start" transition)
    pub async fn start_workspace(&self, id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
        let resp = self
            .client
            .put(self.url(&format!("/workspaces/{}/builds", id)))
            .header("Coder-Session-Token", &self.token)
            .json(&serde_json::json!({ "transition": "start" }))
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Stop a workspace
    pub async fn stop_workspace(&self, id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
        let resp = self
            .client
            .put(self.url(&format!("/workspaces/{}/builds", id)))
            .header("Coder-Session-Token", &self.token)
            .json(&serde_json::json!({ "transition": "stop" }))
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    /// Delete a workspace
    pub async fn delete_workspace(&self, id: Uuid) -> Result<(), CoderError> {
        let resp = self
            .client
            .delete(self.url(&format!("/workspaces/{}", id)))
            .header("Coder-Session-Token", &self.token)
            .send()
            .await?;
        self.check_response(resp).await?;
        Ok(())
    }
}
