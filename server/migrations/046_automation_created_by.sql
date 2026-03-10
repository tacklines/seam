-- Track which user created automated reactions and scheduled jobs
-- so that credential resolution can use the creating user's credentials
-- instead of falling back to org-only credentials.

ALTER TABLE event_reactions ADD COLUMN created_by_user_id UUID REFERENCES users(id);
ALTER TABLE scheduled_jobs ADD COLUMN created_by_user_id UUID REFERENCES users(id);
