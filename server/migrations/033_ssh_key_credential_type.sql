-- Add ssh_key to the credential_type CHECK constraints on both credential tables.

ALTER TABLE org_credentials DROP CONSTRAINT org_credentials_credential_type_check;
ALTER TABLE org_credentials ADD CONSTRAINT org_credentials_credential_type_check
    CHECK (credential_type IN (
        'claude_oauth', 'anthropic_api_key', 'openai_api_key',
        'google_api_key', 'git_token', 'ssh_key', 'custom'
    ));

ALTER TABLE user_credentials DROP CONSTRAINT user_credentials_credential_type_check;
ALTER TABLE user_credentials ADD CONSTRAINT user_credentials_credential_type_check
    CHECK (credential_type IN (
        'claude_oauth', 'anthropic_api_key', 'openai_api_key',
        'google_api_key', 'git_token', 'ssh_key', 'custom'
    ));
