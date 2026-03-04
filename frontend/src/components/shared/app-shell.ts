import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { authStore, type AuthState } from '../../state/auth-state.js';
import { store, type AppState } from '../../state/app-state.js';

import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';

import '../session/session-lobby.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      min-height: 100dvh;
    }

    .auth-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 1rem;
      color: var(--text-secondary);
    }

    .login-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 1.5rem;
      background: var(--surface-1);
    }

    .login-screen h1 {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.025em;
    }

    .login-screen p {
      color: var(--text-secondary);
      max-width: 24rem;
      text-align: center;
    }

    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 1rem;
      background: var(--surface-0);
      border-bottom: 1px solid var(--border-subtle);
    }

    .top-bar-brand {
      font-weight: 600;
      font-size: 1rem;
      color: var(--text-primary);
    }

    .top-bar-user {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
  `;

  @state() private _authState: AuthState = authStore.get();
  @state() private _appState: AppState = store.get();

  private _authUnsub: (() => void) | null = null;
  private _appUnsub: (() => void) | null = null;

  connectedCallback() {
    super.connectedCallback();

    this._authUnsub = authStore.subscribe((event) => {
      this._authState = authStore.get();
    });

    this._appUnsub = store.subscribe((event) => {
      this._appState = store.get();
    });

    // Handle OIDC callback
    if (window.location.pathname === '/auth/callback') {
      authStore.handleCallback();
    } else {
      authStore.initialize();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._authUnsub?.();
    this._appUnsub?.();
  }

  render() {
    if (this._authState.isLoading) {
      return html`
        <div class="auth-loading">
          <sl-spinner style="font-size: 2rem;"></sl-spinner>
          <span>Authenticating...</span>
        </div>
      `;
    }

    if (!this._authState.isAuthenticated) {
      return html`
        <div class="login-screen">
          <h1>Seam</h1>
          <p>Collaborative sessions where humans and AI agents work together.</p>
          <sl-button variant="primary" size="large" @click=${() => authStore.login()}>
            <sl-icon slot="prefix" name="box-arrow-in-right"></sl-icon>
            Sign in
          </sl-button>
          ${this._authState.error
            ? html`<p style="color: var(--sl-color-danger-500);">${this._authState.error}</p>`
            : nothing}
        </div>
      `;
    }

    return html`
      <div class="top-bar">
        <span class="top-bar-brand">Seam</span>
        <div class="top-bar-user">
          <span>${this._authState.user?.name}</span>
          <sl-button size="small" variant="text" @click=${() => authStore.logout()}>
            Sign out
          </sl-button>
        </div>
      </div>
      <session-lobby></session-lobby>
    `;
  }
}
