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
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
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
        self.sessions
            .get(session_code)
            .map(|conns| {
                conns.iter()
                    .filter_map(|c| c.participant_id.clone())
                    .collect()
            })
            .unwrap_or_default()
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
    pub async fn broadcast_agent_stream(&self, session_code: &str, participant_id: &str, msg: &serde_json::Value) {
        let text = serde_json::to_string(msg).unwrap_or_default();
        if let Some(conns) = self.sessions.get(session_code) {
            for conn in conns.iter() {
                if conn.agent_subscriptions.contains(participant_id) {
                    let _ = conn.tx.send(text.clone());
                }
            }
        }
    }

    pub async fn send_to_participant(&self, session_code: &str, participant_id: &str, msg: &serde_json::Value) {
        let text = serde_json::to_string(msg).unwrap_or_default();
        if let Some(conns) = self.sessions.get(session_code) {
            for conn in conns.iter() {
                if conn.participant_id.as_deref() == Some(participant_id) {
                    let _ = conn.tx.send(text.clone());
                }
            }
        }
    }
}
