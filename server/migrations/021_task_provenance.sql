-- Task provenance: commit tracking enforcement + source attribution
-- commit_sha (single) → commit_hashes (array), no_code_change flag, source_task_id

-- Add new columns
ALTER TABLE tasks ADD COLUMN commit_hashes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN no_code_change BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Migrate existing commit_sha data
UPDATE tasks SET commit_hashes = ARRAY[commit_sha] WHERE commit_sha IS NOT NULL AND commit_sha != '';

-- Drop old column
ALTER TABLE tasks DROP COLUMN commit_sha;

-- Index for provenance queries
CREATE INDEX idx_tasks_source ON tasks(source_task_id) WHERE source_task_id IS NOT NULL;
