pub mod handler;

use dashmap::DashMap;
use std::collections::HashSet;
use tokio::sync::mpsc;

type Tx = mpsc::UnboundedSender<String>;

#[derive(Clone)]
pub struct ConnInfo {
    pub conn_id: String,
    pub participant_id: Option<String>,
    /// Participant IDs this connection is subscribed to for agent streams
    pub agent_subscriptions: HashSet<String>,
    pub tx: Tx,
}

pub struct ConnectionManager {
    /// session_code -> list of connections
    sessions: DashMap<String, Vec<ConnInfo>>,
    /// MCP-connected agent participant IDs (session_code -> set of participant_id strings)
    mcp_agents: DashMap<String, HashSet<String>>,
    /// project_id -> list of senders for project-level broadcasts (e.g. metrics updates)
    project_subscribers: DashMap<String, Vec<ProjectSub>>,
}

#[derive(Clone)]
pub struct ProjectSub {
    pub conn_id: String,
    pub tx: Tx,
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
            mcp_agents: DashMap::new(),
            project_subscribers: DashMap::new(),
        }
    }

    pub fn add_connection(&self, session_code: &str, conn_id: &str, tx: Tx) {
        self.sessions
            .entry(session_code.to_string())
            .or_default()
            .push(ConnInfo {
                conn_id: conn_id.to_string(),
                participant_id: None,
                agent_subscriptions: HashSet::new(),
                tx,
            });
    }

    pub fn set_participant_id(&self, session_code: &str, conn_id: &str, participant_id: &str) {
        if let Some(mut conns) = self.sessions.get_mut(session_code) {
            if let Some(conn) = conns.iter_mut().find(|c| c.conn_id == conn_id) {
                conn.participant_id = Some(participant_id.to_string());
            }
        }
    }

    pub fn remove_connection(&self, session_code: &str, conn_id: &str) -> Option<String> {
        let mut removed_participant_id = None;
        if let Some(mut conns) = self.sessions.get_mut(session_code) {
            if let Some(conn) = conns.iter().find(|c| c.conn_id == conn_id) {
                removed_participant_id = conn.participant_id.clone();
            }
            conns.retain(|c| c.conn_id != conn_id);
            if conns.is_empty() {
                drop(conns);
                self.sessions.remove(session_code);
            }
        }
        removed_participant_id
    }

    pub fn online_participant_ids(&self, session_code: &str) -> Vec<String> {
        let mut ids: Vec<String> = self
            .sessions
            .get(session_code)
            .map(|conns| {
                conns
                    .iter()
                    .filter_map(|c| c.participant_id.clone())
                    .collect()
            })
            .unwrap_or_default();
        // Include MCP-connected agents
        if let Some(agents) = self.mcp_agents.get(session_code) {
            ids.extend(agents.iter().cloned());
        }
        ids
    }

    /// Returns participant IDs that are currently online across all sessions.
    pub fn all_online_participant_ids(&self) -> std::collections::HashSet<uuid::Uuid> {
        let mut ids = std::collections::HashSet::new();
        for entry in self.sessions.iter() {
            for conn in entry.value().iter() {
                if let Some(ref pid) = conn.participant_id {
                    if let Ok(uuid) = pid.parse::<uuid::Uuid>() {
                        ids.insert(uuid);
                    }
                }
            }
        }
        // Include MCP-connected agents
        for entry in self.mcp_agents.iter() {
            for pid in entry.value().iter() {
                if let Ok(uuid) = pid.parse::<uuid::Uuid>() {
                    ids.insert(uuid);
                }
            }
        }
        ids
    }

    pub async fn broadcast_to_session(&self, session_code: &str, msg: &serde_json::Value) {
        let text = serde_json::to_string(msg).unwrap_or_default();
        if let Some(conns) = self.sessions.get(session_code) {
            for conn in conns.iter() {
                let _ = conn.tx.send(text.clone());
            }
        }
    }

    pub fn subscribe_agent(&self, session_code: &str, conn_id: &str, participant_id: &str) {
        if let Some(mut conns) = self.sessions.get_mut(session_code) {
            if let Some(conn) = conns.iter_mut().find(|c| c.conn_id == conn_id) {
                conn.agent_subscriptions.insert(participant_id.to_string());
            }
        }
    }

    pub fn unsubscribe_agent(&self, session_code: &str, conn_id: &str, participant_id: &str) {
        if let Some(mut conns) = self.sessions.get_mut(session_code) {
            if let Some(conn) = conns.iter_mut().find(|c| c.conn_id == conn_id) {
                conn.agent_subscriptions.remove(participant_id);
            }
        }
    }

    /// Broadcast an agent stream message only to connections subscribed to this participant
    pub async fn broadcast_agent_stream(
        &self,
        session_code: &str,
        participant_id: &str,
        msg: &serde_json::Value,
    ) {
        let text = serde_json::to_string(msg).unwrap_or_default();
        if let Some(conns) = self.sessions.get(session_code) {
            for conn in conns.iter() {
                if conn.agent_subscriptions.contains(participant_id) {
                    let _ = conn.tx.send(text.clone());
                }
            }
        }
    }

    /// Register an MCP-connected agent as online
    pub fn set_mcp_agent_online(&self, session_code: &str, participant_id: &str) {
        self.mcp_agents
            .entry(session_code.to_string())
            .or_default()
            .insert(participant_id.to_string());
    }

    /// Remove an MCP-connected agent from the online set
    pub fn set_mcp_agent_offline(&self, session_code: &str, participant_id: &str) {
        if let Some(mut agents) = self.mcp_agents.get_mut(session_code) {
            agents.remove(participant_id);
            if agents.is_empty() {
                drop(agents);
                self.mcp_agents.remove(session_code);
            }
        }
    }

    pub async fn send_to_participant(
        &self,
        session_code: &str,
        participant_id: &str,
        msg: &serde_json::Value,
    ) {
        let text = serde_json::to_string(msg).unwrap_or_default();
        if let Some(conns) = self.sessions.get(session_code) {
            for conn in conns.iter() {
                if conn.participant_id.as_deref() == Some(participant_id) {
                    let _ = conn.tx.send(text.clone());
                }
            }
        }
    }

    /// Subscribe a connection to project-level broadcasts (e.g. metrics updates).
    pub fn subscribe_project(&self, project_id: &str, conn_id: &str, tx: Tx) {
        self.project_subscribers
            .entry(project_id.to_string())
            .or_default()
            .push(ProjectSub {
                conn_id: conn_id.to_string(),
                tx,
            });
    }

    /// Unsubscribe a connection from project-level broadcasts.
    pub fn unsubscribe_project(&self, project_id: &str, conn_id: &str) {
        if let Some(mut subs) = self.project_subscribers.get_mut(project_id) {
            subs.retain(|s| s.conn_id != conn_id);
            if subs.is_empty() {
                drop(subs);
                self.project_subscribers.remove(project_id);
            }
        }
    }

    /// Broadcast a message to all connections subscribed to a project.
    pub async fn broadcast_to_project(&self, project_id: &str, msg: &serde_json::Value) {
        let text = serde_json::to_string(msg).unwrap_or_default();
        if let Some(subs) = self.project_subscribers.get(project_id) {
            for sub in subs.iter() {
                let _ = sub.tx.send(text.clone());
            }
        }
    }
}
