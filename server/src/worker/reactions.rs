use futures::StreamExt;
use lapin::{options::*, types::FieldTable, Channel, Consumer};
use serde::Deserialize;
use sqlx::PgPool;
use tracing::{error, info, warn};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
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
    created_by_user_id: Option<Uuid>,
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
        "SELECT id, project_id, name, action_type, action_config, filter, created_by_user_id
         FROM event_reactions
         WHERE aggregate_type = $1
           AND event_type = $2
           AND enabled = true",
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

/// Filter matching with operator support.
///
/// Filter format supports two modes:
///
/// **Simple (backward-compatible)**: `{"key": "value"}` — top-level equality check.
///
/// **Operator mode**: `{"key": {"$op": "value"}}` where `$op` is one of:
/// - `$eq` — equals (same as simple mode)
/// - `$ne` — not equals
/// - `$exists` — key exists in payload (value should be `true` or `false`)
/// - `$in` — value is one of the provided array items
/// - `$contains` — string contains substring
///
/// All conditions are AND'd together. Empty filter matches everything.
fn matches_filter(payload: &serde_json::Value, filter: &serde_json::Value) -> bool {
    let filter_obj = match filter.as_object() {
        Some(obj) if !obj.is_empty() => obj,
        _ => return true,
    };

    let payload_obj = match payload.as_object() {
        Some(obj) => obj,
        None => return false,
    };

    filter_obj.iter().all(|(key, condition)| {
        match condition.as_object() {
            Some(ops) if ops.keys().any(|k| k.starts_with('$')) => {
                // Operator mode
                ops.iter().all(|(op, expected)| {
                    let actual = payload_obj.get(key);
                    match op.as_str() {
                        "$eq" => actual == Some(expected),
                        "$ne" => actual != Some(expected),
                        "$exists" => {
                            let should_exist = expected.as_bool().unwrap_or(true);
                            actual.is_some() == should_exist
                        }
                        "$in" => {
                            if let Some(arr) = expected.as_array() {
                                actual.is_some_and(|a| arr.contains(a))
                            } else {
                                false
                            }
                        }
                        "$contains" => {
                            if let (Some(haystack), Some(needle)) =
                                (actual.and_then(|a| a.as_str()), expected.as_str())
                            {
                                haystack.contains(needle)
                            } else {
                                false
                            }
                        }
                        unknown => {
                            tracing::warn!(operator = %unknown, "Unknown filter operator; treating as match");
                            true
                        }
                    }
                })
            }
            _ => {
                // Simple equality (backward-compatible)
                payload_obj.get(key) == Some(condition)
            }
        }
    })
}

async fn dispatch_action(
    pool: &PgPool,
    reaction: &EventReaction,
    event: &BridgedEvent,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ctx = super::actions::ActionContext {
        event_payload: Some(event.payload.clone()),
        project_id: reaction.project_id,
        source: format!("reaction:{}", reaction.name),
        user_id: reaction.created_by_user_id,
    };
    super::actions::dispatch(pool, &reaction.action_type, &reaction.action_config, &ctx).await
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

    #[test]
    fn test_filter_eq_operator() {
        let payload = serde_json::json!({"status": "open"});
        let filter = serde_json::json!({"status": {"$eq": "open"}});
        assert!(matches_filter(&payload, &filter));

        let filter_ne = serde_json::json!({"status": {"$eq": "closed"}});
        assert!(!matches_filter(&payload, &filter_ne));
    }

    #[test]
    fn test_filter_ne_operator() {
        let payload = serde_json::json!({"status": "open"});
        let filter = serde_json::json!({"status": {"$ne": "closed"}});
        assert!(matches_filter(&payload, &filter));

        let filter_fail = serde_json::json!({"status": {"$ne": "open"}});
        assert!(!matches_filter(&payload, &filter_fail));
    }

    #[test]
    fn test_filter_exists_operator() {
        let payload = serde_json::json!({"status": "open", "type": "bug"});

        let filter_exists = serde_json::json!({"status": {"$exists": true}});
        assert!(matches_filter(&payload, &filter_exists));

        let filter_not_exists = serde_json::json!({"description": {"$exists": false}});
        assert!(matches_filter(&payload, &filter_not_exists));

        let filter_missing = serde_json::json!({"description": {"$exists": true}});
        assert!(!matches_filter(&payload, &filter_missing));
    }

    #[test]
    fn test_filter_in_operator() {
        let payload = serde_json::json!({"priority": "p1"});
        let filter = serde_json::json!({"priority": {"$in": ["p0", "p1", "p2"]}});
        assert!(matches_filter(&payload, &filter));

        let filter_miss = serde_json::json!({"priority": {"$in": ["p3", "p4"]}});
        assert!(!matches_filter(&payload, &filter_miss));
    }

    #[test]
    fn test_filter_contains_operator() {
        let payload = serde_json::json!({"title": "Fix login page bug"});
        let filter = serde_json::json!({"title": {"$contains": "login"}});
        assert!(matches_filter(&payload, &filter));

        let filter_miss = serde_json::json!({"title": {"$contains": "dashboard"}});
        assert!(!matches_filter(&payload, &filter_miss));
    }

    #[test]
    fn test_filter_combined_operators() {
        let payload = serde_json::json!({"status": "open", "priority": "p1", "type": "bug"});
        let filter = serde_json::json!({
            "status": {"$eq": "open"},
            "priority": {"$in": ["p0", "p1"]},
            "description": {"$exists": false}
        });
        assert!(matches_filter(&payload, &filter));
    }

    #[test]
    fn test_filter_mixed_simple_and_operators() {
        let payload = serde_json::json!({"status": "open", "type": "bug"});
        let filter = serde_json::json!({
            "status": "open",
            "type": {"$ne": "feature"}
        });
        assert!(matches_filter(&payload, &filter));
    }
}
