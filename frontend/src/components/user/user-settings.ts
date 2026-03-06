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
import { t } from '../../lib/i18n.js';

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
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';

const CREDENTIAL_TYPE_KEYS: Record<string, string> = {
  claude_oauth: 'cred.type.claudeOauth',
  anthropic_api_key: 'cred.type.anthropicApiKey',
  openai_api_key: 'cred.type.openaiApiKey',
  google_api_key: 'cred.type.googleApiKey',
  git_token: 'cred.type.gitToken',
  ssh_key: 'cred.type.sshKey',
  custom: 'cred.type.custom',
};

const CREDENTIAL_TYPE_ENV: Record<string, string> = {
  claude_oauth: 'CLAUDE_CODE_OAUTH_TOKEN',
  anthropic_api_key: 'ANTHROPIC_API_KEY',
  openai_api_key: 'OPENAI_API_KEY',
  google_api_key: 'GOOGLE_API_KEY',
  git_token: 'GIT_TOKEN',
  ssh_key: 'SSH_PRIVATE_KEY',
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
      this._error = err instanceof Error ? err.message : t('userSettings.errorLoad');
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
      this._error = err instanceof Error ? err.message : t('cred.errorAdd');
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
      this._error = err instanceof Error ? err.message : t('cred.errorRotate');
    }
  }

  private async _deleteCred(id: string) {
    try {
      await deleteUserCredential(id);
      this._credentials = this._credentials.filter((c) => c.id !== id);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('cred.errorDelete');
    }
  }

  private _formatDate(iso: string | null): string {
    if (!iso) return t('cred.never');
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
            <h1>${t('userSettings.title')}</h1>
          </div>

          ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 1rem;">${this._error}</sl-alert>` : nothing}

          <div class="section-title">${t('userSettings.credTitle')}</div>
          <div class="section-desc">
            ${t('userSettings.credDesc')}
          </div>

          ${this._credentials.length === 0 ? html`
            <div class="empty-state">
              <p>${t('userSettings.emptyTitle')}</p>
              <p style="font-size: 0.85rem;">${t('userSettings.emptyHint')}</p>
            </div>
          ` : html`
            <div class="cred-list">
              ${this._credentials.map(
                (c) => html`
                  <div class="cred-row">
                    <div class="cred-info">
                      <div class="cred-name">${c.name}</div>
                      <div class="cred-meta">
                        <span class="cred-type-badge">${t(CREDENTIAL_TYPE_KEYS[c.credential_type] ?? c.credential_type)}</span>
                        ${c.env_var_name ? html`<span>${c.env_var_name}</span>` : html`<span>${CREDENTIAL_TYPE_ENV[c.credential_type] ?? ''}</span>`}
                        <span>${t('cred.added', { date: this._formatDate(c.created_at) })}</span>
                        ${c.rotated_at ? html`<span>${t('cred.rotated', { date: this._formatDate(c.rotated_at) })}</span>` : nothing}
                        ${c.expires_at ? html`<span>${t('cred.expires', { date: this._formatDate(c.expires_at) })}</span>` : nothing}
                      </div>
                    </div>
                    <div class="cred-actions">
                      <sl-tooltip content=${t('cred.rotateTooltip')}>
                        <sl-icon-button name="arrow-repeat" @click=${() => this._startRotate(c.id)}></sl-icon-button>
                      </sl-tooltip>
                      <sl-tooltip content=${t('cred.deleteTooltip')}>
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
              ${t('cred.addButton')}
            </sl-button>
          </div>

          <!-- Add credential dialog -->
          <sl-dialog label=${t('userSettings.addDialog')} ?open=${this._showAddCred} @sl-after-hide=${(e: Event) => { if (e.target === e.currentTarget) this._showAddCred = false; }}>
            <div class="dialog-form">
              <sl-input label=${t('cred.nameLabel')} placeholder=${t('userSettings.namePlaceholder')} value=${this._newCredName}
                        @sl-input=${(e: CustomEvent) => { this._newCredName = (e.target as HTMLInputElement).value; }}
              ></sl-input>
              <sl-select label=${t('cred.typeLabel')} value=${this._newCredType} @sl-change=${(e: CustomEvent) => { this._newCredType = (e.target as HTMLSelectElement).value; }}>
                ${Object.entries(CREDENTIAL_TYPE_KEYS).map(([val, key]) => html`<sl-option value=${val}>${t(key)}</sl-option>`)}
              </sl-select>
              ${this._newCredType === 'custom' ? html`
                <sl-input label=${t('cred.envVarLabel')} placeholder=${t('cred.envVarPlaceholder')} value=${this._newCredEnvVar}
                          @sl-input=${(e: CustomEvent) => { this._newCredEnvVar = (e.target as HTMLInputElement).value; }}
                ></sl-input>
              ` : html`
                <div style="font-size: 0.8rem; color: var(--text-tertiary);">
                  ${t('cred.injectedAs')} <code>${CREDENTIAL_TYPE_ENV[this._newCredType] ?? '?'}</code>
                </div>
              `}
              ${this._newCredType === 'ssh_key' ? html`
                <sl-textarea label=${t('cred.valueLabel')} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" rows="6"
                             value=${this._newCredValue} style="font-family: var(--sl-font-mono); font-size: 0.8rem;"
                             @sl-input=${(e: CustomEvent) => { this._newCredValue = (e.target as HTMLInputElement).value; }}
                ></sl-textarea>
              ` : html`
                <sl-input label=${t('cred.valueLabel')} type="password" placeholder=${t('cred.valuePlaceholder')} value=${this._newCredValue}
                          @sl-input=${(e: CustomEvent) => { this._newCredValue = (e.target as HTMLInputElement).value; }}
                ></sl-input>
              `}
            </div>
            <sl-button slot="footer" variant="primary" ?loading=${this._addingCred} @click=${() => void this._addCredential()}>
              ${t('cred.save')}
            </sl-button>
          </sl-dialog>

          <!-- Rotate dialog -->
          <sl-dialog label=${t('cred.rotateDialog')} ?open=${this._showRotateDialog} @sl-after-hide=${(e: Event) => { if (e.target === e.currentTarget) this._showRotateDialog = false; }}>
            <div class="dialog-form">
              <sl-input label=${t('cred.rotateNewValue')} type="password" placeholder=${t('cred.rotatePlaceholder')} value=${this._rotateValue}
                        @sl-input=${(e: CustomEvent) => { this._rotateValue = (e.target as HTMLInputElement).value; }}
              ></sl-input>
            </div>
            <sl-button slot="footer" variant="primary" @click=${() => void this._doRotate()}>
              ${t('cred.rotate')}
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
