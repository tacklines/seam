-- Inference result fields populated by AI hooks after entity creation

ALTER TABLE tasks
    ADD COLUMN ai_triage JSONB,
    ADD COLUMN completion_summary TEXT;

ALTER TABLE task_comments
    ADD COLUMN intent TEXT;

ALTER TABLE sessions
    ADD COLUMN summary TEXT;
