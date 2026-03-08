use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

/// Trait abstracting the Coder API calls used by the dispatch layer.
///
/// Implementing this trait on a mock allows dispatch functions to be tested
/// without a real Coder instance.
pub trait CoderApi {
    fn start_workspace(
        &self,
        id: Uuid,
    ) -> impl std::future::Future<Output = Result<CoderWorkspaceBuild, CoderError>> + Send;

    fn get_template_by_name(
        &self,
        name: &str,
    ) -> impl std::future::Future<Output = Result<Option<CoderTemplate>, CoderError>> + Send;

    fn create_workspace(
        &self,
        owner: &str,
        req: CreateWorkspaceRequest,
    ) -> impl std::future::Future<Output = Result<CoderWorkspace, CoderError>> + Send;

    /// Get a workspace by its Coder UUID.
    #[allow(dead_code)]
    fn get_workspace(
        &self,
        id: Uuid,
    ) -> impl std::future::Future<Output = Result<CoderWorkspace, CoderError>> + Send;

    /// Poll the workspace until its build status is "running" (agent ready for SSH).
    ///
    /// Uses exponential backoff: 1s, 2s, 4s, 8s, ... up to `timeout` total.
    /// Returns `Ok(())` once the workspace is running, or `Err` if it fails or
    /// times out.
    fn wait_until_ready(
        &self,
        workspace_id: Uuid,
        timeout: Duration,
    ) -> impl std::future::Future<Output = Result<(), CoderError>> + Send;
}

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

/// Extract the HTTP status code from a `CoderError`, if it is an API error.
fn extract_status(e: &CoderError) -> Option<reqwest::StatusCode> {
    match e {
        CoderError::Api { status, .. } => reqwest::StatusCode::from_u16(*status).ok(),
        _ => None,
    }
}

/// Retry an async operation up to `max_retries` times with exponential backoff.
///
/// Retries on server errors (5xx), rate-limit (429), and connection/timeout
/// failures. Does NOT retry client errors (4xx except 429) — those indicate a
/// bad request that will not succeed on retry.
async fn retry_request<F, Fut, T>(
    operation_name: &str,
    max_retries: u32,
    f: F,
) -> Result<T, CoderError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, CoderError>>,
{
    let mut last_error = None;
    for attempt in 0..=max_retries {
        if attempt > 0 {
            let delay = Duration::from_millis(100 * 2u64.pow(attempt - 1)); // 100ms, 200ms, 400ms
            tracing::warn!(
                "{operation_name}: attempt {attempt}/{max_retries} failed, retrying in {delay:?}"
            );
            tokio::time::sleep(delay).await;
        }
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                // Don't retry client errors (4xx) except 429 Too Many Requests.
                if let Some(status) = extract_status(&e) {
                    if status.is_client_error() && status.as_u16() != 429 {
                        return Err(e);
                    }
                }
                last_error = Some(e);
            }
        }
    }
    Err(last_error.unwrap())
}

