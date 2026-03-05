-- Immutable, append-only domain event ledger
CREATE TABLE domain_events (
    id BIGSERIAL PRIMARY KEY,               -- monotonic sequence for ordering
    event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),  -- globally unique event ID
    event_type TEXT NOT NULL,                -- e.g. 'project.created', 'task.status_changed'
    aggregate_type TEXT NOT NULL,            -- e.g. 'project', 'task', 'session'
    aggregate_id UUID NOT NULL,             -- ID of the entity this event is about
    actor_id UUID,                          -- who/what caused this (user, agent, system)
    payload JSONB NOT NULL DEFAULT '{}',    -- event-specific data
    metadata JSONB NOT NULL DEFAULT '{}',   -- correlation IDs, causation, trace info
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- NO UPDATE/DELETE — this is append-only
    CONSTRAINT domain_events_no_empty_type CHECK (event_type != ''),
    CONSTRAINT domain_events_no_empty_aggregate CHECK (aggregate_type != '')
);

-- Indexes for common query patterns
CREATE INDEX idx_domain_events_aggregate ON domain_events(aggregate_type, aggregate_id, id);
CREATE INDEX idx_domain_events_type ON domain_events(event_type, id);
CREATE INDEX idx_domain_events_occurred ON domain_events(occurred_at);

-- PG NOTIFY trigger for real-time subscribers
CREATE OR REPLACE FUNCTION notify_domain_event() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify('domain_events', json_build_object(
        'id', NEW.id,
        'event_id', NEW.event_id,
        'event_type', NEW.event_type,
        'aggregate_type', NEW.aggregate_type,
        'aggregate_id', NEW.aggregate_id
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER domain_event_notify
    AFTER INSERT ON domain_events
    FOR EACH ROW EXECUTE FUNCTION notify_domain_event();
