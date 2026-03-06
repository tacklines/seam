use lapin::{options::*, types::FieldTable, Channel, Consumer};
use futures::StreamExt;
use sqlx::PgPool;
use tracing::{info, warn, error};
use uuid::Uuid;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct BridgedEvent {
    id: i64,
    event_type: String,
    aggregate_type: String,
    payload: serde_json::Value,
    metadata: serde_json::Value,
    occurred_at: String,
}

#[derive(Debug, sqlx::FromRow)]
struct EventReaction {
    id: Uuid,
    project_id: Uuid,
    name: String,
    action_type: String,
    action_config: serde_json::Value,
    filter: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct LaunchAgentConfig {
    session_code: Option<String>,
    agent_type: Option<String>,
    skill: Option<String>,
    model: Option<String>,
    instructions: Option<String>,
}

/// Run the reactions consumer loop.
pub async fn run(pool: PgPool, channel: Channel) {
    info!("Reactions consumer starting");

    let consumer = match channel
        .basic_consume(
            "seam.reactions",
            "seam-worker-reactions",
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await
    {
        Ok(c) => c,
        Err(e) => {
            error!(error = %e, "Failed to start consuming from seam.reactions");
            return;
        }
    };

    info!("Reactions consumer listening on seam.reactions");
    consume_loop(pool, consumer).await;
}

async fn consume_loop(pool: PgPool, mut consumer: Consumer) {
    while let Some(delivery_result) = consumer.next().await {
        let delivery = match delivery_result {
            Ok(d) => d,
            Err(e) => {
                error!(error = %e, "Consumer delivery error");
                continue;
            }
        };

        let event: BridgedEvent = match serde_json::from_slice(&delivery.data) {
            Ok(e) => e,
            Err(e) => {
                warn!(error = %e, "Failed to deserialize event from queue");
                // Ack bad messages to avoid infinite redelivery (no DLX in v1)
                let _ = delivery.ack(BasicAckOptions::default()).await;
                continue;
            }
        };

        match handle_event(&pool, &event).await {
            Ok(matched) => {
                if matched > 0 {
                    info!(
                        event_id = event.id,
                        event_type = %event.event_type,
                        matched,
                        "Processed event reactions"
                    );
                }
            }
            Err(e) => {
                error!(
                    event_id = event.id,
                    error = %e,
                    "Failed to process event reactions"
                );
                // Still ack — no retry in v1, just log the failure
            }
        }

        let _ = delivery.ack(BasicAckOptions::default()).await;
    }
}

async fn handle_event(
    pool: &PgPool,
    event: &BridgedEvent,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    // Find matching reactions
    let reactions: Vec<EventReaction> = sqlx::query_as(
        "SELECT id, project_id, name, action_type, action_config, filter
         FROM event_reactions
         WHERE aggregate_type = $1
           AND event_type = $2
           AND enabled = true"
    )
    .bind(&event.aggregate_type)
    .bind(&event.event_type)
    .fetch_all(pool)
    .await?;

    let mut matched = 0;
    for reaction in &reactions {
        // Apply filter if present (simple top-level key match for v1)
        if !matches_filter(&event.payload, &reaction.filter) {
            continue;
        }

        info!(
            reaction_id = %reaction.id,
            reaction_name = %reaction.name,
            action_type = %reaction.action_type,
            "Dispatching reaction"
        );

        if let Err(e) = dispatch_action(pool, reaction, event).await {
            error!(
                reaction_id = %reaction.id,
                error = %e,
                "Failed to dispatch reaction action"
            );
        }

        matched += 1;
    }

    Ok(matched)
}

/// Simple filter: check that all top-level keys in filter exist in payload with matching values.
/// Empty filter matches everything.
fn matches_filter(payload: &serde_json::Value, filter: &serde_json::Value) -> bool {
    let filter_obj = match filter.as_object() {
        Some(obj) if !obj.is_empty() => obj,
        _ => return true, // empty or non-object filter matches all
    };

    let payload_obj = match payload.as_object() {
        Some(obj) => obj,
        None => return false,
    };

    filter_obj.iter().all(|(key, expected)| {
        payload_obj.get(key).map_or(false, |actual| actual == expected)
    })
}

async fn dispatch_action(
    _pool: &PgPool,
    reaction: &EventReaction,
    _event: &BridgedEvent,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    match reaction.action_type.as_str() {
        "launch_agent" => {
            let config: LaunchAgentConfig = serde_json::from_value(reaction.action_config.clone())?;
            info!(
                project_id = %reaction.project_id,
                agent_type = config.agent_type.as_deref().unwrap_or("coder"),
                skill = config.skill.as_deref().unwrap_or("none"),
                "Would launch agent (Coder integration required)"
            );
            // TODO: Wire into actual Coder workspace provisioning
            // This requires access to CoderClient and credentials, which the worker
            // will need injected. For now, log the intent.
            Ok(())
        }
        "webhook" => {
            info!(
                reaction_id = %reaction.id,
                "Webhook action not yet implemented"
            );
            Ok(())
        }
        "mcp_tool" => {
            info!(
                reaction_id = %reaction.id,
                "MCP tool action not yet implemented"
            );
            Ok(())
        }
        other => {
            warn!(action_type = other, "Unknown action type");
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_filter_empty() {
        let payload = serde_json::json!({"status": "open", "type": "bug"});
        let filter = serde_json::json!({});
        assert!(matches_filter(&payload, &filter));
    }

    #[test]
    fn test_matches_filter_match() {
        let payload = serde_json::json!({"status": "open", "type": "bug"});
        let filter = serde_json::json!({"status": "open"});
        assert!(matches_filter(&payload, &filter));
    }

    #[test]
    fn test_matches_filter_no_match() {
        let payload = serde_json::json!({"status": "closed", "type": "bug"});
        let filter = serde_json::json!({"status": "open"});
        assert!(!matches_filter(&payload, &filter));
    }

    #[test]
    fn test_matches_filter_missing_key() {
        let payload = serde_json::json!({"type": "bug"});
        let filter = serde_json::json!({"status": "open"});
        assert!(!matches_filter(&payload, &filter));
    }
}
