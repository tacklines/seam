mod models;

use clap::Parser;
use rmcp::{
    ErrorData as McpError,
    ServerHandler,
    ServiceExt,
    handler::server::tool::ToolRouter,
    model::*,
    tool, tool_router, tool_handler,
    handler::server::wrapper::Parameters,
    schemars::JsonSchema,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use models::*;

#[derive(Parser)]
#[command(name = "seam-mcp", about = "Seam MCP server for agent session access")]
struct Cli {
    /// Agent join code (8-character)
    #[arg(long)]
    agent_code: Option<String>,

    /// Display name for the agent
    #[arg(long)]
    agent_name: Option<String>,

    /// Database URL
    #[arg(long, env = "DATABASE_URL", default_value = "postgres://seam:seam@localhost:5433/seam")]
    database_url: String,
}

// --- Tool parameter schemas ---

#[derive(Debug, Deserialize, JsonSchema)]
struct JoinSessionParams {
    /// 8-character agent join code
    code: String,
    /// Display name for the agent in the session
    display_name: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetSessionParams {
    /// Session code (6-character). Omit to use your current session.
    code: Option<String>,
}

// --- MCP Server ---

#[derive(Clone)]
struct SeamMcp {
    db: PgPool,
    session_code: Option<String>,
    participant_id: Option<Uuid>,
    sponsor_name: Option<String>,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl SeamMcp {
    fn new(db: PgPool) -> Self {
        Self {
            db,
            session_code: None,
            participant_id: None,
            sponsor_name: None,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(description = "Join a Seam session using an agent join code. The code identifies both the session and your sponsoring user.")]
    async fn join_session(
        &self,
        Parameters(params): Parameters<JoinSessionParams>,
    ) -> Result<CallToolResult, McpError> {
        match self.do_agent_join(&params.code, params.display_name.as_deref()).await {
            Ok(result) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&result).unwrap(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(description = "Get session state including all participants. Provide session code or omit to use your current session.")]
    async fn get_session(
        &self,
        Parameters(params): Parameters<GetSessionParams>,
    ) -> Result<CallToolResult, McpError> {
        let code = match params.code.or_else(|| self.session_code.clone()) {
            Some(c) => c,
            None => return Ok(CallToolResult::error(vec![Content::text(
                "No session code provided and not currently in a session. Use join_session first.",
            )])),
        };

        match self.fetch_session(&code).await {
            Ok(session) => Ok(CallToolResult::success(vec![Content::text(
                serde_json::to_string_pretty(&session).unwrap(),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(e)])),
        }
    }

    #[tool(description = "Get your own participant info including ID, session code, and sponsor name. Only available after joining a session.")]
    async fn my_info(&self) -> Result<CallToolResult, McpError> {
        let Some(ref session_code) = self.session_code else {
            return Ok(CallToolResult::error(vec![Content::text(
                "Not in a session. Use join_session first.",
            )]));
        };

        let info = serde_json::json!({
            "participant_id": self.participant_id,
            "session_code": session_code,
            "sponsor_name": self.sponsor_name,
        });

        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(&info).unwrap(),
        )]))
    }
}

#[tool_handler]
impl ServerHandler for SeamMcp {}

// --- Internal helpers ---
impl SeamMcp {
    async fn do_agent_join(
        &self,
        code: &str,
        display_name: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let agent_code: AgentJoinCode = sqlx::query_as(
            "SELECT * FROM agent_join_codes WHERE code = $1",
        )
        .bind(code)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Invalid agent code".to_string())?;

        let session: Session = sqlx::query_as(
            "SELECT * FROM sessions WHERE id = $1 AND closed_at IS NULL",
        )
        .bind(agent_code.session_id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Session is closed or not found".to_string())?;

        let sponsor: Participant = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 AND user_id = $2 AND participant_type = 'human'",
        )
        .bind(session.id)
        .bind(agent_code.user_id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Sponsor participant not found".to_string())?;

        let sponsor_user: User = sqlx::query_as(
            "SELECT * FROM users WHERE id = $1",
        )
        .bind(agent_code.user_id)
        .fetch_one(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let existing_agent: Option<Participant> = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 AND sponsor_id = $2 AND participant_type = 'agent'",
        )
        .bind(session.id)
        .bind(sponsor.id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let participant_id = if let Some(existing) = existing_agent {
            existing.id
        } else {
            let name = display_name
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("{}'s Agent", sponsor_user.display_name));
            let pid = Uuid::new_v4();

            sqlx::query(
                "INSERT INTO participants (id, session_id, user_id, display_name, participant_type, sponsor_id, joined_at)
                 VALUES ($1, $2, $3, $4, 'agent', $5, NOW())",
            )
            .bind(pid)
            .bind(session.id)
            .bind(agent_code.user_id)
            .bind(&name)
            .bind(sponsor.id)
            .execute(&self.db)
            .await
            .map_err(|e| format!("Failed to create participant: {e}"))?;

            pid
        };

        let participants: Vec<Participant> = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at",
        )
        .bind(session.id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let participant_views: Vec<serde_json::Value> = participants
            .into_iter()
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "display_name": p.display_name,
                    "participant_type": p.participant_type,
                    "sponsor_id": p.sponsor_id,
                    "joined_at": p.joined_at,
                })
            })
            .collect();

        Ok(serde_json::json!({
            "session": {
                "id": session.id,
                "code": session.code,
                "name": session.name,
                "created_at": session.created_at,
                "participants": participant_views,
            },
            "participant_id": participant_id,
            "sponsor_name": sponsor_user.display_name,
        }))
    }

    async fn fetch_session(&self, code: &str) -> Result<serde_json::Value, String> {
        let session: Session = sqlx::query_as(
            "SELECT * FROM sessions WHERE code = $1 AND closed_at IS NULL",
        )
        .bind(code)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?
        .ok_or_else(|| "Session not found".to_string())?;

        let participants: Vec<Participant> = sqlx::query_as(
            "SELECT * FROM participants WHERE session_id = $1 ORDER BY joined_at",
        )
        .bind(session.id)
        .fetch_all(&self.db)
        .await
        .map_err(|e| format!("Database error: {e}"))?;

        let participant_views: Vec<serde_json::Value> = participants
            .into_iter()
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "display_name": p.display_name,
                    "participant_type": p.participant_type,
                    "sponsor_id": p.sponsor_id,
                    "joined_at": p.joined_at,
                })
            })
            .collect();

        Ok(serde_json::json!({
            "id": session.id,
            "code": session.code,
            "name": session.name,
            "created_at": session.created_at,
            "participants": participant_views,
        }))
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let cli = Cli::parse();

    eprintln!("[seam-mcp] Connecting to database...");
    let db = PgPool::connect(&cli.database_url)
        .await
        .expect("Failed to connect to database");

    let mut mcp = SeamMcp::new(db);

    // Auto-join if agent code provided
    if let Some(ref code) = cli.agent_code {
        eprintln!("[seam-mcp] Joining session with agent code {}...", &code[..3.min(code.len())]);
        match mcp.do_agent_join(code, cli.agent_name.as_deref()).await {
            Ok(result) => {
                let session_code = result["session"]["code"].as_str().unwrap().to_string();
                let participant_id = result["participant_id"].as_str()
                    .and_then(|s| Uuid::parse_str(s).ok());
                let sponsor_name = result["sponsor_name"].as_str().map(|s| s.to_string());

                eprintln!("[seam-mcp] Joined session {}", session_code);
                if let Some(ref name) = sponsor_name {
                    eprintln!("[seam-mcp] Sponsored by: {}", name);
                }

                mcp.session_code = Some(session_code);
                mcp.participant_id = participant_id;
                mcp.sponsor_name = sponsor_name;
            }
            Err(e) => {
                eprintln!("[seam-mcp] Failed to auto-join: {e}");
                eprintln!("[seam-mcp] Continuing — use join_session tool manually");
            }
        }
    }

    eprintln!("[seam-mcp] Starting stdio transport...");
    let transport = rmcp::transport::io::stdio();

    match mcp.serve(transport).await {
        Ok(server) => {
            if let Err(e) = server.waiting().await {
                eprintln!("[seam-mcp] Server stopped: {e}");
            }
        }
        Err(e) => {
            eprintln!("[seam-mcp] Failed to start: {e}");
            std::process::exit(1);
        }
    }
}
