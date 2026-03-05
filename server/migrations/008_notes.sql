-- Session-scoped shared notes / scratchpad

CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    updated_by UUID REFERENCES participants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, slug)
);

CREATE INDEX idx_notes_session ON notes(session_id);

-- Notify on note changes
CREATE OR REPLACE FUNCTION notify_note_change() RETURNS trigger AS $$
DECLARE
    sess_code TEXT;
    payload JSON;
BEGIN
    SELECT code INTO sess_code FROM sessions WHERE id = NEW.session_id;
    IF sess_code IS NULL THEN RETURN NEW; END IF;

    payload := json_build_object(
        'type', 'note_updated',
        'session_code', sess_code,
        'note_id', NEW.id::text,
        'slug', NEW.slug
    );
    PERFORM pg_notify('task_changes', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER note_change_trigger
    AFTER INSERT OR UPDATE ON notes
    FOR EACH ROW
    EXECUTE FUNCTION notify_note_change();
