use axum::{
    extract::{State, WebSocketUpgrade, ws::{Message, WebSocket}},
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::AppState;

pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let conn_id = Uuid::new_v4().to_string();
    let mut session_code: Option<String> = None;

    // Spawn task to forward messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Process incoming messages
    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    let msg_type = parsed.get("type").and_then(|t| t.as_str());

                    match msg_type {
                        Some("join") => {
                            if let Some(code) = parsed.get("sessionCode").and_then(|c| c.as_str()) {
                                // Remove from old session if any
                                if let Some(ref old_code) = session_code {
                                    state.connections.remove_connection(old_code, &conn_id);
                                }

                                session_code = Some(code.to_string());
                                state.connections.add_connection(code, &conn_id, tx.clone());

                                let _ = tx.send(serde_json::json!({
                                    "type": "joined",
                                    "sessionCode": code,
                                }).to_string());
                            }
                        }
                        Some("ping") => {
                            let _ = tx.send(serde_json::json!({ "type": "pong" }).to_string());
                        }
                        _ => {}
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    // Clean up
    if let Some(ref code) = session_code {
        state.connections.remove_connection(code, &conn_id);
    }
    send_task.abort();
}
