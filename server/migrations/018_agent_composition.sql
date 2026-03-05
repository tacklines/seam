-- Replace persistent agent identity with per-join composition metadata.
-- The agents table wrongly assumed UNIQUE(user_id, org_id) identity,
-- colliding when multiple agent processes join from the same user.

-- 1. Drop agent identity references
ALTER TABLE participants DROP COLUMN IF EXISTS agent_id;
ALTER TABLE agent_tokens DROP COLUMN IF EXISTS agent_id;
DROP TABLE IF EXISTS agents;

-- 2. Add composition metadata to participants (agent processes self-report on join)
ALTER TABLE participants ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS client_version TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- 3. Track disconnection for reconnect handling
ALTER TABLE participants ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;

-- 4. Indexes for composition queries
CREATE INDEX IF NOT EXISTS idx_participants_client ON participants(client_name) WHERE participant_type = 'agent';
CREATE INDEX IF NOT EXISTS idx_participants_model ON participants(model) WHERE participant_type = 'agent';
