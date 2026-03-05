-- Agent questions: agents ask, humans answer in real time

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id),
    asked_by UUID NOT NULL REFERENCES participants(id),
    directed_to UUID REFERENCES participants(id),
    question_text TEXT NOT NULL,
    context JSONB,
    answer_text TEXT,
    answered_by UUID REFERENCES participants(id),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'answered', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_questions_session_status ON questions(session_id, status);
CREATE INDEX idx_questions_directed_to ON questions(directed_to) WHERE directed_to IS NOT NULL;

-- Notify on question changes via the existing task_changes channel
CREATE OR REPLACE FUNCTION notify_question_change() RETURNS trigger AS $$
DECLARE
    sess_code TEXT;
    event_type TEXT;
    payload JSON;
BEGIN
    SELECT code INTO sess_code FROM sessions WHERE id = NEW.session_id;

    IF sess_code IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        event_type := 'question_asked';
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'answered' AND OLD.status = 'pending' THEN
        event_type := 'question_answered';
    ELSE
        RETURN NEW;
    END IF;

    payload := json_build_object(
        'type', event_type,
        'session_code', sess_code,
        'question_id', NEW.id::text
    );

    PERFORM pg_notify('task_changes', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_change_trigger
    AFTER INSERT OR UPDATE ON questions
    FOR EACH ROW
    EXECUTE FUNCTION notify_question_change();
