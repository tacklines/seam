-- Task dependency relationships (blocker → blocked)
CREATE TABLE IF NOT EXISTS task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_self_dependency CHECK (blocker_id != blocked_id),
    CONSTRAINT unique_dependency UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_task_deps_blocker ON task_dependencies(blocker_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_blocked ON task_dependencies(blocked_id);

-- Notify on dependency changes
CREATE OR REPLACE FUNCTION notify_dependency_change() RETURNS trigger AS $$
DECLARE
    session_code TEXT;
BEGIN
    SELECT s.code INTO session_code
    FROM tasks t
    JOIN sessions s ON s.id = t.session_id
    WHERE t.id = COALESCE(NEW.blocked_id, OLD.blocked_id);

    IF session_code IS NOT NULL THEN
        PERFORM pg_notify('task_changes', json_build_object(
            'type', TG_ARGV[0],
            'session_code', session_code
        )::text);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dependency_created
    AFTER INSERT ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION notify_dependency_change('dependency_changed');

CREATE TRIGGER trg_dependency_deleted
    AFTER DELETE ON task_dependencies
    FOR EACH ROW EXECUTE FUNCTION notify_dependency_change('dependency_changed');
