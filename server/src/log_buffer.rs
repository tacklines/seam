use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogLine {
    pub line: String,
    pub fd: String,
    pub ts: String,
}

/// In-memory ring buffer for workspace log lines, keyed by participant_id or workspace_id.
pub struct LogBuffer {
    buffers: DashMap<Uuid, VecDeque<LogLine>>,
    max_lines: usize,
}

impl LogBuffer {
    pub fn new(max_lines: usize) -> Self {
        Self {
            buffers: DashMap::new(),
            max_lines,
        }
    }

    pub fn push(&self, key: Uuid, line: LogLine) {
        let mut buf = self.buffers.entry(key).or_insert_with(VecDeque::new);
        if buf.len() >= self.max_lines {
            buf.pop_front();
        }
        buf.push_back(line);
    }

    /// Push a log line under multiple keys (e.g. workspace_id + participant_id).
    pub fn push_multi(&self, keys: &[Uuid], line: LogLine) {
        for key in keys {
            self.push(*key, line.clone());
        }
    }

    pub fn recent(&self, key: Uuid, limit: usize) -> Vec<LogLine> {
        self.buffers
            .get(&key)
            .map(|buf| {
                let start = buf.len().saturating_sub(limit);
                buf.iter().skip(start).cloned().collect()
            })
            .unwrap_or_default()
    }

    pub fn remove(&self, key: &Uuid) {
        self.buffers.remove(key);
    }
}
