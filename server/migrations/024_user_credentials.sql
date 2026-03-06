-- User-level credentials (personal subscription tokens like Claude Max OAuth)
-- Separate from org credentials because these are tied to individual subscriptions,
-- not shared org resources.

CREATE TABLE user_credential_keys (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    encrypted_dek BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ
);

CREATE TABLE user_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    credential_type TEXT NOT NULL CHECK (credential_type IN (
        'claude_oauth', 'anthropic_api_key', 'openai_api_key',
        'google_api_key', 'git_token', 'custom'
    )),
    encrypted_value BYTEA NOT NULL,
    env_var_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    UNIQUE (user_id, name)
);

CREATE INDEX idx_user_credentials_user ON user_credentials(user_id);
