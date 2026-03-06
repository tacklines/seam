-- Many-to-many junction between sessions and tasks.
-- Tasks can appear in multiple sessions (sprint planning).

CREATE TABLE session_tasks (
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by   UUID REFERENCES users(id),
    PRIMARY KEY (session_id, task_id)
);

-- "Which sessions contain this task?" lookups
CREATE INDEX idx_session_tasks_task ON session_tasks (task_id);

-- Ordered listing within a session
CREATE INDEX idx_session_tasks_session ON session_tasks (session_id, added_at);

-- Backfill from existing tasks that were created in a session
INSERT INTO session_tasks (session_id, task_id)
SELECT session_id, id
FROM tasks
WHERE session_id IS NOT NULL;

-- Notify WebSocket layer on session-task changes
CREATE OR REPLACE FUNCTION notify_session_task_change() RETURNS TRIGGER AS $$
DECLARE
    sess_code TEXT;
    proj_id UUID;
BEGIN
    SELECT s.code, s.project_id INTO sess_code, proj_id
    FROM sessions s WHERE s.id = COALESCE(NEW.session_id, OLD.session_id);

    PERFORM pg_notify('task_changes', json_build_object(
        'type', CASE WHEN TG_OP = 'INSERT' THEN 'session_task_added' ELSE 'session_task_removed' END,
        'session_code', sess_code,
        'project_id', proj_id::text,
        'task_id', COALESCE(NEW.task_id, OLD.task_id)::text,
        'session_id', COALESCE(NEW.session_id, OLD.session_id)::text
    )::text);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_task_changed
    AFTER INSERT OR DELETE ON session_tasks
    FOR EACH ROW EXECUTE FUNCTION notify_session_task_change();
