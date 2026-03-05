-- Mentions extracted from task comments
CREATE TABLE comment_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comment_mentions_participant ON comment_mentions(participant_id);
CREATE INDEX idx_comment_mentions_comment ON comment_mentions(comment_id);

-- Unread mentions (cleared when the user views them)
CREATE TABLE unread_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    comment_id UUID NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(participant_id, comment_id)
);

CREATE INDEX idx_unread_mentions_participant ON unread_mentions(participant_id);
