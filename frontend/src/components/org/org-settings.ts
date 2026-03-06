import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { RouterLocation } from '@vaadin/router';
import {
  loadAndSelectOrg,
  getCurrentOrg,
  updateOrg,
  fetchMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  fetchCredentials,
  createCredential,
  rotateCredential,
  deleteCredential,
  type OrgView,
  type OrgMemberView,
  type CredentialView,
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
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
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

@customElement('org-settings')
export class OrgSettings extends LitElement {
  static styles = css`
    :host { display: block; flex: 1; }

    .container {
      min-height: 100%;
      padding: 2rem;
      background: var(--surface-1, #111320);
    }

    .inner {
      max-width: 56rem;
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
      text-decoration: none;
    }

    .back-link:hover { color: var(--text-primary); }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
    }

    /* ── General tab ── */
    .form-group {
      margin-bottom: 1.5rem;
      max-width: 400px;
    }

    /* ── Members tab ── */
    .member-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .member-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      background: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--sl-border-radius-medium);
    }

    .member-name {
      flex: 1;
      font-weight: 500;
      color: var(--text-primary);
    }

    .member-role {
      font-size: 0.8rem;
      color: var(--text-secondary);
      text-transform: capitalize;
    }

    .invite-row {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
      align-items: flex-end;
    }

    /* ── Credentials tab ── */
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

    sl-tab-group {
      --indicator-color: var(--sl-color-primary-500);
    }

    sl-tab-panel::part(base) {
      padding: 1.5rem 0;
    }
  `;

  location!: RouterLocation;

  @state() private _org: OrgView | null = null;
  @state() private _loading = true;
  @state() private _error = '';

  // Members
  @state() private _members: OrgMemberView[] = [];
  @state() private _inviteUsername = '';
  @state() private _inviteRole = 'member';
  @state() private _inviting = false;

  // Credentials
  @state() private _credentials: CredentialView[] = [];
  @state() private _showAddCred = false;
  @state() private _newCredName = '';
  @state() private _newCredType = 'claude_oauth';
  @state() private _newCredValue = '';
  @state() private _newCredEnvVar = '';
  @state() private _addingCred = false;

  // Rotate
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
      const slug = (this.location?.params as Record<string, string>)?.slug;
      this._org = await loadAndSelectOrg(slug);
      const [members, credentials] = await Promise.all([
        fetchMembers(this._org.slug),
        fetchCredentials(this._org.slug).catch(() => [] as CredentialView[]),
      ]);
      this._members = members;
      this._credentials = credentials;
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('orgSettings.errorLoad');
    } finally {
      this._loading = false;
    }
  }

  private _isOwner(): boolean {
    return this._org?.role === 'owner';
  }

  // --- Members ---

  private async _inviteMember() {
    if (!this._inviteUsername.trim() || !this._org) return;
    this._inviting = true;
    try {
      const member = await inviteMember(this._org.slug, this._inviteUsername.trim(), this._inviteRole);
      this._members = [...this._members, member];
      this._inviteUsername = '';
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('orgSettings.errorInvite');
    } finally {
      this._inviting = false;
    }
  }

  private async _changeRole(userId: string, role: string) {
    if (!this._org) return;
    try {
      await updateMemberRole(this._org.slug, userId, role);
      this._members = this._members.map((m) => (m.user_id === userId ? { ...m, role } : m));
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('orgSettings.errorUpdateRole');
    }
  }

  private async _removeMember(userId: string) {
    if (!this._org) return;
    try {
      await removeMember(this._org.slug, userId);
      this._members = this._members.filter((m) => m.user_id !== userId);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('orgSettings.errorRemoveMember');
    }
  }

  // --- Credentials ---

  private async _addCredential() {
    if (!this._newCredName.trim() || !this._newCredValue.trim() || !this._org) return;
    this._addingCred = true;
    try {
      const cred = await createCredential(this._org.slug, {
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
    if (!this._rotateValue.trim() || !this._rotatingId || !this._org) return;
    try {
      const updated = await rotateCredential(this._org.slug, this._rotatingId, this._rotateValue);
      this._credentials = this._credentials.map((c) => (c.id === updated.id ? updated : c));
      this._showRotateDialog = false;
      this._rotatingId = null;
      this._rotateValue = '';
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('cred.errorRotate');
    }
  }

  private async _deleteCred(id: string) {
    if (!this._org) return;
    try {
      await deleteCredential(this._org.slug, id);
      this._credentials = this._credentials.filter((c) => c.id !== id);
    } catch (err) {
      this._error = err instanceof Error ? err.message : t('cred.errorDelete');
    }
  }

  private _formatDate(iso: string | null): string {
    if (!iso) return t('cred.never');
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // --- Render ---

  private _renderMembersTab() {
    return html`
      <div class="member-list">
        ${this._members.map(
          (m) => html`
            <div class="member-row">
              <span class="member-name">${m.username}</span>
              <span class="member-role">${m.role}</span>
              ${this._isOwner() && m.role !== 'owner' ? html`
                <sl-select size="small" value=${m.role} @sl-change=${(e: CustomEvent) => this._changeRole(m.user_id, (e.target as HTMLSelectElement).value)}>
                  <sl-option value="admin">${t('orgSettings.role.admin')}</sl-option>
                  <sl-option value="member">${t('orgSettings.role.member')}</sl-option>
                </sl-select>
                <sl-tooltip content=${t('orgSettings.removeMember')}>
                  <sl-icon-button name="x-lg" @click=${() => this._removeMember(m.user_id)}></sl-icon-button>
                </sl-tooltip>
              ` : nothing}
            </div>
          `,
        )}
      </div>
      ${this._isOwner() || this._org?.role === 'admin' ? html`
        <div class="invite-row">
          <sl-input placeholder=${t('orgSettings.invitePlaceholder')} size="small" value=${this._inviteUsername}
                    @sl-input=${(e: CustomEvent) => { this._inviteUsername = (e.target as HTMLInputElement).value; }}
                    @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') void this._inviteMember(); }}
          ></sl-input>
          <sl-select size="small" value=${this._inviteRole} @sl-change=${(e: CustomEvent) => { this._inviteRole = (e.target as HTMLSelectElement).value; }}>
            <sl-option value="member">${t('orgSettings.role.member')}</sl-option>
            <sl-option value="admin">${t('orgSettings.role.admin')}</sl-option>
          </sl-select>
          <sl-button size="small" variant="primary" ?loading=${this._inviting} @click=${() => void this._inviteMember()}>
            <sl-icon slot="prefix" name="person-plus"></sl-icon>
            ${t('orgSettings.invite')}
          </sl-button>
        </div>
      ` : nothing}
    `;
  }

  private _renderCredentialsTab() {
    return html`
      ${this._credentials.length === 0 ? html`
        <div class="empty-state">
          <p>${t('cred.emptyTitle')}</p>
          <p style="font-size: 0.85rem;">${t('cred.emptyHint')}</p>
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
      <sl-dialog label=${t('cred.addDialog')} ?open=${this._showAddCred} @sl-after-hide=${() => { this._showAddCred = false; }}>
        <div class="dialog-form">
          <sl-input label=${t('cred.nameLabel')} placeholder=${t('cred.namePlaceholder')} value=${this._newCredName}
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
      <sl-dialog label=${t('cred.rotateDialog')} ?open=${this._showRotateDialog} @sl-after-hide=${() => { this._showRotateDialog = false; }}>
        <div class="dialog-form">
          <sl-input label=${t('cred.rotateNewValue')} type="password" placeholder=${t('cred.rotatePlaceholder')} value=${this._rotateValue}
                    @sl-input=${(e: CustomEvent) => { this._rotateValue = (e.target as HTMLInputElement).value; }}
          ></sl-input>
        </div>
        <sl-button slot="footer" variant="primary" @click=${() => void this._doRotate()}>
          ${t('cred.rotate')}
        </sl-button>
      </sl-dialog>
    `;
  }

  render() {
    if (this._loading) {
      return html`<div class="container"><div class="loading-container"><sl-spinner style="font-size: 2rem;"></sl-spinner></div></div>`;
    }

    const slug = this._org?.slug;

    return html`
      <div class="container">
        <div class="inner">
          <div class="page-header">
            <a class="back-link" @click=${() => navigateTo(`/orgs/${slug}`)}>
              <sl-icon name="arrow-left"></sl-icon>
            </a>
            <h1>${t('orgSettings.title', { name: this._org?.name ?? '' })}</h1>
          </div>

          ${this._error ? html`<sl-alert variant="danger" open style="margin-bottom: 1rem;">${this._error}</sl-alert>` : nothing}

          <sl-tab-group>
            <sl-tab slot="nav" panel="members">${t('orgSettings.tab.members')}</sl-tab>
            <sl-tab slot="nav" panel="credentials">${t('orgSettings.tab.credentials')}</sl-tab>

            <sl-tab-panel name="members">${this._renderMembersTab()}</sl-tab-panel>
            <sl-tab-panel name="credentials">${this._renderCredentialsTab()}</sl-tab-panel>
          </sl-tab-group>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'org-settings': OrgSettings;
  }
}
