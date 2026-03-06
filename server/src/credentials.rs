use sqlx::PgPool;
use uuid::Uuid;

/// Envelope encryption for org credentials.
///
/// Architecture:
///   Master KEK (env var) -> encrypts per-org DEKs -> DEKs encrypt credential values
///
/// This means key rotation at the master level only re-encrypts DEKs (one per org),
/// not every credential value.

#[derive(Debug, thiserror::Error)]
pub enum CredentialError {
    #[error("CREDENTIAL_MASTER_KEY not set")]
    MasterKeyMissing,
    #[error("invalid master key: {0}")]
    InvalidMasterKey(String),
    #[error("encryption failed: {0}")]
    #[allow(dead_code)]
    EncryptionFailed(String),
    #[error("decryption failed: {0}")]
    DecryptionFailed(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

/// Get the master Fernet key from the environment
fn master_fernet() -> Result<fernet::Fernet, CredentialError> {
    let key = std::env::var("CREDENTIAL_MASTER_KEY")
        .map_err(|_| CredentialError::MasterKeyMissing)?;
    fernet::Fernet::new(&key)
        .ok_or_else(|| CredentialError::InvalidMasterKey("not a valid Fernet key".into()))
}

/// Ensure an org has a DEK, creating one if needed. Returns the decrypted DEK.
async fn ensure_org_dek(pool: &PgPool, org_id: Uuid) -> Result<fernet::Fernet, CredentialError> {
    let master = master_fernet()?;

    // Try to fetch existing DEK
    let existing: Option<(Vec<u8>,)> = sqlx::query_as(
        "SELECT encrypted_dek FROM org_credential_keys WHERE org_id = $1"
    )
    .bind(org_id)
    .fetch_optional(pool)
    .await?;

    if let Some((encrypted_dek,)) = existing {
        let dek_str = String::from_utf8(encrypted_dek)
            .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
        let dek_key = master.decrypt(&dek_str)
            .map_err(|e| CredentialError::DecryptionFailed(format!("{e:?}")))?;
        let dek_key_str = String::from_utf8(dek_key)
            .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
        return fernet::Fernet::new(&dek_key_str)
            .ok_or_else(|| CredentialError::DecryptionFailed("invalid DEK".into()));
    }

    // Generate new DEK
    let dek_key = fernet::Fernet::generate_key();
    let encrypted_dek = master.encrypt(dek_key.as_bytes());

    sqlx::query(
        "INSERT INTO org_credential_keys (org_id, encrypted_dek, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (org_id) DO NOTHING"
    )
    .bind(org_id)
    .bind(encrypted_dek.as_bytes())
    .execute(pool)
    .await?;

    // Re-fetch to handle race: if another request inserted first, ON CONFLICT DO NOTHING
    // means our DEK was discarded. We must use the one actually stored in the DB.
    let stored: (Vec<u8>,) = sqlx::query_as(
        "SELECT encrypted_dek FROM org_credential_keys WHERE org_id = $1"
    )
    .bind(org_id)
    .fetch_one(pool)
    .await?;

    let stored_dek_str = String::from_utf8(stored.0)
        .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
    let stored_dek_key = master.decrypt(&stored_dek_str)
        .map_err(|e| CredentialError::DecryptionFailed(format!("{e:?}")))?;
    let stored_dek_key_str = String::from_utf8(stored_dek_key)
        .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
    fernet::Fernet::new(&stored_dek_key_str)
        .ok_or_else(|| CredentialError::DecryptionFailed("invalid stored DEK".into()))
}

/// Encrypt a credential value for an org
pub async fn encrypt_credential(
    pool: &PgPool,
    org_id: Uuid,
    plaintext: &[u8],
) -> Result<Vec<u8>, CredentialError> {
    let dek = ensure_org_dek(pool, org_id).await?;
    let ciphertext = dek.encrypt(plaintext);
    Ok(ciphertext.into_bytes())
}

/// Decrypt a credential value for an org
pub async fn decrypt_credential(
    pool: &PgPool,
    org_id: Uuid,
    ciphertext: &[u8],
) -> Result<Vec<u8>, CredentialError> {
    let dek = ensure_org_dek(pool, org_id).await?;
    let ct_str = String::from_utf8(ciphertext.to_vec())
        .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
    dek.decrypt(&ct_str)
        .map_err(|e| CredentialError::DecryptionFailed(format!("{e:?}")))
}

/// Credential type to environment variable name mapping
pub fn credential_env_var(credential_type: &str, custom_env_var: Option<&str>) -> Option<String> {
    match credential_type {
        "claude_oauth" => Some("CLAUDE_CODE_OAUTH_TOKEN".to_string()),
        "anthropic_api_key" => Some("ANTHROPIC_API_KEY".to_string()),
        "openai_api_key" => Some("OPENAI_API_KEY".to_string()),
        "google_api_key" => Some("GOOGLE_API_KEY".to_string()),
        "git_token" => Some("GIT_TOKEN".to_string()),
        "ssh_key" => Some("SSH_PRIVATE_KEY".to_string()),
        "custom" => custom_env_var.map(|s| s.to_string()),
        _ => None,
    }
}

/// Decrypt all credentials for an org and return as env var name -> value pairs.
/// Used when launching Coder workspaces.
pub async fn decrypt_org_credentials(
    pool: &PgPool,
    org_id: Uuid,
) -> Result<Vec<(String, String)>, CredentialError> {
    let rows: Vec<(String, Vec<u8>, Option<String>)> = sqlx::query_as(
        "SELECT credential_type, encrypted_value, env_var_name
         FROM org_credentials
         WHERE org_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())"
    )
    .bind(org_id)
    .fetch_all(pool)
    .await?;

    let mut env_vars = Vec::new();
    for (cred_type, encrypted_value, custom_env) in rows {
        if let Some(env_name) = credential_env_var(&cred_type, custom_env.as_deref()) {
            let plaintext = decrypt_credential(pool, org_id, &encrypted_value).await?;
            let value = String::from_utf8(plaintext)
                .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
            env_vars.push((env_name, value));
        }
    }

    Ok(env_vars)
}

// --- User-level credential functions ---

/// Ensure a user has a DEK, creating one if needed. Returns the decrypted DEK.
async fn ensure_user_dek(pool: &PgPool, user_id: Uuid) -> Result<fernet::Fernet, CredentialError> {
    let master = master_fernet()?;

    let existing: Option<(Vec<u8>,)> = sqlx::query_as(
        "SELECT encrypted_dek FROM user_credential_keys WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    if let Some((encrypted_dek,)) = existing {
        let dek_str = String::from_utf8(encrypted_dek)
            .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
        let dek_key = master.decrypt(&dek_str)
            .map_err(|e| CredentialError::DecryptionFailed(format!("{e:?}")))?;
        let dek_key_str = String::from_utf8(dek_key)
            .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
        return fernet::Fernet::new(&dek_key_str)
            .ok_or_else(|| CredentialError::DecryptionFailed("invalid DEK".into()));
    }

    let dek_key = fernet::Fernet::generate_key();
    let encrypted_dek = master.encrypt(dek_key.as_bytes());

    sqlx::query(
        "INSERT INTO user_credential_keys (user_id, encrypted_dek, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO NOTHING"
    )
    .bind(user_id)
    .bind(encrypted_dek.as_bytes())
    .execute(pool)
    .await?;

    // Re-fetch to handle race: if another request inserted first, ON CONFLICT DO NOTHING
    // means our DEK was discarded. We must use the one actually stored in the DB.
    let stored: (Vec<u8>,) = sqlx::query_as(
        "SELECT encrypted_dek FROM user_credential_keys WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let stored_dek_str = String::from_utf8(stored.0)
        .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
    let stored_dek_key = master.decrypt(&stored_dek_str)
        .map_err(|e| CredentialError::DecryptionFailed(format!("{e:?}")))?;
    let stored_dek_key_str = String::from_utf8(stored_dek_key)
        .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
    fernet::Fernet::new(&stored_dek_key_str)
        .ok_or_else(|| CredentialError::DecryptionFailed("invalid stored DEK".into()))
}

/// Encrypt a credential value for a user
pub async fn encrypt_user_credential(
    pool: &PgPool,
    user_id: Uuid,
    plaintext: &[u8],
) -> Result<Vec<u8>, CredentialError> {
    let dek = ensure_user_dek(pool, user_id).await?;
    let ciphertext = dek.encrypt(plaintext);
    Ok(ciphertext.into_bytes())
}

/// Decrypt a credential value for a user
pub async fn decrypt_user_credential(
    pool: &PgPool,
    user_id: Uuid,
    ciphertext: &[u8],
) -> Result<Vec<u8>, CredentialError> {
    let dek = ensure_user_dek(pool, user_id).await?;
    let ct_str = String::from_utf8(ciphertext.to_vec())
        .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
    dek.decrypt(&ct_str)
        .map_err(|e| CredentialError::DecryptionFailed(format!("{e:?}")))
}

/// Decrypt all credentials for a user and return as env var name -> value pairs.
pub async fn decrypt_user_credentials(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<(String, String)>, CredentialError> {
    let rows: Vec<(String, Vec<u8>, Option<String>)> = sqlx::query_as(
        "SELECT credential_type, encrypted_value, env_var_name
         FROM user_credentials
         WHERE user_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())"
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    let mut env_vars = Vec::new();
    for (cred_type, encrypted_value, custom_env) in rows {
        if let Some(env_name) = credential_env_var(&cred_type, custom_env.as_deref()) {
            let plaintext = decrypt_user_credential(pool, user_id, &encrypted_value).await?;
            let value = String::from_utf8(plaintext)
                .map_err(|e| CredentialError::DecryptionFailed(e.to_string()))?;
            env_vars.push((env_name, value));
        }
    }

    Ok(env_vars)
}

/// Merge org + user credentials for workspace launch.
/// User credentials override org credentials for the same env var name.
pub async fn credentials_for_workspace(
    pool: &PgPool,
    org_id: Uuid,
    user_id: Uuid,
) -> Result<Vec<(String, String)>, CredentialError> {
    let mut env_map = std::collections::HashMap::new();

    // Start with org credentials (lower priority)
    match decrypt_org_credentials(pool, org_id).await {
        Ok(creds) => {
            for (k, v) in creds {
                env_map.insert(k, v);
            }
        }
        Err(e) => {
            tracing::warn!("Failed to decrypt org credentials: {e}");
        }
    }

    // Override with user credentials (higher priority)
    match decrypt_user_credentials(pool, user_id).await {
        Ok(creds) => {
            for (k, v) in creds {
                env_map.insert(k, v);
            }
        }
        Err(e) => {
            tracing::warn!("Failed to decrypt user credentials: {e}");
        }
    }

    Ok(env_map.into_iter().collect())
}

/// Check if the credential master key is configured
pub fn is_configured() -> bool {
    std::env::var("CREDENTIAL_MASTER_KEY").is_ok()
}