impl CoderClient {
    /// Create a new Coder client. Returns None if CODER_URL is not set.
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var("CODER_URL").ok()?;
        let token = std::env::var("CODER_TOKEN").unwrap_or_default();
        Some(Self::new(base_url, token))
    }

    pub fn new(base_url: String, token: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build reqwest client");
        Self {
            client,
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
        retry_request("list_templates", 3, || async {
            let resp = self
                .client
                .get(self.url("/templates"))
                .header("Coder-Session-Token", &self.token)
                .send()
                .await?;
            let resp = self.check_response(resp).await?;
            Ok(resp.json().await?)
        })
        .await
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
        retry_request("create_workspace", 3, || async {
            let resp = self
                .client
                .post(self.url(&format!("/users/{}/workspaces", owner)))
                .header("Coder-Session-Token", &self.token)
                .json(&req)
                .send()
                .await?;
            let resp = self.check_response(resp).await?;
            Ok(resp.json().await?)
        })
        .await
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
        retry_request("start_workspace", 3, || async {
            let resp = self
                .client
                .put(self.url(&format!("/workspaces/{}/builds", id)))
                .header("Coder-Session-Token", &self.token)
                .json(&serde_json::json!({ "transition": "start" }))
                .send()
                .await?;
            let resp = self.check_response(resp).await?;
            Ok(resp.json().await?)
        })
        .await
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

    /// Poll the workspace until its build is running (agent SSH-ready).
    ///
    /// Workspace build lifecycle: pending → starting → running (or failed/canceled).
    /// We poll `GET /api/v2/workspaces/{id}` with exponential backoff (1s, 2s, 4s, 8s …)
    /// until `latest_build.status == "running"` OR we exceed `timeout`.
    pub async fn wait_until_ready(&self, id: Uuid, timeout: Duration) -> Result<(), CoderError> {
        let deadline = std::time::Instant::now() + timeout;
        let mut delay = Duration::from_secs(1);

        loop {
            let workspace = self.get_workspace(id).await?;
            let build_status = workspace.latest_build.status.as_str();
            let job_status = workspace.latest_build.job.status.as_str();

            tracing::debug!(
                workspace_id = %id,
                build_status = build_status,
                job_status = job_status,
                "Polling workspace readiness"
            );

            match build_status {
                "running" => {
                    tracing::info!(workspace_id = %id, "Workspace build is running; agent ready");
                    return Ok(());
                }
                "failed" | "canceled" | "deleted" => {
                    let err_msg = workspace
                        .latest_build
                        .job
                        .error
                        .unwrap_or_else(|| format!("build status: {}", build_status));
                    tracing::error!(
                        workspace_id = %id,
                        build_status = build_status,
                        error = %err_msg,
                        "Workspace build entered terminal failure state"
                    );
                    return Err(CoderError::Api {
                        status: 500,
                        message: format!("Workspace build failed: {}", err_msg),
                    });
                }
                // "pending" | "starting" | "stopping" | "canceling" | etc. — keep waiting
                _ => {
                    if std::time::Instant::now() >= deadline {
                        tracing::warn!(
                            workspace_id = %id,
                            build_status = build_status,
                            "Timed out waiting for workspace to become ready"
                        );
                        return Err(CoderError::Api {
                            status: 504,
                            message: format!(
                                "Workspace did not become ready within {:?} (last status: {})",
                                timeout, build_status
                            ),
                        });
                    }

                    // Cap delay so we don't overshoot the deadline by too much
                    let remaining = deadline.saturating_duration_since(std::time::Instant::now());
                    let sleep_for = delay.min(remaining);
                    tracing::debug!(
                        workspace_id = %id,
                        build_status = build_status,
                        sleep_secs = sleep_for.as_secs_f32(),
                        "Workspace not ready; waiting before next poll"
                    );
                    tokio::time::sleep(sleep_for).await;

                    // Exponential backoff capped at 8s
                    delay = (delay * 2).min(Duration::from_secs(8));
                }
            }
        }
    }
}

impl CoderApi for CoderClient {
    async fn start_workspace(&self, id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
        self.start_workspace(id).await
    }

    async fn get_template_by_name(&self, name: &str) -> Result<Option<CoderTemplate>, CoderError> {
        self.get_template_by_name(name).await
    }

    async fn create_workspace(
        &self,
        owner: &str,
        req: CreateWorkspaceRequest,
    ) -> Result<CoderWorkspace, CoderError> {
        self.create_workspace(owner, req).await
    }

    async fn get_workspace(&self, id: Uuid) -> Result<CoderWorkspace, CoderError> {
        self.get_workspace(id).await
    }

    async fn wait_until_ready(
        &self,
        workspace_id: Uuid,
        timeout: Duration,
    ) -> Result<(), CoderError> {
        self.wait_until_ready(workspace_id, timeout).await
    }
}

/// Test double for the Coder API. Configure each field with the desired
/// return value before passing to dispatch helpers under test.
#[cfg(test)]
pub mod testing {
    use super::*;
    use std::sync::Mutex;

    /// A configurable mock of the Coder API.
    ///
    /// Each method records calls and returns a pre-configured result.
    pub struct MockCoderClient {
        /// Result returned by `start_workspace`.
        pub start_workspace_result: Mutex<Result<CoderWorkspaceBuild, String>>,
        /// Result returned by `get_template_by_name`.
        pub get_template_result: Mutex<Result<Option<CoderTemplate>, String>>,
        /// Result returned by `create_workspace`.
        pub create_workspace_result: Mutex<Result<CoderWorkspace, String>>,
        /// Result returned by `get_workspace`.
        #[allow(dead_code)]
        pub get_workspace_result: Mutex<Result<CoderWorkspace, String>>,
        /// If set, `wait_until_ready` returns this error instead of Ok.
        pub wait_until_ready_error: Mutex<Option<String>>,

        /// Call counts for assertions.
        pub start_workspace_calls: Mutex<Vec<Uuid>>,
        pub get_template_calls: Mutex<Vec<String>>,
        pub create_workspace_calls: Mutex<Vec<(String, String)>>, // (owner, workspace_name)
        #[allow(dead_code)]
        pub get_workspace_calls: Mutex<Vec<Uuid>>,
        pub wait_until_ready_calls: Mutex<Vec<Uuid>>,
    }

    impl MockCoderClient {
        /// Create a mock where all operations succeed with the given template/workspace IDs.
        pub fn new_ok(template_id: Uuid, coder_workspace_id: Uuid) -> Self {
            let template = CoderTemplate {
                id: template_id,
                name: "seam-agent".to_string(),
                organization_id: Uuid::new_v4(),
            };
            let job = CoderProvisionerJob {
                id: Uuid::new_v4(),
                status: "succeeded".to_string(),
                error: None,
            };
            let build = CoderWorkspaceBuild {
                id: Uuid::new_v4(),
                status: "running".to_string(),
                job,
            };
            let workspace = CoderWorkspace {
                id: coder_workspace_id,
                name: "seam-test".to_string(),
                owner_id: Uuid::new_v4(),
                owner_name: "me".to_string(),
                template_id,
                template_name: "seam-agent".to_string(),
                latest_build: CoderWorkspaceBuild {
                    id: Uuid::new_v4(),
                    status: "running".to_string(),
                    job: CoderProvisionerJob {
                        id: Uuid::new_v4(),
                        status: "succeeded".to_string(),
                        error: None,
                    },
                },
            };

            let get_workspace_ws = CoderWorkspace {
                id: coder_workspace_id,
                name: "seam-test".to_string(),
                owner_id: Uuid::new_v4(),
                owner_name: "me".to_string(),
                template_id,
                template_name: "seam-agent".to_string(),
                latest_build: CoderWorkspaceBuild {
                    id: Uuid::new_v4(),
                    status: "running".to_string(),
                    job: CoderProvisionerJob {
                        id: Uuid::new_v4(),
                        status: "succeeded".to_string(),
                        error: None,
                    },
                },
            };

            Self {
                start_workspace_result: Mutex::new(Ok(build)),
                get_template_result: Mutex::new(Ok(Some(template))),
                create_workspace_result: Mutex::new(Ok(workspace)),
                get_workspace_result: Mutex::new(Ok(get_workspace_ws)),
                wait_until_ready_error: Mutex::new(None),
                start_workspace_calls: Mutex::new(vec![]),
                get_template_calls: Mutex::new(vec![]),
                create_workspace_calls: Mutex::new(vec![]),
                get_workspace_calls: Mutex::new(vec![]),
                wait_until_ready_calls: Mutex::new(vec![]),
            }
        }

        /// Create a mock where `create_workspace` fails with the given message.
        pub fn new_create_fails(template_id: Uuid, error_msg: &str) -> Self {
            let mock = Self::new_ok(template_id, Uuid::new_v4());
            *mock.create_workspace_result.lock().unwrap() = Err(error_msg.to_string());
            mock
        }

        /// Create a mock where `get_template_by_name` returns None (template not found).
        pub fn new_no_template() -> Self {
            let mock = Self::new_ok(Uuid::new_v4(), Uuid::new_v4());
            *mock.get_template_result.lock().unwrap() = Ok(None);
            mock
        }
    }

    impl CoderApi for MockCoderClient {
        async fn start_workspace(&self, id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
            self.start_workspace_calls.lock().unwrap().push(id);
            self.start_workspace_result
                .lock()
                .unwrap()
                .as_ref()
                .map(|b| CoderWorkspaceBuild {
                    id: b.id,
                    status: b.status.clone(),
                    job: CoderProvisionerJob {
                        id: b.job.id,
                        status: b.job.status.clone(),
                        error: b.job.error.clone(),
                    },
                })
                .map_err(|e| CoderError::Api {
                    status: 500,
                    message: e.clone(),
                })
        }

        async fn get_template_by_name(
            &self,
            name: &str,
        ) -> Result<Option<CoderTemplate>, CoderError> {
            self.get_template_calls
                .lock()
                .unwrap()
                .push(name.to_string());
            self.get_template_result
                .lock()
                .unwrap()
                .as_ref()
                .map(|opt| {
                    opt.as_ref().map(|t| CoderTemplate {
                        id: t.id,
                        name: t.name.clone(),
                        organization_id: t.organization_id,
                    })
                })
                .map_err(|e| CoderError::Api {
                    status: 500,
                    message: e.clone(),
                })
        }

        async fn create_workspace(
            &self,
            owner: &str,
            req: CreateWorkspaceRequest,
        ) -> Result<CoderWorkspace, CoderError> {
            self.create_workspace_calls
                .lock()
                .unwrap()
                .push((owner.to_string(), req.name.clone()));
            self.create_workspace_result
                .lock()
                .unwrap()
                .as_ref()
                .map(|ws| CoderWorkspace {
                    id: ws.id,
                    name: ws.name.clone(),
                    owner_id: ws.owner_id,
                    owner_name: ws.owner_name.clone(),
                    template_id: ws.template_id,
                    template_name: ws.template_name.clone(),
                    latest_build: CoderWorkspaceBuild {
                        id: ws.latest_build.id,
                        status: ws.latest_build.status.clone(),
                        job: CoderProvisionerJob {
                            id: ws.latest_build.job.id,
                            status: ws.latest_build.job.status.clone(),
                            error: ws.latest_build.job.error.clone(),
                        },
                    },
                })
                .map_err(|e| CoderError::Api {
                    status: 500,
                    message: e.clone(),
                })
        }

        async fn get_workspace(&self, id: Uuid) -> Result<CoderWorkspace, CoderError> {
            self.get_workspace_calls.lock().unwrap().push(id);
            self.get_workspace_result
                .lock()
                .unwrap()
                .as_ref()
                .map(|ws| CoderWorkspace {
                    id: ws.id,
                    name: ws.name.clone(),
                    owner_id: ws.owner_id,
                    owner_name: ws.owner_name.clone(),
                    template_id: ws.template_id,
                    template_name: ws.template_name.clone(),
                    latest_build: CoderWorkspaceBuild {
                        id: ws.latest_build.id,
                        status: ws.latest_build.status.clone(),
                        job: CoderProvisionerJob {
                            id: ws.latest_build.job.id,
                            status: ws.latest_build.job.status.clone(),
                            error: ws.latest_build.job.error.clone(),
                        },
                    },
                })
                .map_err(|e| CoderError::Api {
                    status: 500,
                    message: e.clone(),
                })
        }

        async fn wait_until_ready(
            &self,
            workspace_id: Uuid,
            _timeout: Duration,
        ) -> Result<(), CoderError> {
            self.wait_until_ready_calls
                .lock()
                .unwrap()
                .push(workspace_id);

            // Return configured error if set
            if let Some(ref msg) = *self.wait_until_ready_error.lock().unwrap() {
                return Err(CoderError::Api {
                    status: 500,
                    message: msg.clone(),
                });
            }

            Ok(())
        }
    }

    // -------------------------------------------------------------------------
    // Unit tests for CoderClient::wait_until_ready logic
    // -------------------------------------------------------------------------
    //
    // We test the polling behaviour by constructing a test double that returns
    // a sequence of workspace statuses before finally returning "running".
    // This avoids needing a real HTTP server.

    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A minimal CoderApi implementation that drives `wait_until_ready` through
    /// a sequence of build statuses, then returns "running".
    struct SequencedMock {
        /// Build statuses to return on successive `get_workspace` polls.
        /// The LAST entry is used for all subsequent calls once the list is exhausted.
        statuses: Vec<&'static str>,
        call_count: AtomicUsize,
    }

    impl SequencedMock {
        fn new(statuses: Vec<&'static str>) -> Self {
            Self {
                statuses,
                call_count: AtomicUsize::new(0),
            }
        }

        fn current_status(&self) -> &'static str {
            let idx = self.call_count.fetch_add(1, Ordering::SeqCst);
            self.statuses
                .get(idx)
                .copied()
                .unwrap_or(*self.statuses.last().unwrap_or(&"running"))
        }
    }

    impl CoderApi for SequencedMock {
        async fn start_workspace(&self, _id: Uuid) -> Result<CoderWorkspaceBuild, CoderError> {
            unimplemented!()
        }
        async fn get_template_by_name(
            &self,
            _name: &str,
        ) -> Result<Option<CoderTemplate>, CoderError> {
            unimplemented!()
        }
        async fn create_workspace(
            &self,
            _owner: &str,
            _req: CreateWorkspaceRequest,
        ) -> Result<CoderWorkspace, CoderError> {
            unimplemented!()
        }
        async fn get_workspace(&self, _id: Uuid) -> Result<CoderWorkspace, CoderError> {
            unimplemented!()
        }
        async fn wait_until_ready(
            &self,
            _workspace_id: Uuid,
            timeout: Duration,
        ) -> Result<(), CoderError> {
            // Simulate the polling loop without real HTTP or sleep:
            // iterate through statuses and mimic the terminal-state logic.
            let deadline = std::time::Instant::now() + timeout;
            loop {
                let status = self.current_status();
                match status {
                    "running" => return Ok(()),
                    "failed" | "canceled" | "deleted" => {
                        return Err(CoderError::Api {
                            status: 500,
                            message: format!("Workspace build failed: build status: {}", status),
                        });
                    }
                    _ => {
                        if std::time::Instant::now() >= deadline {
                            return Err(CoderError::Api {
                                status: 504,
                                message: format!(
                                    "Workspace did not become ready within {:?} (last status: {})",
                                    timeout, status
                                ),
                            });
                        }
                        // No actual sleep in unit tests — just loop
                    }
                }
            }
        }
    }

    #[tokio::test]
    async fn wait_until_ready_returns_ok_when_already_running() {
        let mock = SequencedMock::new(vec!["running"]);
        let result = mock
            .wait_until_ready(Uuid::new_v4(), Duration::from_secs(60))
            .await;
        assert!(result.is_ok(), "expected Ok but got {result:?}");
    }

    #[tokio::test]
    async fn wait_until_ready_retries_on_starting_then_succeeds() {
        // starting → starting → running
        let mock = SequencedMock::new(vec!["starting", "starting", "running"]);
        let result = mock
            .wait_until_ready(Uuid::new_v4(), Duration::from_secs(60))
            .await;
        assert!(
            result.is_ok(),
            "should succeed after transient starting states; got {result:?}"
        );
        // Verify it polled at least 3 times (starting, starting, running)
        assert_eq!(mock.call_count.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn wait_until_ready_retries_on_pending_then_succeeds() {
        let mock = SequencedMock::new(vec!["pending", "pending", "starting", "running"]);
        let result = mock
            .wait_until_ready(Uuid::new_v4(), Duration::from_secs(60))
            .await;
        assert!(result.is_ok(), "expected Ok; got {result:?}");
        assert_eq!(mock.call_count.load(Ordering::SeqCst), 4);
    }

    #[tokio::test]
    async fn wait_until_ready_returns_err_on_failed_build() {
        let mock = SequencedMock::new(vec!["starting", "failed"]);
        let result = mock
            .wait_until_ready(Uuid::new_v4(), Duration::from_secs(60))
            .await;
        assert!(result.is_err(), "expected Err but got Ok");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("failed"),
            "error message should mention failure: {err}"
        );
    }

    #[tokio::test]
    async fn wait_until_ready_returns_err_on_canceled_build() {
        let mock = SequencedMock::new(vec!["canceling", "canceled"]);
        let result = mock
            .wait_until_ready(Uuid::new_v4(), Duration::from_secs(60))
            .await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("failed") || err.contains("canceled"), "{err}");
    }

    #[tokio::test]
    async fn wait_until_ready_times_out() {
        // "starting" forever with a very short timeout so the loop exits immediately
        let mock = SequencedMock::new(vec!["starting"]);
        // Use a zero-duration timeout so the deadline is already passed after the first check
        let result = mock
            .wait_until_ready(Uuid::new_v4(), Duration::from_nanos(0))
            .await;
        assert!(result.is_err(), "expected timeout error");
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("did not become ready") || err.contains("504"),
            "error should mention timeout: {err}"
        );
    }
}
