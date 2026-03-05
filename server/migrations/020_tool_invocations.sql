-- Tool invocation audit log for MCP calls
CREATE TABLE tool_invocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id),
    participant_id UUID NOT NULL REFERENCES participants(id),
    tool_name TEXT NOT NULL,
    request_params JSONB,
    response JSONB,
    is_error BOOLEAN NOT NULL DEFAULT false,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_invocations_session ON tool_invocations(session_id, created_at DESC);
CREATE INDEX idx_tool_invocations_participant ON tool_invocations(participant_id, created_at DESC);

-- Real-time notification trigger
CREATE OR REPLACE FUNCTION notify_tool_invocation() RETURNS trigger AS $$
DECLARE
    session_code TEXT;
BEGIN
    SELECT code INTO session_code FROM sessions WHERE id = NEW.session_id;
    PERFORM pg_notify('tool_invocations', json_build_object(
        'id', NEW.id,
        'session_code', session_code,
        'session_id', NEW.session_id,
        'participant_id', NEW.participant_id,
        'tool_name', NEW.tool_name,
        'is_error', NEW.is_error,
        'duration_ms', NEW.duration_ms,
        'created_at', NEW.created_at
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tool_invocation_notify
    AFTER INSERT ON tool_invocations
    FOR EACH ROW EXECUTE FUNCTION notify_tool_invocation();
