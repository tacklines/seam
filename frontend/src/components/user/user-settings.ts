import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import {
  fetchUserCredentials,
  createUserCredential,
  rotateUserCredential,
  deleteUserCredential,
  type UserCredentialView,
} from '../../state/org-api.js';
import { navigateTo } from '../../router.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';

const CREDENTIAL_TYPE_LABELS: Record<string, string> = {
  claude_oauth: 'Claude OAuth Token',
  anthropic_api_key: 'Anthropic API Key',
  openai_api_key: 'OpenAI API Key',
  google_api_key: 'Google API Key',
  git_token: 'Git Token',
  custom: 'Custom',
};

const CREDENTIAL_TYPE_ENV: Record<string, string> = {
  claude_oauth: 'CLAUDE_CODE_OAUTH_TOKEN',
  anthropic_api_key: 'ANTHROPIC_API_KEY',
  openai_api_key: 'OPENAI_API_KEY',
  google_api_key: 'GOOGLE_API_KEY',
  git_token: 'GIT_TOKEN',
};

@customElement('user-settings')
export class UserSettings extends LitElement {
  static styles = css`
    :host { display: block; flex: 1; }

    .container {
      min-height: 100%;
      padding: 2rem;
      background: var(--surface-1, #111320);
    }

    .inner {
      max-width: 48rem;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }

    .page-header h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .back-link {
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.85rem;
    }

    .back-link:hover { color: var(--text-primary); }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
    }

    .section-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 0.5rem;
    }

    .section-desc {
      font-size: 0.85rem;
      color: var(--text-tertiary);
      margin-bottom: 1rem;
      line-height: 1.5;
    }

    .cred-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .cred-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
    }

    .cred-info {
      flex: 1;
      min-width: 0;
    }

    .cred-name {
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 0.15rem;
    }

    .cred-meta {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .cred-type-badge {
      font-family: var(--sl-font-mono);
      font-size: 0.7rem;
      background: var(--surface-active);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .cred-actions {
      display: flex;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-tertiary);
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  `;

  @state() private _loading = true;
  @state() private _error = '';
  @state() private _credentials: UserCredentialView[] = [];

  // Add dialog
  @state() private _showAddCred = false;
  @state() private _newCredName = '';
  @state() private _newCredType = 'claude_oauth';
  @state() private _newCredValue = '';
  @state() private _newCredEnvVar = '';
  @state() private _addingCred = false;

  // Rotate dialog
  @state() private _rotatingId: string | null = null;
  @state() private _rotateValue = '';
  @state() private _showRotateDialog = false;

  connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    this._loading = true;
    this._error = '';
    try {
      this._credentials = await fetchUserCredentials();
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to load';
    } finally {
      this._loading = false;
    }
  }

  private async _addCredential() {
    if (!this._newCredName.trim() || !this._newCredValue.trim()) return;
    this._addingCred = true;
    try {
      const cred = await createUserCredential({
        name: this._newCredName.trim(),
        credential_type: this._newCredType,
        value: this._newCredValue,
        env_var_name: this._newCredType === 'custom' ? this._newCredEnvVar.trim() || undefined : undefined,
      });
      this._credentials = [...this._credentials, cred];
      this._showAddCred = false;
      this._newCredName = '';
      this._newCredType = 'claude_oauth';
      this._newCredValue = '';
      this._newCredEnvVar = '';
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to add credential';
    } finally {
      this._addingCred = false;
    }
  }

  private _startRotate(id: string) {
    this._rotatingId = id;
    this._rotateValue = '';
    this._showRotateDialog = true;
  }

  private async _doRotate() {
    if (!this._rotateValue.trim() || !this._rotatingId) return;
    try {
      const updated = await rotateUserCredential(this._rotatingId, this._rotateValue);
      this._credentials = this._credentials.map((c) => (c.id === updated.id ? updated : c));
      this._showRotateDialog = false;
      this._rotatingId = null;
      this._rotateValue = '';
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to rotate';
    }
  }

  private async _deleteCred(id: string) {
    try {
      await deleteUserCredential(id);
      this._credentials = this._credentials.filter((c) => c.id !== id);
    } catch (err) {
      this._error = err instanceof Error ? err.message : 'Failed to delete';
    }
  }

  private _formatDate(iso: string | null): string {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  render() {
    if (this._loading) {
      return html`<div class="container"><div class="loading-container"><sl-spinner style="font-size: 2rem;"></sl-spinner></div></div>`;
    }

    return html`
      <div class="container">
        <div class="inner">
          <div class="page-header">
            <a class="back-link" @click=${() => navigateTo('/')}>
              <sl-icon name="arrow-left"></sl-icon>
            </a>
            <h1>Personal Settings</h1>
          </div>

          ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 1rem;">${this._error}</sl-alert>` : nothing}

          <div class="section-title">Personal Credentials</div>
          <div class="section-desc">
            Personal tokens like Claude Max/Pro OAuth are tied to your subscription and apply only to agents you launch.
            They override org-level credentials of the same type.
          </div>

          ${this._credentials.length === 0 ? html`
            <div class="empty-state">
              <p>No personal credentials stored yet.</p>
              <p style="font-size: 0.85rem;">Add your Claude Max OAuth token or other personal API keys.</p>
            </div>
          ` : html`
            <div class="cred-list">
              ${this._credentials.map(
                (c) => html`
                  <div class="cred-row">
                    <div class="cred-info">
                      <div class="cred-name">${c.name}</div>
                      <div class="cred-meta">
                        <span class="cred-type-badge">${CREDENTIAL_TYPE_LABELS[c.credential_type] ?? c.credential_type}</span>
                        ${c.env_var_name ? html`<span>${c.env_var_name}</span>` : html`<span>${CREDENTIAL_TYPE_ENV[c.credential_type] ?? ''}</span>`}
                        <span>Added ${this._formatDate(c.created_at)}</span>
                        ${c.rotated_at ? html`<span>Rotated ${this._formatDate(c.rotated_at)}</span>` : nothing}
                        ${c.expires_at ? html`<span>Expires ${this._formatDate(c.expires_at)}</span>` : nothing}
                      </div>
                    </div>
                    <div class="cred-actions">
                      <sl-tooltip content="Rotate value">
                        <sl-icon-button name="arrow-repeat" @click=${() => this._startRotate(c.id)}></sl-icon-button>
                      </sl-tooltip>
                      <sl-tooltip content="Delete">
                        <sl-icon-button name="trash" @click=${() => this._deleteCred(c.id)}></sl-icon-button>
                      </sl-tooltip>
                    </div>
                  </div>
                `,
              )}
            </div>
          `}

          <div style="margin-top: 1rem;">
            <sl-button size="small" variant="primary" @click=${() => { this._showAddCred = true; }}>
              <sl-icon slot="prefix" name="plus-lg"></sl-icon>
              Add Credential
            </sl-button>
          </div>

          <!-- Add credential dialog -->
          <sl-dialog label="Add Personal Credential" ?open=${this._showAddCred} @sl-after-hide=${() => { this._showAddCred = false; }}>
            <div class="dialog-form">
              <sl-input label="Name" placeholder="e.g. My Claude Max Token" value=${this._newCredName}
                        @sl-input=${(e: CustomEvent) => { this._newCredName = (e.target as HTMLInputElement).value; }}
              ></sl-input>
              <sl-select label="Type" value=${this._newCredType} @sl-change=${(e: CustomEvent) => { this._newCredType = (e.target as HTMLSelectElement).value; }}>
                ${Object.entries(CREDENTIAL_TYPE_LABELS).map(([val, label]) => html`<sl-option value=${val}>${label}</sl-option>`)}
              </sl-select>
              ${this._newCredType === 'custom' ? html`
                <sl-input label="Environment Variable Name" placeholder="MY_SECRET_KEY" value=${this._newCredEnvVar}
                          @sl-input=${(e: CustomEvent) => { this._newCredEnvVar = (e.target as HTMLInputElement).value; }}
                ></sl-input>
              ` : html`
                <div style="font-size: 0.8rem; color: var(--text-tertiary);">
                  Will be injected as <code>${CREDENTIAL_TYPE_ENV[this._newCredType] ?? '?'}</code>
                </div>
              `}
              <sl-input label="Value" type="password" placeholder="Paste your key or token" value=${this._newCredValue}
                        @sl-input=${(e: CustomEvent) => { this._newCredValue = (e.target as HTMLInputElement).value; }}
              ></sl-input>
            </div>
            <sl-button slot="footer" variant="primary" ?loading=${this._addingCred} @click=${() => void this._addCredential()}>
              Save
            </sl-button>
          </sl-dialog>

          <!-- Rotate dialog -->
          <sl-dialog label="Rotate Credential" ?open=${this._showRotateDialog} @sl-after-hide=${() => { this._showRotateDialog = false; }}>
            <div class="dialog-form">
              <sl-input label="New Value" type="password" placeholder="Paste the new key or token" value=${this._rotateValue}
                        @sl-input=${(e: CustomEvent) => { this._rotateValue = (e.target as HTMLInputElement).value; }}
              ></sl-input>
            </div>
            <sl-button slot="footer" variant="primary" @click=${() => void this._doRotate()}>
              Rotate
            </sl-button>
          </sl-dialog>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'user-settings': UserSettings;
  }
}
