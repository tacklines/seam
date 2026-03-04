pub mod handler;

use dashmap::DashMap;
use futures::SinkExt;
use std::sync::Arc;
use tokio::sync::mpsc;

type Tx = mpsc::UnboundedSender<String>;

pub struct ConnectionManager {
    /// session_code -> list of senders
    sessions: DashMap<String, Vec<(String, Tx)>>,
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
            .push((conn_id.to_string(), tx));
    }

    pub fn remove_connection(&self, session_code: &str, conn_id: &str) {
        if let Some(mut conns) = self.sessions.get_mut(session_code) {
            conns.retain(|(id, _)| id != conn_id);
            if conns.is_empty() {
                drop(conns);
                self.sessions.remove(session_code);
            }
        }
    }

    pub async fn broadcast_to_session(&self, session_code: &str, msg: &serde_json::Value) {
        let text = serde_json::to_string(msg).unwrap_or_default();
        if let Some(conns) = self.sessions.get(session_code) {
            for (_, tx) in conns.iter() {
                let _ = tx.send(text.clone());
            }
        }
    }
}
